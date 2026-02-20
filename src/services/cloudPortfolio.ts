import { PersistedState, PortfolioSnapshot } from '../types';
import { db, firebase, firebaseConfig } from './firebaseApp';

const DOC_PATH = 'portfolio/state';
const CLIENT_OVERVIEW_COLLECTION = 'portfolio_client_overviews';

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {} };

const sanitizePersistedState = (data?: Partial<PersistedState> | null): PersistedState => ({
  finalByDay: data?.finalByDay ?? {},
  movementsByClient: data?.movementsByClient ?? {}
});

const buildOverviewRows = (snapshot: PortfolioSnapshot, clientId: string) => {
  const rows = snapshot.clientRowsById[clientId] ?? [];
  return rows
    .filter((row) =>
      row.increment !== undefined ||
      row.decrement !== undefined ||
      row.finalBalance !== undefined ||
      row.profit !== undefined
    )
    .slice(-60)
    .map((row) => ({
      iso: row.iso,
      increment: row.increment ?? null,
      decrement: row.decrement ?? null,
      finalBalance: row.finalBalance ?? null,
      profit: row.profit ?? null,
      cumulativeProfit: row.cumulativeProfit ?? null
    }));
};

const buildClientOverview = (snapshot: PortfolioSnapshot, clientId: string, clientName: string) => {
  const rows = snapshot.clientRowsById[clientId] ?? [];
  const latestWithBalance = [...rows].reverse().find((row) => row.finalBalance !== undefined);
  const latestWithProfit = [...rows].reverse().find((row) => row.cumulativeProfit !== undefined);

  const currentBalance = latestWithBalance?.finalBalance ?? 0;
  const cumulativeProfit = latestWithProfit?.cumulativeProfit ?? 0;
  const baseBalance = latestWithBalance?.baseBalance ?? 0;
  const ytdReturnPct = baseBalance ? cumulativeProfit / baseBalance : 0;

  return {
    clientId,
    clientName,
    currentBalance,
    cumulativeProfit,
    ytdReturnPct,
    rows: buildOverviewRows(snapshot, clientId),
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
  await db.doc(DOC_PATH).set(state, { merge: true });
};

export const syncClientOverviews = async (
  snapshot: PortfolioSnapshot,
  clients: Array<{ id: string; name: string }>
) => {
  const batch = db.batch();
  clients.forEach((client) => {
    const docRef = db.collection(CLIENT_OVERVIEW_COLLECTION).doc(client.id);
    batch.set(docRef, buildClientOverview(snapshot, client.id, client.name), { merge: true });
  });
  await batch.commit();
};

export interface AccessProfile {
  role: 'admin' | 'client';
  clientId?: string;
  displayName?: string;
  email?: string;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export const fetchAccessProfile = async (uid: string): Promise<AccessProfile | null> => {
  const doc = await db.collection('access_profiles').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as AccessProfile;
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
        active: profile.active !== false,
        updatedAt: now,
        createdAt: profile.createdAt ?? now
      },
      { merge: true }
    );
};

export interface ProvisionClientAccessInput {
  email: string;
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
  const email = normalizeEmail(input.email);
  const password = input.password;
  const clientId = input.clientId.trim();
  const displayName = input.displayName?.trim() ?? '';

  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'email_invalid' };
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
      active: true
    });
    return { ok: true, uid, createdAuthUser: true, linkedExistingProfile: false };
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code === 'auth/email-already-in-use') {
      const existing = await db
        .collection('access_profiles')
        .where('email', '==', email)
        .limit(1)
        .get();
      const existingDoc = existing.docs[0];
      if (!existingDoc) {
        return { ok: false, reason: 'email_exists_without_profile' };
      }
      await upsertAccessProfile(existingDoc.id, {
        role: 'client',
        clientId,
        displayName,
        email,
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
