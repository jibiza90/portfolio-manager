import { create } from 'zustand';
import { CLIENTS } from '../constants/clients';
import { Movement, MonthlyHistoryEntry, PersistedState, PortfolioSnapshot } from '../types';
import { buildSnapshot } from '../utils/snapshot';
import { fetchPortfolioState, savePortfolioState, syncClientOverviews } from '../services/cloudPortfolio';

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {}, monthlyHistoryByClient: {} };

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'success' | 'error';

interface PortfolioState {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
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
let syncOverviewTimer: ReturnType<typeof setTimeout> | null = null;

const queueOverviewSync = (snapshot: PortfolioSnapshot) => {
  if (syncOverviewTimer) clearTimeout(syncOverviewTimer);
  syncOverviewTimer = setTimeout(() => {
    void syncClientOverviews(snapshot, CLIENTS).catch((error) => {
      console.error('No se pudieron sincronizar los resúmenes de clientes', error);
    });
    syncOverviewTimer = null;
  }, 900);
};

const persistCurrentState = () => {
  const { canWrite, finalByDay, movementsByClient, monthlyHistoryByClient, snapshot } = usePortfolioStore.getState();
  if (!canWrite) return;

  savePortfolioState({ finalByDay, movementsByClient, monthlyHistoryByClient })
    .then(() => {
      usePortfolioStore.setState({ saveStatus: 'success', lastSavedAt: Date.now() });
      queueOverviewSync(snapshot);
    })
    .catch((error) => {
      console.error('Error guardando portfolio', error);
      usePortfolioStore.setState({ saveStatus: 'error' });
    });
};

export const usePortfolioStore = create<PortfolioState>((set) => ({
  finalByDay: emptyPersisted.finalByDay,
  movementsByClient: emptyPersisted.movementsByClient,
  monthlyHistoryByClient: emptyPersisted.monthlyHistoryByClient,
  snapshot: initialSnapshot,
  saveStatus: 'idle',
  lastSavedAt: undefined,
  canWrite: false,
  initialized: false,
  setWriteAccess: (canWrite) => set({ canWrite }),
  setInitialized: (initialized) => set({ initialized }),
  hydrate: (state) => {
    const finalByDay = state.finalByDay ?? {};
    const movementsByClient = state.movementsByClient ?? {};
    const monthlyHistoryByClient = state.monthlyHistoryByClient ?? {};
    set({
      finalByDay,
      movementsByClient,
      monthlyHistoryByClient,
      snapshot: buildSnapshot(finalByDay, movementsByClient, monthlyHistoryByClient),
      saveStatus: 'success',
      lastSavedAt: Date.now(),
      initialized: true
    });
  },
  setDayFinal: (iso, value) => {
    set((state) => {
      if (!state.canWrite) return state;
      const finalByDay = { ...state.finalByDay };
      if (value === undefined || Number.isNaN(value)) {
        delete finalByDay[iso];
      } else {
        finalByDay[iso] = value;
      }
      return {
        finalByDay,
        snapshot: buildSnapshot(finalByDay, state.movementsByClient, state.monthlyHistoryByClient),
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  setClientMovement: (clientId, iso, field, value) => {
    set((state) => {
      if (!state.canWrite) return state;
      const movementsByClient = { ...state.movementsByClient };
      const clientDays = { ...(movementsByClient[clientId] ?? {}) };
      const dayMovement = { ...(clientDays[iso] ?? {}) };

      if (value === undefined || Number.isNaN(value)) {
        delete dayMovement[field];
      } else {
        dayMovement[field] = value;
      }

      if (!dayMovement.increment && !dayMovement.decrement && !dayMovement.manualProfit) {
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
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  setClientMonthlyHistory: (clientId, month, field, value) => {
    set((state) => {
      if (!state.canWrite) return state;
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
        saveStatus: 'saving'
      };
    });

    persistCurrentState();
  },
  removeClientData: (clientId) => {
    set((state) => {
      if (!state.canWrite) return state;
      const movementsByClient = { ...state.movementsByClient };
      const monthlyHistoryByClient = { ...state.monthlyHistoryByClient };
      delete movementsByClient[clientId];
      delete monthlyHistoryByClient[clientId];
      return {
        movementsByClient,
        monthlyHistoryByClient,
        snapshot: buildSnapshot(state.finalByDay, movementsByClient, monthlyHistoryByClient),
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
  const remote = await fetchPortfolioState();
  usePortfolioStore.getState().hydrate(remote);
};

export const selectClientRows = (clientId: string) =>
  usePortfolioStore.getState().snapshot.clientRowsById[clientId] ?? [];

export const selectClientName = (clientId: string) =>
  CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;
