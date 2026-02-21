import { db, firebase } from './firebaseApp';

export interface LoginEvent {
  id: string;
  uid: string;
  email: string;
  authEventKey: string;
  loginAt: number;
  createdAt: number;
}

const LOGIN_EVENTS_COLLECTION = 'auth_login_events';
const inFlightAuthEventKeys = new Set<string>();

const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const mapLoginEvent = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): LoginEvent => {
  const data = doc.data();
  return {
    id: doc.id,
    uid: String(data.uid ?? ''),
    email: String(data.email ?? ''),
    authEventKey: String(data.authEventKey ?? ''),
    loginAt: Number(data.loginAt ?? 0),
    createdAt: Number(data.createdAt ?? data.loginAt ?? 0)
  };
};

export const recordLoginEvent = async (user: firebase.User) => {
  const token = await user.getIdTokenResult();
  const authTimeSeconds = Number(token.claims.auth_time ?? 0);
  const loginAt = Number.isFinite(authTimeSeconds) && authTimeSeconds > 0 ? authTimeSeconds * 1000 : Date.now();
  const email = normalizeEmail(user.email);
  const authEventKey = `${user.uid}_${Math.floor(loginAt / 1000)}`;
  const storageKey = `pm_login_event_${authEventKey}`;

  if (inFlightAuthEventKeys.has(authEventKey)) {
    return;
  }
  if (typeof window !== 'undefined' && window.sessionStorage.getItem(storageKey) === '1') {
    return;
  }
  inFlightAuthEventKeys.add(authEventKey);
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(storageKey, '1');
  }

  try {
    await db.collection(LOGIN_EVENTS_COLLECTION).add({
      uid: user.uid,
      email,
      loginAt,
      createdAt: Date.now(),
      authEventKey
    });
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey);
    }
    throw error;
  } finally {
    inFlightAuthEventKeys.delete(authEventKey);
  }
};

export const subscribeLoginEvents = (
  onValue: (events: LoginEvent[]) => void,
  onError: (error: unknown) => void
) =>
  db
    .collection(LOGIN_EVENTS_COLLECTION)
    .orderBy('loginAt', 'desc')
    .limit(1200)
    .onSnapshot(
      (snapshot) => onValue(snapshot.docs.map(mapLoginEvent)),
      (error) => onError(error)
    );
