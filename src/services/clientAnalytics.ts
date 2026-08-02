import { db, firebase } from './firebaseApp';

export type ClientAnalyticsChoice = 'essential' | 'all';
export type ClientActivityCategory = 'security' | 'usage';

export interface ClientAnalyticsConsent {
  uid: string;
  clientId: string;
  choice: ClientAnalyticsChoice;
  policyVersion: string;
  decidedAt: number;
  updatedAt: number;
}

export interface ClientActivitySession {
  id: string;
  uid: string;
  clientId: string;
  loginId: string;
  deviceId: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  screen: string;
  viewport: string;
  language: string;
  timezone: string;
  connectionType: string;
  country: string;
  city: string;
  isNewDevice: boolean;
  analyticsChoice: ClientAnalyticsChoice;
  startedAt: number;
  lastSeenAt: number;
  endedAt: number | null;
  endReason: string;
}

export interface ClientActivityEvent {
  id: string;
  uid: string;
  clientId: string;
  sessionId: string;
  category: ClientActivityCategory;
  type: string;
  label: string;
  occurredAt: number;
  durationMs: number;
  metadata: Record<string, string | number | boolean>;
}

export interface ClientDeviceRecord {
  id: string;
  uid: string;
  clientId: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  screen: string;
  language: string;
  timezone: string;
  firstSeenAt: number;
  lastSeenAt: number;
  loginCount: number;
}

export interface ClientActivitySnapshot {
  sessions: ClientActivitySession[];
  events: ClientActivityEvent[];
  devices: ClientDeviceRecord[];
}

