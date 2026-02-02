import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { PersistedState } from '../types';

// Firebase config
const firebaseConfig = {
  apiKey: 'AIzaSyDBRpCpb2xj_iHQh8JiLv0xRKjfWJj0Az8',
  authDomain: 'portfolio-manager-b40b8.firebaseapp.com',
  projectId: 'portfolio-manager-b40b8',
  storageBucket: 'portfolio-manager-b40b8.firebasestorage.app',
  messagingSenderId: '286094409889',
  appId: '1:286094409889:web:74337eabc0e336a02930e0'
};

// REST API base URL para Firestore
const FIRESTORE_REST_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const DOC_PATH = 'portfolio/state';

// Inicializar Firebase para reportLinks (que usa db)
let app: firebase.app.App;
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app();
}
export const db = app.firestore();

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {} };

// Convertir valor JS a formato Firestore REST
const toFirestoreValue = (val: unknown): unknown => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
};

// Convertir valor Firestore REST a JS
const fromFirestoreValue = (val: Record<string, unknown>): unknown => {
  if ('nullValue' in val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue as string, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('arrayValue' in val) {
    const arr = val.arrayValue as { values?: unknown[] };
    return (arr.values ?? []).map((v) => fromFirestoreValue(v as Record<string, unknown>));
  }
  if ('mapValue' in val) {
    const map = val.mapValue as { fields?: Record<string, unknown> };
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map.fields ?? {})) {
      result[k] = fromFirestoreValue(v as Record<string, unknown>);
    }
    return result;
  }
  return null;
};

export const fetchPortfolioState = async (): Promise<PersistedState> => {
  try {
    const url = `${FIRESTORE_REST_URL}/${DOC_PATH}?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return emptyPersisted;
      throw new Error(`Firestore REST fetch failed: ${res.status}`);
    }
    const doc = await res.json();
    if (!doc.fields) return emptyPersisted;
    
    const data = fromFirestoreValue({ mapValue: { fields: doc.fields } }) as PersistedState;
    return {
      finalByDay: data.finalByDay ?? {},
      movementsByClient: data.movementsByClient ?? {}
    };
  } catch (error) {
    console.error('Firestore REST fetch error', error);
    return emptyPersisted;
  }
};

export const savePortfolioState = async (state: PersistedState) => {
  try {
    const url = `${FIRESTORE_REST_URL}/${DOC_PATH}?key=${firebaseConfig.apiKey}`;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) {
      fields[k] = toFirestoreValue(v);
    }
    
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    
    if (!res.ok) {
      throw new Error(`Firestore REST save failed: ${res.status}`);
    }
  } catch (error) {
    console.error('Firestore REST save error', error);
  }
};
