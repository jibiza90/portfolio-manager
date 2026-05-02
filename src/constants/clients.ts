export interface ClientProfile {
  id: string;
  name: string;
}

const STORAGE_KEY = 'portfolio-clients';
export const DEMO_CLIENT_ID = 'client-demo';

export const isDemoClient = (clientId: string) => clientId === DEMO_CLIENT_ID;

const numberedClients = Array.from({ length: 100 }, (_, index) => {
  const padded = String(index + 1).padStart(3, '0');
  return {
    id: `client-${padded}`,
    name: `Cliente ${padded}`
  };
});

const defaultClients: ClientProfile[] = [
  { id: DEMO_CLIENT_ID, name: 'Cliente Demo' },
  ...numberedClients
];

const mergeWithDefaultClients = (clients: ClientProfile[]) => {
  const merged = new Map<string, ClientProfile>();
  defaultClients.forEach((client) => merged.set(client.id, client));
  clients.forEach((client) => merged.set(client.id, client));
  return Array.from(merged.values());
};

const loadClients = (): ClientProfile[] => {
  if (typeof window === 'undefined') return defaultClients;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultClients;
    const parsed = JSON.parse(raw) as ClientProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultClients;
    const valid = parsed.filter((c) => typeof c?.id === 'string' && typeof c?.name === 'string');
    if (valid.length === 0) return defaultClients;
    const merged = mergeWithDefaultClients(valid);
    if (merged.length !== valid.length) persistClients(merged);
    return merged;
  } catch {
    return defaultClients;
  }
};

const persistClients = (clients: ClientProfile[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
};

export const CLIENTS: ClientProfile[] = loadClients();

export const addClientProfile = (name?: string): ClientProfile => {
  const maxIdx = CLIENTS.reduce((max, c) => {
    const match = c.id.match(/client-(\d+)/);
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
  const idx = CLIENTS.findIndex((c) => c.id === clientId);
  if (idx < 0) return false;
  CLIENTS.splice(idx, 1);
  persistClients(CLIENTS);
  return true;
};
