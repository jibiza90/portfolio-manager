import { MonthlyHistoryEntry, PersistedState, PortfolioSnapshot } from '../types';
import { db, firebase, firebaseConfig, functions } from './firebaseApp';
import { buildClientReportData, toClientReportPayload } from '../utils/clientReport';

const DOC_PATH = 'portfolio/state';
const CLIENT_OVERVIEW_COLLECTION = 'portfolio_client_overviews';

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {}, monthlyHistoryByClient: {} };

const sanitizePersistedState = (data?: Partial<PersistedState> | null): PersistedState => ({
  finalByDay: data?.finalByDay ?? {},
  movementsByClient: data?.movementsByClient ?? {},
  monthlyHistoryByClient: data?.monthlyHistoryByClient ?? {}
});

const buildClientOverview = (
  snapshot: PortfolioSnapshot,
  clientId: string,
  clientName: string,
  monthlyHistory: Record<string, MonthlyHistoryEntry>
) => {
  const report = buildClientReportData(clientId, 'all', {}, snapshot, { [clientId]: monthlyHistory }, clientName);

  return {
    clientId,
    clientName: report?.name ?? clientName,
    report: report ? toClientReportPayload(report) : null,
    updatedAt: Date.now()
  };
};

export const fetchPortfolioState = async (): Promise<PersistedState> => {
  try {
    const doc = await db.doc(DOC_PATH).get();
    if (!doc.exists) return emptyPersisted;
    return sanitizePersistedState(doc.data() as Partial<PersistedState>);
  } catch (error) {
    console.error('Firestore fetch error', error);
    return emptyPersisted;
  }
};

export const savePortfolioState = async (state: PersistedState) => {
  // Overwrite the state document so deleted nested fields are really removed in Firestore.
  await db.doc(DOC_PATH).set(state);
};

export const syncClientOverviews = async (
  snapshot: PortfolioSnapshot,
  clients: Array<{ id: string; name: string }>,
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>
) => {
  const batch = db.batch();
  clients.forEach((client) => {
    const docRef = db.collection(CLIENT_OVERVIEW_COLLECTION).doc(client.id);
    batch.set(docRef, buildClientOverview(snapshot, client.id, client.name, monthlyHistoryByClient[client.id] ?? {}));
  });
  await batch.commit();
};

export interface AccessProfile {
  role: 'admin' | 'client';
  clientId?: string;
  displayName?: string;
  email?: string;
  loginId?: string;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AccessProfileRecord extends AccessProfile {
  uid: string;
}

export const listClientAccessProfiles = async (): Promise<AccessProfileRecord[]> => {
  const snapshot = await db.collection('access_profiles').where('role', '==', 'client').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as AccessProfile;
    return {
      uid: doc.id,
      ...data,
      loginId: data.loginId ?? loginIdFromAuthEmail(data.email)
    };
  });
};

export const fetchAccessProfile = async (uid: string): Promise<AccessProfile | null> => {
  const doc = await db.collection('access_profiles').doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data() as AccessProfile;
  return {
    ...data,
    loginId: data.loginId ?? loginIdFromAuthEmail(data.email)
  };
};

export const fetchClientAccessProfile = async (clientId: string): Promise<AccessProfileRecord | null> => {
  const snapshot = await db
    .collection('access_profiles')
    .where('clientId', '==', clientId)
    .where('role', '==', 'client')
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  if (!doc) return null;
  const data = doc.data() as AccessProfile;
  return {
    uid: doc.id,
    ...data,
    loginId: data.loginId ?? loginIdFromAuthEmail(data.email)
  };
};

export const subscribeClientOverview = (
  clientId: string,
  onValue: (value: Record<string, unknown> | null) => void,
  onError: (error: unknown) => void
) =>
  db
    .collection(CLIENT_OVERVIEW_COLLECTION)
    .doc(clientId)
    .onSnapshot(
      (doc) => {
        onValue(doc.exists ? (doc.data() as Record<string, unknown>) : null);
      },
      (error) => onError(error)
    );

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const CLIENT_LOGIN_DOMAIN = 'clients.portfolio-manager.local';