export interface ClientActivityTracker {
  sessionId: string;
  record: (event: {
    category: ClientActivityCategory;
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  setChoice: (choice: ClientAnalyticsChoice) => Promise<void>;
  end: (reason: string) => Promise<void>;
}

interface PendingLoginFailures {
  count: number;
  firstAt: number;
  lastAt: number;
  lastCode: string;
}

const CONSENTS_COLLECTION = 'client_privacy_consents';
const ACTIVITY_COLLECTION = 'client_activity';
const DEVICE_STORAGE_KEY = 'portfolio-client-device-id';
const LOGIN_FAILURE_STORAGE_PREFIX = 'portfolio-login-failures:';
const HEARTBEAT_MS = 60_000;
export const CLIENT_ANALYTICS_POLICY_VERSION = 'portal-analytics-v1';

const cleanText = (value: unknown, maxLength = 180) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const safeNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeMetadata = (metadata: Record<string, unknown> | undefined) => {
  const normalized: Record<string, string | number | boolean> = {};
  Object.entries(metadata ?? {}).slice(0, 16).forEach(([key, value]) => {
    const cleanKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    if (!cleanKey) return;
    if (typeof value === 'boolean') normalized[cleanKey] = value;
    if (typeof value === 'number' && Number.isFinite(value)) normalized[cleanKey] = value;
    if (typeof value === 'string') normalized[cleanKey] = value.slice(0, 220);
  });
  return normalized;
};

const mapConsent = (data: firebase.firestore.DocumentData | undefined): ClientAnalyticsConsent | null => {
  if (!data || (data.choice !== 'essential' && data.choice !== 'all')) return null;
  return {
    uid: cleanText(data.uid),
    clientId: cleanText(data.clientId),
    choice: data.choice,
    policyVersion: cleanText(data.policyVersion),
    decidedAt: safeNumber(data.decidedAt),
    updatedAt: safeNumber(data.updatedAt)
  };
};

export const fetchClientAnalyticsConsent = async (uid: string) => {
  const cleanUid = uid.trim();
  if (!cleanUid) return null;
  const snapshot = await db.collection(CONSENTS_COLLECTION).doc(cleanUid).get();
  return mapConsent(snapshot.data());
};

export const saveClientAnalyticsConsent = async (
  uid: string,
  clientId: string,
  choice: ClientAnalyticsChoice
) => {
  const now = Date.now();
  const previous = await db.collection(CONSENTS_COLLECTION).doc(uid).get();
  const previousData = previous.data();
  const consent: ClientAnalyticsConsent = {
    uid,
    clientId,
    choice,
    policyVersion: CLIENT_ANALYTICS_POLICY_VERSION,
    decidedAt: safeNumber(previousData?.decidedAt, now),
    updatedAt: now
  };
  await db.collection(CONSENTS_COLLECTION).doc(uid).set(consent);
  return consent;
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

const getDeviceId = () => {
  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const created = randomId();
  window.localStorage.setItem(DEVICE_STORAGE_KEY, created);
  return created;
};

const describeBrowser = (userAgent: string) => {
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/CriOS\//i.test(userAgent)) return 'Chrome iOS';
  if (/Chrome\//i.test(userAgent)) return 'Google Chrome';
  if (/FxiOS\//i.test(userAgent)) return 'Firefox iOS';
  if (/Firefox\//i.test(userAgent)) return 'Mozilla Firefox';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Navegador no identificado';
};

const describeOperatingSystem = (userAgent: string) => {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS / iPadOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Sistema no identificado';
};

const describeDeviceType = (userAgent: string) => {
  if (/iPad|Tablet/i.test(userAgent)) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(userAgent)) return 'Movil';
  return 'Ordenador';
};

const getConnectionType = () => {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return cleanText(connection?.effectiveType) || 'No disponible';
};

const getDeviceDescriptor = () => {
  const userAgent = navigator.userAgent || '';
  return {
    deviceType: describeDeviceType(userAgent),
    browser: describeBrowser(userAgent),
    operatingSystem: describeOperatingSystem(userAgent),
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language || 'No disponible',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'No disponible',
    connectionType: getConnectionType()
  };
};

const fetchConfiguredApproximateLocation = async () => {
  const endpoint = cleanText(import.meta.env.VITE_APPROX_GEO_ENDPOINT, 500);
  if (!endpoint) return { country: '', city: '' };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) return { country: '', city: '' };
    const data = await response.json() as Record<string, unknown>;
    return {
      country: cleanText(data.country ?? data.country_name ?? data.countryName),
      city: cleanText(data.city)
    };
  } catch {
    return { country: '', city: '' };
  } finally {
    window.clearTimeout(timeout);
  }
};

export const recordLocalLoginFailure = (identifier: string, code: string) => {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier || normalizedIdentifier.includes('@')) return;
  const key = `${LOGIN_FAILURE_STORAGE_PREFIX}${normalizedIdentifier}`;
  const now = Date.now();
  let previous: PendingLoginFailures | null = null;
  try {
    previous = JSON.parse(window.localStorage.getItem(key) ?? 'null') as PendingLoginFailures | null;
  } catch {
    previous = null;
  }
  const next: PendingLoginFailures = {
    count: Math.min(20, Math.max(0, safeNumber(previous?.count)) + 1),
    firstAt: safeNumber(previous?.firstAt, now),
    lastAt: now,
    lastCode: cleanText(code, 80)
  };
  window.localStorage.setItem(key, JSON.stringify(next));
};

export const consumeLocalLoginFailures = (loginId: string) => {
  const normalizedLoginId = loginId.trim().toLowerCase();
  if (!normalizedLoginId) return null;
  const key = `${LOGIN_FAILURE_STORAGE_PREFIX}${normalizedLoginId}`;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as PendingLoginFailures | null;
    window.localStorage.removeItem(key);
    if (!parsed || safeNumber(parsed.count) <= 0) return null;
    return {
      count: Math.min(20, safeNumber(parsed.count)),
      firstAt: safeNumber(parsed.firstAt),
      lastAt: safeNumber(parsed.lastAt),
      lastCode: cleanText(parsed.lastCode, 80)
    };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
};

export const createClientActivityTracker = async ({
  uid,
  clientId,
  loginId,
  choice
}: {
  uid: string;
  clientId: string;
  loginId: string;
  choice: ClientAnalyticsChoice;
}): Promise<ClientActivityTracker> => {
  const now = Date.now();
  const sessionId = randomId();
  const deviceId = getDeviceId();
  const descriptor = getDeviceDescriptor();
  const clientRef = db.collection(ACTIVITY_COLLECTION).doc(clientId);
  const deviceRef = clientRef.collection('devices').doc(deviceId);
  const sessionRef = clientRef.collection('sessions').doc(sessionId);
  const existingDevice = await deviceRef.get();
  const existingDeviceData = existingDevice.data();
  const isNewDevice = !existingDevice.exists;
  const location = choice === 'all' ? await fetchConfiguredApproximateLocation() : { country: '', city: '' };

  const batch = db.batch();
  batch.set(deviceRef, {
    uid,
    clientId,
    deviceType: descriptor.deviceType,
    browser: descriptor.browser,
    operatingSystem: descriptor.operatingSystem,
    screen: descriptor.screen,
    language: descriptor.language,
    timezone: descriptor.timezone,
    firstSeenAt: safeNumber(existingDeviceData?.firstSeenAt, now),
    lastSeenAt: now,
    loginCount: safeNumber(existingDeviceData?.loginCount) + 1
  });
  batch.set(sessionRef, {
    uid,
    clientId,
    loginId,
    deviceId,
    ...descriptor,
    country: location.country,
    city: location.city,
    isNewDevice,
    analyticsChoice: choice,
    startedAt: now,
    lastSeenAt: now,
    endedAt: null,
    endReason: ''
  });
  await batch.commit();

  let currentChoice = choice;
  let ended = false;
  const heartbeat = window.setInterval(() => {
    if (ended || document.visibilityState !== 'visible') return;
    void sessionRef.update({ lastSeenAt: Date.now() }).catch(() => undefined);
  }, HEARTBEAT_MS);

  const record: ClientActivityTracker['record'] = async (event) => {
    if (ended) return;
    if (event.category === 'usage' && currentChoice !== 'all') return;
    const occurredAt = Date.now();
    await clientRef.collection('events').doc(randomId()).set({
      uid,
      clientId,
      sessionId,
      category: event.category,
      type: cleanText(event.type, 80),
      label: cleanText(event.label, 180),
      occurredAt,
      durationMs: Math.max(0, Math.round(safeNumber(event.durationMs))),
      metadata: normalizeMetadata(event.metadata)
    });
  };

  const setChoice: ClientActivityTracker['setChoice'] = async (nextChoice) => {
    currentChoice = nextChoice;
    const updates: Record<string, unknown> = {
      analyticsChoice: nextChoice,
      lastSeenAt: Date.now()
    };
    if (nextChoice === 'all' && !location.country && !location.city) {
      const nextLocation = await fetchConfiguredApproximateLocation();
      updates.country = nextLocation.country;
      updates.city = nextLocation.city;
    }
    await sessionRef.update(updates);
  };

  const end: ClientActivityTracker['end'] = async (reason) => {
    if (ended) return;
    ended = true;
    window.clearInterval(heartbeat);
    await sessionRef.update({
      lastSeenAt: Date.now(),
      endedAt: Date.now(),
      endReason: cleanText(reason, 80)
    }).catch(() => undefined);
  };

  return { sessionId, record, setChoice, end };
};

const mapSession = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): ClientActivitySession => {
  const data = doc.data();
  return {
    id: doc.id,
    uid: cleanText(data.uid),
    clientId: cleanText(data.clientId),
    loginId: cleanText(data.loginId),
    deviceId: cleanText(data.deviceId),
    deviceType: cleanText(data.deviceType),
    browser: cleanText(data.browser),
    operatingSystem: cleanText(data.operatingSystem),
    screen: cleanText(data.screen),
    viewport: cleanText(data.viewport),
    language: cleanText(data.language),
    timezone: cleanText(data.timezone),
    connectionType: cleanText(data.connectionType),
    country: cleanText(data.country),
    city: cleanText(data.city),
    isNewDevice: data.isNewDevice === true,
    analyticsChoice: data.analyticsChoice === 'all' ? 'all' : 'essential',
    startedAt: safeNumber(data.startedAt),
    lastSeenAt: safeNumber(data.lastSeenAt),
    endedAt: typeof data.endedAt === 'number' ? data.endedAt : null,
    endReason: cleanText(data.endReason)
  };
};

const mapEvent = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): ClientActivityEvent => {
  const data = doc.data();
  return {
    id: doc.id,
    uid: cleanText(data.uid),
    clientId: cleanText(data.clientId),
    sessionId: cleanText(data.sessionId),
    category: data.category === 'security' ? 'security' : 'usage',
    type: cleanText(data.type),
    label: cleanText(data.label),
    occurredAt: safeNumber(data.occurredAt),
    durationMs: safeNumber(data.durationMs),
    metadata: normalizeMetadata(data.metadata as Record<string, unknown> | undefined)
  };
};

