import { create } from 'zustand';
import { CLIENTS } from '../constants/clients';
import { Movement, PersistedState, PortfolioSnapshot } from '../types';
import { buildSnapshot } from '../utils/snapshot';
import { fetchPortfolioState, savePortfolioState } from '../services/cloudPortfolio';

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {} };

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'success' | 'error';

interface PortfolioState {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  snapshot: PortfolioSnapshot;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  setDayFinal: (iso: string, value?: number) => void;
  setClientMovement: (
    clientId: string,
    iso: string,
    field: keyof Movement,
    value?: number
  ) => void;
  removeClientData: (clientId: string) => void;
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
}

const initialSnapshot = buildSnapshot(emptyPersisted.finalByDay, emptyPersisted.movementsByClient);

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  finalByDay: emptyPersisted.finalByDay,
  movementsByClient: emptyPersisted.movementsByClient,
  snapshot: initialSnapshot,
  saveStatus: 'idle',
  lastSavedAt: undefined,
  setDayFinal: (iso, value) => {
    set((state) => {
      const finalByDay = { ...state.finalByDay };
      if (value === undefined || Number.isNaN(value)) {
        delete finalByDay[iso];
      } else {
        finalByDay[iso] = value;
      }
      return {
        finalByDay,
        snapshot: buildSnapshot(finalByDay, state.movementsByClient),
        saveStatus: 'saving'
      };
    });

    const { finalByDay, movementsByClient } = get();
    savePortfolioState({ finalByDay, movementsByClient })
      .then(() => set({ saveStatus: 'success', lastSavedAt: Date.now() }))
      .catch(() => set({ saveStatus: 'error' }));
  },
  setClientMovement: (clientId, iso, field, value) => {
    set((state) => {
      const movementsByClient = { ...state.movementsByClient };
      const clientDays = { ...(movementsByClient[clientId] ?? {}) };
      const dayMovement = { ...(clientDays[iso] ?? {}) };

      if (value === undefined || Number.isNaN(value)) {
        delete dayMovement[field];
      } else {
        dayMovement[field] = value;
      }

      if (!dayMovement.increment && !dayMovement.decrement) {
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
        snapshot: buildSnapshot(state.finalByDay, movementsByClient),
        saveStatus: 'saving'
      };
    });

    const { finalByDay, movementsByClient } = get();
    savePortfolioState({ finalByDay, movementsByClient })
      .then(() => set({ saveStatus: 'success', lastSavedAt: Date.now() }))
      .catch(() => set({ saveStatus: 'error' }));
  },
  removeClientData: (clientId) => {
    set((state) => {
      const movementsByClient = { ...state.movementsByClient };
      delete movementsByClient[clientId];
      return {
        movementsByClient,
        snapshot: buildSnapshot(state.finalByDay, movementsByClient),
        saveStatus: 'saving'
      };
    });

    const { finalByDay, movementsByClient } = get();
    savePortfolioState({ finalByDay, movementsByClient })
      .then(() => set({ saveStatus: 'success', lastSavedAt: Date.now() }))
      .catch(() => set({ saveStatus: 'error' }));
  },
  markSaving: () => set({ saveStatus: 'saving' }),
  markSaved: () => set({ saveStatus: 'success', lastSavedAt: Date.now() }),
  markError: () => set({ saveStatus: 'error' })
}));

export const selectClientRows = (clientId: string) =>
  usePortfolioStore.getState().snapshot.clientRowsById[clientId] ?? [];

export const selectClientName = (clientId: string) =>
  CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;

// Inicializar estado desde Firestore en arranque
fetchPortfolioState()
  .then((remote) => {
    const finalByDay = remote.finalByDay ?? {};
    const movementsByClient = remote.movementsByClient ?? {};
    const snapshot = buildSnapshot(finalByDay, movementsByClient);
    usePortfolioStore.setState({ finalByDay, movementsByClient, snapshot, saveStatus: 'success', lastSavedAt: Date.now() });
  })
  .catch((err) => {
    console.error('No se pudo cargar el estado remoto', err);
  });
