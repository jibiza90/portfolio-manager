import { ClientDayRow, PersistedState, PortfolioSnapshot } from '../types';
import { db, firebase, firebaseConfig } from './firebaseApp';
import { calculateAllMonthsTWR, calculateTWR } from '../utils/twr';

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
    .slice(-370)
    .map((row) => ({
      iso: row.iso,
      label: row.label,
      increment: row.increment ?? null,
      decrement: row.decrement ?? null,
      baseBalance: row.baseBalance ?? null,
      finalBalance: row.finalBalance ?? null,
      profit: row.profit ?? null,
      profitPct: row.profitPct ?? null,
      sharePct: row.sharePct ?? null,
      cumulativeProfit: row.cumulativeProfit ?? null
    }));
};

const buildMonthlyAnalytics = (rows: ClientDayRow[]) => {
  const byMonth = new Map<string, { profit: number; baseStart?: number; finalEnd?: number }>();

  rows.forEach((row) => {
    const month = row.iso.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { profit: 0, baseStart: undefined, finalEnd: undefined });
    }
    const entry = byMonth.get(month)!;
    if (row.profit !== undefined) entry.profit += row.profit;
    if (entry.baseStart === undefined && row.baseBalance !== undefined && row.baseBalance > 0) {
      entry.baseStart = row.baseBalance;
    }
    if (row.finalBalance !== undefined && row.finalBalance > 0) {
      entry.finalEnd = row.finalBalance;
    }
  });

  const months = Array.from(byMonth.keys()).sort();
  return months.map((month, idx) => {
    const entry = byMonth.get(month)!;
    const profit = entry.profit;
    let baseStart = entry.baseStart;

    if ((baseStart === undefined || baseStart === 0) && idx > 0) {
      baseStart = byMonth.get(months[idx - 1])?.finalEnd;
    }
    if ((baseStart === undefined || baseStart === 0) && entry.finalEnd !== undefined && entry.finalEnd > 0) {
      baseStart = Math.max(1, entry.finalEnd - profit);
    }

    const retPct = baseStart && baseStart > 0 ? profit / baseStart : 0;
    return {
      month,
      profit,
      retPct
    };
  });
};

const buildClientOverview = (snapshot: PortfolioSnapshot, clientId: string, clientName: string) => {
  const rows = snapshot.clientRowsById[clientId] ?? [];
  const latestWithBalance = [...rows].reverse().find((row) => row.finalBalance !== undefined || row.baseBalance !== undefined);
  const latestWithProfit = [...rows].reverse().find((row) => row.cumulativeProfit !== undefined || row.profit !== undefined);
  const latestWithShare = [...rows].reverse().find((row) => row.sharePct !== undefined);
  const latestWithProfitPct = [...rows].reverse().find((row) => row.profitPct !== undefined);

  const currentBalance = latestWithBalance?.finalBalance ?? latestWithBalance?.baseBalance ?? 0;
  const cumulativeProfit = latestWithProfit?.cumulativeProfit ?? 0;
  const dailyProfit = latestWithProfit?.profit ?? 0;
  const dailyProfitPct = latestWithProfitPct?.profitPct ?? 0;
  const participation = latestWithShare?.sharePct ?? 0;
  const totalIncrements = rows.reduce((sum, row) => sum + (row.increment ?? 0), 0);
  const totalDecrements = rows.reduce((sum, row) => sum + (row.decrement ?? 0), 0);
  const monthly = buildMonthlyAnalytics(rows);

  const latestProfitMonth = [...monthly].reverse().find((item) => item.profit !== 0) ?? monthly[monthly.length - 1] ?? null;
  const latestReturnMonth = [...monthly].reverse().find((item) => item.retPct !== 0) ?? monthly[monthly.length - 1] ?? null;

  const twrYtd = calculateTWR(rows);
  const twrMonthly = calculateAllMonthsTWR(rows);
  const ytdReturnPct = twrYtd.twr;

  return {
    clientId,
    clientName,
    currentBalance,
    cumulativeProfit,
    dailyProfit,
    dailyProfitPct,
    participation,
    totalIncrements,
    totalDecrements,
    ytdReturnPct,
    latestProfitMonth,
    latestReturnMonth,
    monthly,
    twrYtd: twrYtd.twr,
    twrMonthly,
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
