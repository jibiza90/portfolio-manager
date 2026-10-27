import { CLIENTS } from '../constants/clients';
import type { Movement, MonthlyHistoryEntry } from '../types';
import { auth, db, firebase } from './firebaseApp';

export interface AdminBackupLocalData {
  contacts: Record<string, unknown>;
  guarantees: Record<string, number>;
  comisionesCobradas: Record<string, number>;
  comisionEstado: Record<string, boolean>;
  followUpByClient: Record<string, unknown[]>;
  portfolioState: {
    finalByDay: Record<string, number | undefined>;
    movementsByClient: Record<string, Record<string, Movement>>;
    monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  };
}

const BACKUP_TYPE = 'portfolio-manager-admin-backup';

type FirestoreRow<T = Record<string, unknown>> = {
  id: string;
  path: string;
  data: T;
};

const serialiseSnapshot = <T = Record<string, unknown>>(
  snapshot: firebase.firestore.QuerySnapshot
): Array<FirestoreRow<T>> =>
  snapshot.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    data: doc.data() as T
  }));

const serialiseDoc = <T = Record<string, unknown>>(
  doc: firebase.firestore.DocumentSnapshot
): FirestoreRow<T> | null => {
  if (!doc.exists) return null;
  return {
    id: doc.id,
    path: doc.ref.path,
    data: doc.data() as T
  };
};

