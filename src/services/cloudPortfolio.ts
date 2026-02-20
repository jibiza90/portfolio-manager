import { PersistedState, PortfolioSnapshot } from '../types';
import { db } from './firebaseApp';

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
  active?: boolean;
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
