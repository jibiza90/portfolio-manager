import fs from 'node:fs/promises';
import path from 'node:path';
import { CLIENTS } from '../src/constants/clients';
import { buildSnapshot } from '../src/utils/snapshot';
import { buildClientReportData, toClientReportPayload, type ClientContactInfo } from '../src/utils/clientReport';
import type { PersistedState } from '../src/types';

const PROJECT_ID = 'portfolio-manager-b40b8';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_TOOLS_CONFIG = path.join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json');

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

const fromFirestoreValue = (value?: FirestoreValue): any => {
  if (!value) return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('mapValue' in value) {
    const fields = value.mapValue.fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, fromFirestoreValue(item)]));
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item));
  }
  return undefined;
};

const toFirestoreValue = (value: any): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, toFirestoreValue(item)])
      )
    }
  };
};

const readAccessToken = async () => {
  const raw = await fs.readFile(FIREBASE_TOOLS_CONFIG, 'utf8');
  const parsed = JSON.parse(raw) as { tokens?: { access_token?: string } };
  const token = parsed.tokens?.access_token;
  if (!token) {
    throw new Error('No access token found in firebase-tools config.');
  }
  return token;
};

const firestoreFetch = async (token: string, url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`Firestore request failed (${response.status}): ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

const loadPersistedState = async (token: string): Promise<PersistedState> => {
  const doc = await firestoreFetch(token, `${FIRESTORE_BASE}/portfolio/state`) as { fields?: Record<string, FirestoreValue> };
  const data = fromFirestoreValue({ mapValue: { fields: doc.fields ?? {} } }) as PersistedState;
  return {
    finalByDay: data.finalByDay ?? {},
    movementsByClient: data.movementsByClient ?? {},
    monthlyHistoryByClient: data.monthlyHistoryByClient ?? {}
  };
};

const loadContacts = async (token: string): Promise<Record<string, ClientContactInfo>> => {
  const result = await firestoreFetch(token, `${FIRESTORE_BASE}/access_profiles?pageSize=200`) as {
    documents?: Array<{ fields?: Record<string, FirestoreValue> }>;
  };
  const contacts: Record<string, ClientContactInfo> = {};
  (result.documents ?? []).forEach((doc) => {
    const data = fromFirestoreValue({ mapValue: { fields: doc.fields ?? {} } }) as {
      role?: string;
      clientId?: string;
      displayName?: string;
      email?: string;
      active?: boolean;
    };
    if (data.role !== 'client' || !data.clientId || data.active === false) return;
    contacts[data.clientId] = {
      name: data.displayName ?? '',
      surname: '',
      email: data.email ?? ''
    };
  });
  return contacts;
};

const replaceOverviewDoc = async (token: string, clientId: string, payload: Record<string, unknown>) => {
  const docUrl = `${FIRESTORE_BASE}/portfolio_client_overviews/${clientId}`;
  try {
    await firestoreFetch(token, docUrl, { method: 'DELETE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('(404)')) {
      throw error;
    }
  }
  await firestoreFetch(token, docUrl, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: (toFirestoreValue(payload) as { mapValue: { fields: Record<string, FirestoreValue> } }).mapValue.fields
    })
  });
};

const run = async () => {
  const token = await readAccessToken();
  const state = await loadPersistedState(token);
  const contacts = await loadContacts(token);
  const snapshot = buildSnapshot(state.finalByDay, state.movementsByClient, state.monthlyHistoryByClient);
  const updatedAt = Date.now();

  for (const client of CLIENTS) {
    const reportData = buildClientReportData(
      client.id,
      'all',
      contacts,
      snapshot,
      state.monthlyHistoryByClient,
      client.name
    );
    if (!reportData) continue;

    await replaceOverviewDoc(token, client.id, {
      clientId: client.id,
      clientName: reportData.name,
      report: toClientReportPayload(reportData),
      updatedAt
    });
  }

  console.log(`Repaired ${CLIENTS.length} client overviews.`);
};

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