const readPortfolioLocalStorage = () => {
  if (typeof window === 'undefined') return {};
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith('portfolio-'))
    .sort()
    .reduce<Record<string, string | null>>((acc, key) => {
      acc[key] = window.localStorage.getItem(key);
      return acc;
    }, {});
};

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const createAndDownloadAdminBackup = async (localData: AdminBackupLocalData) => {
  const createdAt = new Date().toISOString();
  const createdAtFile = createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const currentUser = auth.currentUser;

  const [
    remotePortfolioDoc,
    clientPublicationDoc,
    accessProfilesSnapshot,
    clientOverviewsSnapshot,
    archivedClientsSnapshot,
    reportLinksSnapshot,
    adminPasswordEventsSnapshot,
    loginEventsSnapshot,
    supportThreadsSnapshot
  ] = await Promise.all([
    db.doc('portfolio/state').get(),
    db.doc('portfolio/client-publication').get(),
    db.collection('access_profiles').get(),
    db.collection('portfolio_client_overviews').get(),
    db.collection('portfolio_archived_clients').get(),
    db.collection('reportLinks').get(),
    db.collection('admin_password_events').get(),
    db.collection('auth_login_events').get(),
    db.collection('support_threads').get()
  ]);

  const supportThreads = serialiseSnapshot(supportThreadsSnapshot);
  const supportMessages = await Promise.all(
    supportThreads.map(async (thread) => ({
      clientId: thread.id,
      path: `${thread.path}/messages`,
      messages: serialiseSnapshot(await db.collection('support_threads').doc(thread.id).collection('messages').get())
    }))
  );

  const [
    presenceSnapshot,
    downloadEventsSnapshot,
    privacyConsentsSnapshot,
    legalAcknowledgementsSnapshot
  ] = await Promise.all([
    db.collection('auth_presence').get(),
    db.collection('report_download_events').get(),
    db.collection('client_privacy_consents').get(),
    db.collection('client_legal_acknowledgements').get()
  ]);

  // La actividad cuelga de cada cliente: se recorre la lista de clientes y los
  // clientes con acceso (por si alguno no estuviera en la lista local).
  const activityClientIds = [...new Set([
    ...CLIENTS.map((client) => client.id),
    ...accessProfilesSnapshot.docs
      .map((doc) => String(doc.data().clientId ?? ''))
      .filter(Boolean)
  ])];
  const clientActivity = (await Promise.all(
    activityClientIds.map(async (clientId) => {
      const clientRef = db.collection('client_activity').doc(clientId);
      const [sessions, events, devices] = await Promise.all([
        clientRef.collection('sessions').get(),
        clientRef.collection('events').get(),
        clientRef.collection('devices').get()
      ]);
      return {
        clientId,
        sessions: serialiseSnapshot(sessions),
        events: serialiseSnapshot(events),
        devices: serialiseSnapshot(devices)
      };
    })
  )).filter((row) => row.sessions.length > 0 || row.events.length > 0 || row.devices.length > 0);

  const backup = {
    type: BACKUP_TYPE,
    version: 2,
    createdAt,
    createdBy: {
      uid: currentUser?.uid ?? null,
      email: currentUser?.email ?? null
    },
    warning:
      'Backup de solo lectura generado desde admin. No incluye passwords reales de Firebase Auth porque no se pueden leer en claro.',
    clients: CLIENTS,
    localData: {
      ...localData,
      localStorageRaw: readPortfolioLocalStorage()
    },
    firestore: {
      portfolioState: serialiseDoc(remotePortfolioDoc),
      clientPublication: serialiseDoc(clientPublicationDoc),
      accessProfiles: serialiseSnapshot(accessProfilesSnapshot),
      clientOverviews: serialiseSnapshot(clientOverviewsSnapshot),
      archivedClients: serialiseSnapshot(archivedClientsSnapshot),
      reportLinks: serialiseSnapshot(reportLinksSnapshot),
      adminPasswordEvents: serialiseSnapshot(adminPasswordEventsSnapshot),
      authLoginEvents: serialiseSnapshot(loginEventsSnapshot),
      supportThreads,
      supportMessages,
      authPresence: serialiseSnapshot(presenceSnapshot),
      reportDownloadEvents: serialiseSnapshot(downloadEventsSnapshot),
      clientPrivacyConsents: serialiseSnapshot(privacyConsentsSnapshot),
      clientLegalAcknowledgements: serialiseSnapshot(legalAcknowledgementsSnapshot),
      clientActivity
    },
    counts: {
      clients: CLIENTS.length,
      accessProfiles: accessProfilesSnapshot.size,
      clientOverviews: clientOverviewsSnapshot.size,
      archivedClients: archivedClientsSnapshot.size,
      reportLinks: reportLinksSnapshot.size,
      adminPasswordEvents: adminPasswordEventsSnapshot.size,
      authLoginEvents: loginEventsSnapshot.size,
      supportThreads: supportThreadsSnapshot.size,
      supportMessages: supportMessages.reduce((sum, thread) => sum + thread.messages.length, 0),
      reportDownloadEvents: downloadEventsSnapshot.size,
      clientActivitySessions: clientActivity.reduce((sum, row) => sum + row.sessions.length, 0),
      clientActivityEvents: clientActivity.reduce((sum, row) => sum + row.events.length, 0)
    },
    restoreNotes: [
      'Se puede restaurar desde Backup > Restaurar desde archivo (solo admin principal).',
      'La restauracion descarga antes un backup del estado actual y nunca borra documentos que no esten en el archivo.',
      'Las contrasenas de usuarios no se pueden copiar: si se recrea un acceso, se asigna una nueva.'
    ]
  };

  const filename = `portfolio-backup-${createdAtFile}.json`;
  downloadJson(filename, backup);
  return { filename, counts: backup.counts };
};

// ---------------------------------------------------------------------------
// Restauracion desde archivo
// ---------------------------------------------------------------------------

type BackupWrite = { path: string; data: Record<string, unknown> };

export interface AdminBackupRestorePlan {
  createdAt: string;
  createdByEmail: string | null;
  version: number;
  // Datos principales: si alguno falla, la restauracion se considera fallida.
  coreWrites: BackupWrite[];
  // Registros historicos (accesos, actividad...): se intentan, pero un fallo no bloquea.
  historyWrites: BackupWrite[];
  localStorage: Record<string, string>;
  skippedExpiredReportLinks: number;
  summary: {
    clients: number;
    clientsWithMovements: number;
    movements: number;
    dailyFinals: number;
    accessProfiles: number;
    clientOverviews: number;
    supportMessages: number;
    historyRecords: number;
    localKeys: number;
  };
}

