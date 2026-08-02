import { db, firebase } from './firebaseApp';

export interface LoginEvent {
  id: string;
  uid: string;
  email: string;
  authEventKey: string;
  loginAt: number;
  createdAt: number;
}

export interface OnlinePresence {
  id: string;
  uid: string;
  email: string;
  lastSeen: number;
  presenceVersion: string;
}

export interface ReportDownloadEvent {
  id: string;
  uid: string;
  email: string;
  loginId: string;
  clientId: string;
  reportClientId: string;
  reportLabel: string;
  periodStart: string;
  periodEnd: string;
  filename: string;
  reportUpdatedAt: number;
  downloadedAt: number;
  downloadedAtTrusted?: boolean;
}

const LOGIN_EVENTS_COLLECTION = 'auth_login_events';
const ONLINE_PRESENCE_COLLECTION = 'auth_presence';
const REPORT_DOWNLOAD_EVENTS_COLLECTION = 'report_download_events';
const PRESENCE_HEARTBEAT_MS = 60_000;
export const ACTIVE_PRESENCE_VERSION = 'active-v2';
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

export const fetchLoginEvents = async (): Promise<LoginEvent[]> => {
  const snapshot = await db
    .collection(LOGIN_EVENTS_COLLECTION)
    .orderBy('loginAt', 'desc')
    .limit(1200)
    .get();
  return snapshot.docs.map(mapLoginEvent);
};

const mapOnlinePresence = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): OnlinePresence => {
  const data = doc.data();
  return {
    id: doc.id,
    uid: String(data.uid ?? doc.id),
    email: String(data.email ?? ''),
    lastSeen: Number(data.lastSeen ?? 0),
    presenceVersion: String(data.presenceVersion ?? '')
  };
};

export const startPresenceHeartbeat = (
  user: firebase.User,
  shouldRefresh: () => boolean = () => document.visibilityState === 'visible'
) => {
  let stopped = false;
  const presenceRef = db.collection(ONLINE_PRESENCE_COLLECTION).doc(user.uid);
  const updatePresence = () => {
    if (stopped || !shouldRefresh()) return;
    void presenceRef.set({
      uid: user.uid,
      email: normalizeEmail(user.email),
      lastSeen: Date.now(),
      presenceVersion: ACTIVE_PRESENCE_VERSION
    }).catch((error) => {
      console.debug('No se pudo actualizar la presencia de la sesion', error);
    });
  };
  const updateWhenVisible = () => {
    if (document.visibilityState === 'visible') updatePresence();
  };

  updatePresence();
  const intervalId = window.setInterval(updatePresence, PRESENCE_HEARTBEAT_MS);
  window.addEventListener('online', updatePresence);
  document.addEventListener('visibilitychange', updateWhenVisible);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    window.removeEventListener('online', updatePresence);
    document.removeEventListener('visibilitychange', updateWhenVisible);
  };
};

export const markPresenceOffline = async (user: firebase.User) => {
  await db.collection(ONLINE_PRESENCE_COLLECTION).doc(user.uid).set({
    uid: user.uid,
    email: normalizeEmail(user.email),
    lastSeen: 1,
    presenceVersion: ACTIVE_PRESENCE_VERSION
  });
};

export const subscribeOnlinePresence = (
  onValue: (presence: OnlinePresence[]) => void,
  onError: (error: unknown) => void
) =>
  db.collection(ONLINE_PRESENCE_COLLECTION).onSnapshot(
    (snapshot) => onValue(snapshot.docs.map(mapOnlinePresence)),
    (error) => onError(error)
  );

export const fetchOnlinePresence = async (): Promise<OnlinePresence[]> => {
  const snapshot = await db.collection(ONLINE_PRESENCE_COLLECTION).get();
  return snapshot.docs.map(mapOnlinePresence);
};

const mapReportDownloadEvent = (
  doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>
): ReportDownloadEvent => {
  const data = doc.data();
  const downloadedAtIsServerTimestamp = data.downloadedAt instanceof firebase.firestore.Timestamp;
  return {
    id: doc.id,
    uid: String(data.uid ?? ''),
    email: String(data.email ?? ''),
    loginId: String(data.loginId ?? ''),
    clientId: String(data.clientId ?? ''),
    reportClientId: String(data.reportClientId ?? ''),
    reportLabel: String(data.reportLabel ?? ''),
    periodStart: String(data.periodStart ?? ''),
    periodEnd: String(data.periodEnd ?? ''),
    filename: String(data.filename ?? ''),
    reportUpdatedAt: Number(data.reportUpdatedAt ?? 0),
    downloadedAt: downloadedAtIsServerTimestamp
      ? data.downloadedAt.toMillis()
      : Number(data.downloadedAt ?? 0),
    downloadedAtTrusted: downloadedAtIsServerTimestamp
  };
};

export const recordReportDownload = async ({
  loginId,
  clientId,
  reportClientId,
  reportLabel,
  periodStart,
  periodEnd,
  filename,
  reportUpdatedAt
}: Omit<ReportDownloadEvent, 'id' | 'uid' | 'email' | 'downloadedAt' | 'downloadedAtTrusted'>) => {
  const user = firebase.auth().currentUser;
  if (!user) return;
  await db.collection(REPORT_DOWNLOAD_EVENTS_COLLECTION).add({
    uid: user.uid,
    email: normalizeEmail(user.email),
    loginId: loginId.trim(),
    clientId,
    reportClientId,
    reportLabel,
    periodStart,
    periodEnd,
    filename,
    reportUpdatedAt: Number.isFinite(reportUpdatedAt) ? reportUpdatedAt : 0,
    downloadedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};

export const subscribeReportDownloadEvents = (
  onValue: (events: ReportDownloadEvent[]) => void,
  onError: (error: unknown) => void
) =>
  db.collection(REPORT_DOWNLOAD_EVENTS_COLLECTION)
    .orderBy('downloadedAt', 'desc')
    .limit(1000)
    .onSnapshot(
      (snapshot) => onValue(snapshot.docs.map(mapReportDownloadEvent)),
      (error) => onError(error)
    );

export const fetchReportDownloadEvents = async (): Promise<ReportDownloadEvent[]> => {
  const snapshot = await db.collection(REPORT_DOWNLOAD_EVENTS_COLLECTION)
    .orderBy('downloadedAt', 'desc')
    .limit(1000)
    .get();
  return snapshot.docs.map(mapReportDownloadEvent);
};

export const deleteReportDownloadEvent = async (eventId: string) => {
  const cleanEventId = eventId.trim();
  if (!cleanEventId) throw new Error('Identificador de descarga no valido.');
  await db.collection(REPORT_DOWNLOAD_EVENTS_COLLECTION).doc(cleanEventId).delete();
};