const mapDevice = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): ClientDeviceRecord => {
  const data = doc.data();
  return {
    id: doc.id,
    uid: cleanText(data.uid),
    clientId: cleanText(data.clientId),
    deviceType: cleanText(data.deviceType),
    browser: cleanText(data.browser),
    operatingSystem: cleanText(data.operatingSystem),
    screen: cleanText(data.screen),
    language: cleanText(data.language),
    timezone: cleanText(data.timezone),
    firstSeenAt: safeNumber(data.firstSeenAt),
    lastSeenAt: safeNumber(data.lastSeenAt),
    loginCount: safeNumber(data.loginCount)
  };
};

export const fetchClientActivitySnapshot = async (clientId: string): Promise<ClientActivitySnapshot> => {
  const clientRef = db.collection(ACTIVITY_COLLECTION).doc(clientId);
  const [sessionsSnapshot, eventsSnapshot, devicesSnapshot] = await Promise.all([
    clientRef.collection('sessions').orderBy('startedAt', 'desc').limit(120).get(),
    clientRef.collection('events').orderBy('occurredAt', 'desc').limit(600).get(),
    clientRef.collection('devices').orderBy('lastSeenAt', 'desc').limit(60).get()
  ]);
  return {
    sessions: sessionsSnapshot.docs.map(mapSession),
    events: eventsSnapshot.docs.map(mapEvent),
    devices: devicesSnapshot.docs.map(mapDevice)
  };
};