export interface AdminBackupRestoreResult {
  coreWritten: number;
  historyWritten: number;
  historyFailed: number;
  localKeys: number;
}

const BATCH_SIZE = 400;
// Claves locales que dependen del equipo y no deben copiarse.
const LOCAL_KEYS_NOT_RESTORED = new Set(['portfolio-client-device-id']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// JSON convierte los Timestamp de Firestore en { seconds, nanoseconds }: se reconstruyen.
const reviveFirestoreValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reviveFirestoreValue);
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (
    keys.length === 2 &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number'
  ) {
    return new firebase.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveFirestoreValue(item)]));
};

const rowsToWrites = (rows: unknown): BackupWrite[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is FirestoreRow => isRecord(row) && typeof row.path === 'string' && isRecord(row.data))
    .map((row) => ({ path: row.path, data: reviveFirestoreValue(row.data) as Record<string, unknown> }));
};

export const parseAdminBackup = (text: string): AdminBackupRestorePlan => {
  let backup: unknown;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON valido.');
  }
  if (!isRecord(backup) || backup.type !== BACKUP_TYPE || !isRecord(backup.firestore)) {
    throw new Error('El archivo no es un backup de Portfolio Manager.');
  }

  const firestore = backup.firestore;
  const localData = isRecord(backup.localData) ? backup.localData : {};

  // Estado de cartera: preferimos el documento de Firestore; si no existe, el de la app.
  const portfolioDoc = isRecord(firestore.portfolioState) ? firestore.portfolioState : null;
  const localPortfolio = isRecord(localData.portfolioState) ? localData.portfolioState : null;
  const portfolioData = isRecord(portfolioDoc?.data)
    ? portfolioDoc.data
    : localPortfolio
      ? { ...localPortfolio, revision: `restore-${Date.now()}`, updatedAt: Date.now() }
      : null;
  if (!portfolioData || !isRecord(portfolioData.movementsByClient)) {
    throw new Error('El backup no contiene los datos de la cartera.');
  }

  const coreWrites: BackupWrite[] = [
    { path: 'portfolio/state', data: reviveFirestoreValue(portfolioData) as Record<string, unknown> }
  ];
  if (isRecord(firestore.clientPublication) && isRecord(firestore.clientPublication.data)) {
    coreWrites.push({ path: 'portfolio/client-publication', data: firestore.clientPublication.data });
  }
  coreWrites.push(...rowsToWrites(firestore.accessProfiles));
  coreWrites.push(...rowsToWrites(firestore.clientOverviews));
  coreWrites.push(...rowsToWrites(firestore.archivedClients));

  // Los enlaces de informe caducados no se pueden volver a crear (las reglas lo impiden) y ya no sirven.
  const now = Date.now();
  const reportLinks = rowsToWrites(firestore.reportLinks);
  const validReportLinks = reportLinks.filter((row) => typeof row.data.expiresAt === 'number' && row.data.expiresAt > now + 60_000);
  coreWrites.push(...validReportLinks);

  coreWrites.push(...rowsToWrites(firestore.supportThreads));
  const supportMessageWrites = Array.isArray(firestore.supportMessages)
    ? firestore.supportMessages.flatMap((thread) => (isRecord(thread) ? rowsToWrites(thread.messages) : []))
    : [];
  coreWrites.push(...supportMessageWrites);

  const historyWrites: BackupWrite[] = [
    ...rowsToWrites(firestore.adminPasswordEvents),
    ...rowsToWrites(firestore.authLoginEvents),
    ...rowsToWrites(firestore.authPresence),
    ...rowsToWrites(firestore.reportDownloadEvents),
    ...rowsToWrites(firestore.clientPrivacyConsents),
    ...rowsToWrites(firestore.clientLegalAcknowledgements),
    ...(Array.isArray(firestore.clientActivity)
      ? firestore.clientActivity.flatMap((row) => (isRecord(row)
        ? [...rowsToWrites(row.sessions), ...rowsToWrites(row.events), ...rowsToWrites(row.devices)]
        : []))
      : [])
  ];

  // Datos guardados en el navegador del admin (contactos, comisiones, seguimiento...).
  const localStorageData: Record<string, string> = {};
  const raw = isRecord(localData.localStorageRaw) ? localData.localStorageRaw : {};
  Object.entries(raw).forEach(([key, value]) => {
    if (key.startsWith('portfolio-') && typeof value === 'string' && !LOCAL_KEYS_NOT_RESTORED.has(key)) {
      localStorageData[key] = value;
    }
  });
  const fallbackLocal: Array<[string, unknown]> = [
    ['portfolio-contacts', localData.contacts],
    ['portfolio-guarantees', localData.guarantees],
    ['portfolio-comisiones-cobradas', localData.comisionesCobradas],
    ['portfolio-comision-estado', localData.comisionEstado],
    ['portfolio-followup-by-client', localData.followUpByClient]
  ];
  fallbackLocal.forEach(([key, value]) => {
    if (!(key in localStorageData) && isRecord(value)) localStorageData[key] = JSON.stringify(value);
  });
  if (Array.isArray(backup.clients) && backup.clients.length > 0) {
    localStorageData['portfolio-clients'] = JSON.stringify(backup.clients);
  }

  const movementsByClient = portfolioData.movementsByClient as Record<string, Record<string, unknown>>;
  const movements = Object.values(movementsByClient).reduce((sum, rows) => sum + Object.keys(rows ?? {}).length, 0);
  const finalByDay = isRecord(portfolioData.finalByDay) ? portfolioData.finalByDay : {};

  return {
    createdAt: typeof backup.createdAt === 'string' ? backup.createdAt : '',
    createdByEmail: isRecord(backup.createdBy) && typeof backup.createdBy.email === 'string' ? backup.createdBy.email : null,
    version: typeof backup.version === 'number' ? backup.version : 1,
    coreWrites,
    historyWrites,
    localStorage: localStorageData,
    skippedExpiredReportLinks: reportLinks.length - validReportLinks.length,
    summary: {
      clients: Array.isArray(backup.clients) ? backup.clients.length : 0,
      clientsWithMovements: Object.values(movementsByClient).filter((rows) => Object.keys(rows ?? {}).length > 0).length,
      movements,
      dailyFinals: Object.keys(finalByDay).length,
      accessProfiles: rowsToWrites(firestore.accessProfiles).length,
      clientOverviews: rowsToWrites(firestore.clientOverviews).length,
      supportMessages: supportMessageWrites.length,
      historyRecords: historyWrites.length,
      localKeys: Object.keys(localStorageData).length
    }
  };
};

