export interface ClientProfile {
  id: string;
  name: string;
}

const STORAGE_KEY = 'portfolio-clients';
const DELETED_STORAGE_KEY = 'portfolio-deleted-clients';
export const DEMO_CLIENT_ID = 'client-001';
const LEGACY_DEMO_CLIENT_ID = 'client-demo';

// Cliente 001 funciona como demo visible, pero queda fuera de todos los totales reales.
export const isDemoClient = (clientId: string) =>
  clientId === DEMO_CLIENT_ID || clientId === LEGACY_DEMO_CLIENT_ID;

const numberedClients = Array.from({ length: 100 }, (_, index) => {
  const padded = String(index + 1).padStart(3, '0');
  return {
    id: `client-${padded}`,
    name: `Cliente ${padded}`
  };
});

const defaultClients: ClientProfile[] = [
  ...numberedClients,
  { id: LEGACY_DEMO_CLIENT_ID, name: 'Cliente Demo' }
];

const loadDeletedClientIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DELETED_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const persistDeletedClientIds = (clientIds: string[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...new Set(clientIds)]));
};

const mergeWithDefaultClients = (clients: ClientProfile[], deletedClientIds: string[]) => {
  const deleted = new Set(deletedClientIds);
  const merged = new Map<string, ClientProfile>();
  defaultClients.forEach((client) => {
    if (!deleted.has(client.id)) merged.set(client.id, client);
  });
  clients.forEach((client) => {
    if (!deleted.has(client.id)) merged.set(client.id, client);
  });
  const ordered = Array.from(merged.values()).filter((client) => client.id !== LEGACY_DEMO_CLIENT_ID);
  const demoClient = merged.get(LEGACY_DEMO_CLIENT_ID);
  return demoClient ? [...ordered, demoClient] : ordered;
};

const loadClients = (): ClientProfile[] => {
  if (typeof window === 'undefined') return defaultClients;

  try {
    const deletedClientIds = loadDeletedClientIds();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeWithDefaultClients([], deletedClientIds);
    const parsed = JSON.parse(raw) as ClientProfile[];
    if (!Array.isArray(parsed)) return mergeWithDefaultClients([], deletedClientIds);
    const valid = parsed.filter((c) => typeof c?.id === 'string' && typeof c?.name === 'string');
    const merged = mergeWithDefaultClients(valid, deletedClientIds);
    if (merged.length !== valid.length) persistClients(merged);
    return merged;
  } catch {
    return mergeWithDefaultClients([], loadDeletedClientIds());
  }
};

const persistClients = (clients: ClientProfile[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
};

export const CLIENTS: ClientProfile[] = loadClients();

export const addClientProfile = (name?: string): ClientProfile => {
  const deletedClientIds = loadDeletedClientIds();
  const maxIdx = [...CLIENTS.map((client) => client.id), ...deletedClientIds].reduce((max, clientId) => {
    const match = clientId.match(/client-(\d+)/);
    const idx = match ? Number.parseInt(match[1], 10) : 0;
    return Number.isFinite(idx) ? Math.max(max, idx) : max;
  }, 0);

  const next = maxIdx + 1;
  const id = `client-${String(next).padStart(3, '0')}`;
  const fallbackName = `Cliente ${String(next).padStart(3, '0')}`;
  const trimmed = name?.trim();
  const profile: ClientProfile = { id, name: trimmed ? trimmed : fallbackName };

  CLIENTS.push(profile);
  persistClients(CLIENTS);
  return profile;
};

export const removeClientProfile = (clientId: string): boolean => {
  if (isDemoClient(clientId)) return false;
  const idx = CLIENTS.findIndex((c) => c.id === clientId);
  if (idx < 0) return false;
  CLIENTS.splice(idx, 1);
  persistDeletedClientIds([...loadDeletedClientIds(), clientId]);
  persistClients(CLIENTS);
  return true;
};
