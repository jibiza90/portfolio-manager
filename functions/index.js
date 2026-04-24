const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-southwest1', maxInstances: 5 });

const MASTER_EMAIL = 'jibiza90@gmail.com';
const CLIENT_LOGIN_DOMAIN = 'clients.portfolio-manager.local';

const normalizeLoginId = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const isValidLoginId = (value) => /^[a-z0-9]{4,20}$/.test(normalizeLoginId(value));
const buildClientAuthEmail = (loginId) => `${normalizeLoginId(loginId)}@${CLIENT_LOGIN_DOMAIN}`;

const assertMaster = (request, action) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesion.');
  }

  const callerEmail = String(auth.token.email || '').trim().toLowerCase();
  const emailVerified = auth.token.email_verified === true;
  if (callerEmail !== MASTER_EMAIL || !emailVerified) {
    throw new HttpsError('permission-denied', `Solo el master verificado puede ${action}.`);
  }
  return { auth, callerEmail };
};

exports.setClientPassword = onCall(async (request) => {
  const { auth, callerEmail } = assertMaster(request, 'cambiar passwords');

  const uid = String(request.data?.uid || '').trim();
  const password = String(request.data?.password || '');

  if (!uid) {
    throw new HttpsError('invalid-argument', 'Falta uid.');
  }
  if (!password || password.length < 6) {
    throw new HttpsError('invalid-argument', 'La password debe tener al menos 6 caracteres.');
  }

  const profileRef = admin.firestore().collection('access_profiles').doc(uid);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError('not-found', 'No existe access profile para ese usuario.');
  }

  const profile = profileSnap.data() || {};
  if (profile.role !== 'client') {
    throw new HttpsError('failed-precondition', 'Solo se puede cambiar la password de clientes.');
  }
  if (profile.active === false) {
    throw new HttpsError('failed-precondition', 'El cliente esta inactivo.');
  }

  try {
    await admin.auth().updateUser(uid, { password });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code || '') : '';
    if (code.includes('user-not-found')) {
      throw new HttpsError('not-found', 'El usuario no existe en Authentication.');
    }
    if (code.includes('invalid-password')) {
      throw new HttpsError('invalid-argument', 'Password invalida.');
    }
    throw new HttpsError('internal', 'No se pudo actualizar la password.');
  }

  const now = Date.now();
  await profileRef.set(
    {
      updatedAt: now,
      passwordManagedAt: now,
      passwordManagedBy: auth.uid,
      passwordManagedByEmail: callerEmail
    },
    { merge: true }
  );

  await admin.firestore().collection('admin_password_events').add({
    uid,
    clientId: profile.clientId || null,
    clientEmail: profile.email || null,
    changedByUid: auth.uid,
    changedByEmail: callerEmail,
    createdAt: now
  });

  return { ok: true };
});

exports.provisionClientAccess = onCall(async (request) => {
  const { auth, callerEmail } = assertMaster(request, 'crear accesos de cliente');

  const loginId = normalizeLoginId(request.data?.loginId);
  const password = String(request.data?.password || '');
  const clientId = String(request.data?.clientId || '').trim();
  const displayName = String(request.data?.displayName || '').trim();
  const email = buildClientAuthEmail(loginId);

  if (!isValidLoginId(loginId)) {
    throw new HttpsError('invalid-argument', 'Usuario invalido.');
  }
  if (!clientId) {
    throw new HttpsError('invalid-argument', 'Falta clientId.');
  }
  if (!password || password.length < 6) {
    throw new HttpsError('invalid-argument', 'La password debe tener al menos 6 caracteres.');
  }

  const now = Date.now();
  let userRecord = null;
  let createdAuthUser = false;

  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || loginId,
      emailVerified: true,
      disabled: false
    });
    createdAuthUser = true;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code || '') : '';
    if (code.includes('email-already-exists')) {
      userRecord = await admin.auth().getUserByEmail(email);
    } else if (code.includes('invalid-password')) {
      throw new HttpsError('invalid-argument', 'Password invalida.');
    } else {
      throw new HttpsError('internal', 'No se pudo crear el usuario.');
    }
  }

  if (!userRecord?.uid) {
    throw new HttpsError('internal', 'No se pudo resolver el usuario.');
  }

  const profileRef = admin.firestore().collection('access_profiles').doc(userRecord.uid);
  const profileSnap = await profileRef.get();
  const existingProfile = profileSnap.exists ? profileSnap.data() || {} : null;
  const linkedExistingProfile = !createdAuthUser;

  if (existingProfile && existingProfile.role && existingProfile.role !== 'client') {
    throw new HttpsError('failed-precondition', 'Ese usuario no es cliente.');
  }

  await profileRef.set(
    {
      role: 'client',
      clientId,
      displayName: displayName || null,
      email,
      loginId,
      active: true,
      updatedAt: now,
      createdAt: existingProfile?.createdAt || now
    },
    { merge: true }
  );

  await admin.firestore().collection('admin_access_events').add({
    uid: userRecord.uid,
    clientId,
    clientEmail: email,
    loginId,
    action: createdAuthUser ? 'created' : 'linked',
    changedByUid: auth.uid,
    changedByEmail: callerEmail,
    createdAt: now
  });

  return {
    ok: true,
    uid: userRecord.uid,
    createdAuthUser,
    linkedExistingProfile
  };
});