const commitInBatches = async (writes: BackupWrite[]) => {
  for (let index = 0; index < writes.length; index += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(index, index + BATCH_SIZE).forEach((write) => batch.set(db.doc(write.path), write.data));
    await batch.commit();
  }
};

// Escribe el contenido del backup. No borra ningun documento que no este en el archivo.
export const restoreAdminBackup = async (
  plan: AdminBackupRestorePlan,
  onProgress?: (message: string) => void
): Promise<AdminBackupRestoreResult> => {
  onProgress?.('Restaurando datos principales...');
  await commitInBatches(plan.coreWrites);

  // Los registros historicos se escriben por separado para que un rechazo de permisos
  // en uno no impida restaurar el resto.
  let historyWritten = 0;
  let historyFailed = 0;
  for (let index = 0; index < plan.historyWrites.length; index += 25) {
    onProgress?.(`Restaurando historial (${index}/${plan.historyWrites.length})...`);
    const results = await Promise.allSettled(
      plan.historyWrites.slice(index, index + 25).map((write) => db.doc(write.path).set(write.data))
    );
    results.forEach((result) => {
      if (result.status === 'fulfilled') historyWritten += 1;
      else historyFailed += 1;
    });
  }

  onProgress?.('Restaurando datos del navegador...');
  Object.entries(plan.localStorage).forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });

  return {
    coreWritten: plan.coreWrites.length,
    historyWritten,
    historyFailed,
    localKeys: Object.keys(plan.localStorage).length
  };
};
