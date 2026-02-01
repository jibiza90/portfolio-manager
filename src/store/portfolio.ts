import { create } from 'zustand';
import { CLIENTS } from '../constants/clients';
import { Movement, PersistedState, PortfolioSnapshot } from '../types';
import { buildSnapshot } from '../utils/snapshot';

const STORAGE_KEY = 'portfolio-manager-autosave-v1';

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {} };

const loadPersistedState = (): PersistedState => {
  if (typeof window === 'undefined') {
    return emptyPersisted;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyPersisted;
    }
    const parsed = JSON.parse(raw);
    return {
      finalByDay: parsed.finalByDay ?? {},
      movementsByClient: parsed.movementsByClient ?? {}
    };
  } catch (error) {
    console.error('Failed to parse persisted state', error);
    return emptyPersisted;
  }
};

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
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
}

const persisted = loadPersistedState();

const initialSnapshot = buildSnapshot(persisted.finalByDay, persisted.movementsByClient);

const saveToStorage = (finalByDay: Record<string, number | undefined>, movementsByClient: Record<string, Record<string, Movement>>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ finalByDay, movementsByClient }));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
};

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  finalByDay: persisted.finalByDay,
  movementsByClient: persisted.movementsByClient,
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

      saveToStorage(finalByDay, state.movementsByClient);

      return {
        finalByDay,
        snapshot: buildSnapshot(finalByDay, state.movementsByClient),
        saveStatus: 'success',
        lastSavedAt: Date.now()
      };
    });
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

      saveToStorage(state.finalByDay, movementsByClient);

      return {
        movementsByClient,
        snapshot: buildSnapshot(state.finalByDay, movementsByClient),
        saveStatus: 'success',
        lastSavedAt: Date.now()
      };
    });
  },
  markSaving: () => set({ saveStatus: 'saving' }),
  markSaved: () => set({ saveStatus: 'success', lastSavedAt: Date.now() }),
  markError: () => set({ saveStatus: 'error' })
}));

export const selectClientRows = (clientId: string) =>
  usePortfolioStore.getState().snapshot.clientRowsById[clientId] ?? [];

export const selectClientName = (clientId: string) =>
  CLIENTS.find((client) => client.id === clientId)?.name ?? clientId;

export const getStorageKey = () => STORAGE_KEY;
