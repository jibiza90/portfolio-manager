const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-southwest1', maxInstances: 5 });

const MASTER_EMAIL = 'jibiza90@gmail.com';

exports.setClientPassword = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesion.');
  }

  const callerEmail = String(auth.token.email || '').trim().toLowerCase();
  if (callerEmail !== MASTER_EMAIL) {
    throw new HttpsError('permission-denied', 'Solo el master puede cambiar passwords.');
  }

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
