import type { Lang } from '../i18n';
import { db } from './firebaseApp';

// Idioma guardado de cada cliente (lo elige el cliente; el admin tambien puede verlo y cambiarlo).
// Documento client_preferences/{clientId}: el cliente solo puede escribir su propio idioma.
export const CLIENT_PREFERENCES_COLLECTION = 'client_preferences';

const isLang = (value: unknown): value is Lang => value === 'es' || value === 'ca';
const cacheKey = (clientId: string) => `jigsa-lang-${clientId}`;
const sessionKey = (clientId: string) => `jigsa-lang-session-${clientId}`;

// Copia en el navegador para que la pagina salga ya en su idioma mientras llega Firebase.
export const readCachedLanguage = (clientId: string): Lang | null => {
  try {
    const value = window.localStorage.getItem(cacheKey(clientId));
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
};

const writeCachedLanguage = (clientId: string, lang: Lang | null) => {
  try {
    if (lang) window.localStorage.setItem(cacheKey(clientId), lang);
    else window.localStorage.removeItem(cacheKey(clientId));
  } catch {
    // Sin almacenamiento: no pasa nada, se lee de Firebase.
  }
};

// Idioma elegido "solo esta vez": dura hasta cerrar la sesion del navegador.
export const readSessionLanguage = (clientId: string): Lang | null => {
  try {
    const value = window.sessionStorage.getItem(sessionKey(clientId));
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeSessionLanguage = (clientId: string, lang: Lang | null) => {
  try {
    if (lang) window.sessionStorage.setItem(sessionKey(clientId), lang);
    else window.sessionStorage.removeItem(sessionKey(clientId));
  } catch {
    // Sin almacenamiento: el cambio dura mientras la pagina este abierta.
  }
};

export const fetchClientLanguage = async (clientId: string): Promise<Lang | null> => {
  const doc = await db.collection(CLIENT_PREFERENCES_COLLECTION).doc(clientId).get();
  const value = doc.exists ? doc.data()?.language : null;
  const lang = isLang(value) ? value : null;
  writeCachedLanguage(clientId, lang);
  return lang;
};

// El admin guarda sin tocar la copia de su propio navegador.
export const saveClientLanguage = async (clientId: string, lang: Lang, options: { cacheInBrowser?: boolean } = {}) => {
  if (options.cacheInBrowser !== false) writeCachedLanguage(clientId, lang);
  await db.collection(CLIENT_PREFERENCES_COLLECTION).doc(clientId).set({ clientId, language: lang, updatedAt: Date.now() });
};

// Para la ficha del admin.
export const subscribeClientLanguage = (clientId: string, onValue: (lang: Lang | null) => void) =>
  db.collection(CLIENT_PREFERENCES_COLLECTION).doc(clientId).onSnapshot(
    (doc) => {
      const value = doc.exists ? doc.data()?.language : null;
      onValue(isLang(value) ? value : null);
    },
    () => onValue(null)
  );
