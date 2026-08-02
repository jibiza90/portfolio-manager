import { create } from 'zustand';
import { CLIENTS } from '../constants/clients';
import { Movement, MonthlyHistoryEntry, PersistedState, PortfolioSnapshot } from '../types';
import { buildSnapshot } from '../utils/snapshot';
import { fetchPortfolioState, savePortfolioState } from '../services/cloudPortfolio';

const createRevision = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const emptyPersisted: PersistedState = {
  finalByDay: {},
  movementsByClient: {},
  monthlyHistoryByClient: {},
  revision: createRevision(),
  updatedAt: Date.now()
};

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'success' | 'error';

interface PortfolioState {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  revision: string;
  updatedAt: number;
  snapshot: PortfolioSnapshot;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  canWrite: boolean;
  initialized: boolean;
  setWriteAccess: (canWrite: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  hydrate: (state: PersistedState) => void;
  setDayFinal: (iso: string, value?: number) => void;
  setClientMovement: (
    clientId: string,
    iso: string,
    field: keyof Movement,
    value?: number
  ) => void;
  setClientMonthlyHistory: (
    clientId: string,
    month: string,
    field: keyof MonthlyHistoryEntry,
    value?: number
  ) => void;
  removeClientData: (clientId: string) => void;
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
}

const initialSnapshot = buildSnapshot(
  emptyPersisted.finalByDay,
  emptyPersisted.movementsByClient,
  emptyPersisted.monthlyHistoryByClient
);
let saveInFlight = false;
let saveQueued = false;
let currentSavePromise: Promise<void> = Promise.resolve();
let lastSaveError: unknown = null;

const persistCurrentState = () => {
  const runSaveLoop = async () => {
    let lastError: unknown = null;

    do {
      saveQueued = false;
      const { canWrite, initialized, finalByDay, movementsByClient, monthlyHistoryByClient, revision, updatedAt } = usePortfolioStore.getState();
      if (!canWrite || !initialized) break;

      try {
        await savePortfolioState({ finalByDay, movementsByClient, monthlyHistoryByClient, revision, updatedAt });
        usePortfolioStore.setState({ saveStatus: 'success', lastSavedAt: Date.now() });
        lastError = null;
      } catch (error) {
        console.error('Error guardando portfolio', error);
        usePortfolioStore.setState({ saveStatus: 'error' });
        lastError = error;
      }
    } while (saveQueued);

    saveInFlight = false;
    lastSaveError = lastError;
  };

  if (saveInFlight) {
    saveQueued = true;
    return currentSavePromise;
  }

  const { canWrite, initialized } = usePortfolioStore.getState();
  if (!canWrite || !initialized) return Promise.resolve();

  saveInFlight = true;
  currentSavePromise = runSaveLoop();
  return currentSavePromise;
};

export const waitForPendingPortfolioSave = async () => {
  if (!saveInFlight) return;
  await currentSavePromise;
  if (lastSaveError) {
    throw lastSaveError;
  }
};

export const usePortfolioStore = create<PortfolioState>((set) => ({
  finalByDay: emptyPersisted.finalByDay,
  movementsByClient: emptyPersisted.movementsByClient,
  monthlyHistoryByClient: emptyPersisted.monthlyHistoryByClient,
  revision: emptyPersisted.revision!,
  updatedAt: emptyPersisted.updatedAt!,
  snapshot: initialSnapshot,
  saveStatus: 'idle',
  lastSavedAt: undefined,
  canWrite: false,
  initialized: false,
  setWriteAccess: (canWrite) => set((state) => ({ canWrite: canWrite && state.initialized })),
  setInitialized: (initialized) => set((state) => ({
    initialized,
    canWrite: initialized ? state.canWrite : false
  })),
  hydrate: (state) => {
    const finalByDay = state.finalByDay ?? {};
    const movementsByClient = state.movementsByClient ?? {};
    const monthlyHistoryByClient = state.monthlyHistoryByClient ?? {};
    const revision = state.revision ?? createRevision();
    const updatedAt = state.updatedAt ?? Date.now();
    set({
      finalByDay,
      movementsByClient,
      monthlyHistoryByClient,
      revision,
      updatedAt,
      snapshot: buildSnapshot(finalByDay, movementsByClient, monthlyHistoryByClient),
      saveStatus: 'success',
      lastSavedAt: updatedAt,
      initialized: true
    });
  },
  setDayFinal: (iso, value) => {
    set((state) => {
      if (!state.canWrite || !state.initialized) return state;
      const finalByDay = { ...state.finalByDay };
      if (value === undefined || Number.isNaN(value)) {
        delete finalByDay[iso];
      } else {
        finalByDay[iso] = value;
      }
      return {
        finalByDay,
        snapshot: buildSnapshot(finalByDay, state.movementsByClient, state.monthlyHistoryByClient),
        revision: createRevision(),
        updatedAt: Date.now(),
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  setClientMovement: (clientId, iso, field, value) => {
    set((state) => {
      if (!state.canWrite || !state.initialized) return state;
      const movementsByClient = { ...state.movementsByClient };
      const clientDays = { ...(movementsByClient[clientId] ?? {}) };
      const dayMovement = { ...(clientDays[iso] ?? {}) };

      if (value === undefined || Number.isNaN(value)) {
        delete dayMovement[field];
      } else {
        dayMovement[field] = value;
      }

      if (field === 'increment' && (value === undefined || Number.isNaN(value) || value === 0)) {
        delete dayMovement.incrementReturnPct;
      }

      if (field === 'decrement' && (value === undefined || Number.isNaN(value) || value === 0)) {
        delete dayMovement.decrementReturnPct;
      }

      if (!dayMovement.increment && !dayMovement.decrement && !dayMovement.manualProfit && !dayMovement.manualProfitPct) {
        delete clientDays[iso];
      } else {
        clientDays[iso] = dayMovement;
      }

      if (Object.keys(clientDays).length === 0) {
        delete movementsByClient[clientId];
      } else {
        movementsByClient[clientId] = clientDays;
      }
      return {
        movementsByClient,
        snapshot: buildSnapshot(state.finalByDay, movementsByClient, state.monthlyHistoryByClient),
        revision: createRevision(),
        updatedAt: Date.now(),
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  setClientMonthlyHistory: (clientId, month, field, value) => {
    set((state) => {
      if (!state.canWrite || !state.initialized) return state;
      const monthlyHistoryByClient = { ...state.monthlyHistoryByClient };
      const clientMonths = { ...(monthlyHistoryByClient[clientId] ?? {}) };
      const monthHistory = { ...(clientMonths[month] ?? {}) };

      if (value === undefined || Number.isNaN(value)) {
        delete monthHistory[field];
      } else {
        monthHistory[field] = value;
      }

      if (monthHistory.finalBalance === undefined && monthHistory.returnPct === undefined) {
        delete clientMonths[month];
      } else {
        clientMonths[month] = monthHistory;
      }

      if (Object.keys(clientMonths).length === 0) {
        delete monthlyHistoryByClient[clientId];
      } else {
        monthlyHistoryByClient[clientId] = clientMonths;
      }

      return {
        monthlyHistoryByClient,
        snapshot: buildSnapshot(state.finalByDay, state.movementsByClient, monthlyHistoryByClient),
        revision: createRevision(),
        updatedAt: Date.now(),
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  removeClientData: (clientId) => {
    set((state) => {
      if (!state.canWrite || !state.initialized) return state;
      const movementsByClient = { ...state.movementsByClient };
      const monthlyHistoryByClient = { ...state.monthlyHistoryByClient };
      delete movementsByClient[clientId];
      delete monthlyHistoryByClient[clientId];
      return {
        movementsByClient,
        monthlyHistoryByClient,
        snapshot: buildSnapshot(state.finalByDay, movementsByClient, monthlyHistoryByClient),
        revision: createRevision(),
        updatedAt: Date.now(),
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  markSaving: () => set({ saveStatus: 'saving' }),
  markSaved: () => set({ saveStatus: 'success', lastSavedAt: Date.now() }),
  markError: () => set({ saveStatus: 'error' })
}));

export const initializePortfolioStore = async () => {
  usePortfolioStore.setState({ canWrite: false, initialized: false });
  try {
    let remote = await fetchPortfolioState();
    if (!remote.revision || !remote.updatedAt) {
      remote = {
        ...remote,
        revision: remote.revision ?? createRevision(),
        updatedAt: remote.updatedAt ?? Date.now()
      };
      await savePortfolioState(remote);
    }
    usePortfolioStore.getState().hydrate(remote);
  } catch (error) {
    usePortfolioStore.setState({ canWrite: false, initialized: false, saveStatus: 'error' });
    throw error;
  }
};

export const selectClientRows = (clientId: string) =>
  usePortfolioStore.getState().snapshot.clientRowsById[clientId] ?? [];

export const selectClientName = (clientId: string) =>
  CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;