export const normalizeLoginId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const isValidLoginId = (value: string) => /^[a-z0-9]{4,20}$/.test(normalizeLoginId(value));
export const buildClientAuthEmail = (loginId: string) => `${normalizeLoginId(loginId)}@${CLIENT_LOGIN_DOMAIN}`;
export const loginIdFromAuthEmail = (value?: string | null) => {
  const email = normalizeEmail(value ?? '');
  const suffix = `@${CLIENT_LOGIN_DOMAIN}`;
  if (!email.endsWith(suffix)) return '';
  return email.slice(0, -suffix.length);
};

const upsertAccessProfile = async (uid: string, profile: AccessProfile) => {
  const now = Date.now();
  await db
    .collection('access_profiles')
    .doc(uid)
    .set(
      {
        role: profile.role,
        clientId: profile.clientId ?? null,
        displayName: profile.displayName ?? null,
        email: profile.email ?? null,
        loginId: profile.loginId ?? null,
        active: profile.active !== false,
        updatedAt: now,
        createdAt: profile.createdAt ?? now
      },
      { merge: true }
    );
};

export interface ProvisionClientAccessInput {
  loginId: string;
  password: string;
  clientId: string;
  displayName?: string;
}

export interface ProvisionClientAccessResult {
  ok: boolean;
  uid?: string;
  createdAuthUser?: boolean;
  linkedExistingProfile?: boolean;
  reason?: string;
}

export const provisionClientAccess = async (
  input: ProvisionClientAccessInput
): Promise<ProvisionClientAccessResult> => {
  const loginId = normalizeLoginId(input.loginId);
  const email = buildClientAuthEmail(loginId);
  const password = input.password;
  const clientId = input.clientId.trim();
  const displayName = input.displayName?.trim() ?? '';

  if (!isValidLoginId(loginId)) {
    return { ok: false, reason: 'login_id_invalid' };
  }
  if (!clientId) {
    return { ok: false, reason: 'client_invalid' };
  }
  if (!password || password.length < 6) {
    return { ok: false, reason: 'password_short' };
  }

  const secondaryName = `provision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = secondaryApp.auth();

  try {
    await secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    const credential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const uid = credential.user?.uid;
    if (!uid) {
      return { ok: false, reason: 'uid_missing' };
    }

    await upsertAccessProfile(uid, {
      role: 'client',
      clientId,
      displayName,
      email,
      loginId,
      active: true
    });
    return { ok: true, uid, createdAuthUser: true, linkedExistingProfile: false };
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code === 'auth/email-already-in-use') {
      const existing = await db
        .collection('access_profiles')
        .where('loginId', '==', loginId)
        .limit(1)
        .get();
      const existingDoc = existing.docs[0];
      if (!existingDoc) {
        return { ok: false, reason: 'login_exists_without_profile' };
      }
      await upsertAccessProfile(existingDoc.id, {
        role: 'client',
        clientId,
        displayName,
        email,
        loginId,
        active: true
      });
      return { ok: true, uid: existingDoc.id, createdAuthUser: false, linkedExistingProfile: true };
    }
    if (code === 'auth/weak-password') {
      return { ok: false, reason: 'password_weak' };
    }
    console.error('Error provisioning client access', error);
    return { ok: false, reason: 'unknown' };
  } finally {
    try {
      await secondaryAuth.signOut();
    } catch {}
    try {
      await secondaryApp.delete();
    } catch {}
  }
};

export interface SetClientPasswordInput {
  uid: string;
  password: string;
}

export interface SetClientPasswordResult {
  ok: boolean;
  reason?: string;
}

export const setClientPassword = async (
  input: SetClientPasswordInput
): Promise<SetClientPasswordResult> => {
  const password = input.password.trim();
  const uid = input.uid.trim();

  if (!uid) return { ok: false, reason: 'uid_missing' };
  if (!password || password.length < 6) {
    return { ok: false, reason: 'password_short' };
  }

  try {
    const callable = functions.httpsCallable('setClientPassword');
    await callable({
      uid,
      password
    });
    return { ok: true };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : '';

    if (code.includes('permission-denied')) return { ok: false, reason: 'permission_denied' };
    if (code.includes('not-found')) return { ok: false, reason: 'profile_not_found' };
    if (code.includes('invalid-argument')) return { ok: false, reason: 'password_invalid' };
    console.error('Error setting client password', error);
    return { ok: false, reason: 'unknown' };
  }
};

export const revokeClientAccess = async (uid: string) => {
  await db.collection('access_profiles').doc(uid).delete();
};
