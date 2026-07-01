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
    accessProfilesSnapshot,
    clientOverviewsSnapshot,
    reportLinksSnapshot,
    adminPasswordEventsSnapshot,
    loginEventsSnapshot,
    supportThreadsSnapshot
  ] = await Promise.all([
    db.doc('portfolio/state').get(),
    db.collection('access_profiles').get(),
    db.collection('portfolio_client_overviews').get(),
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

  const backup = {
    type: 'portfolio-manager-admin-backup',
    version: 1,
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
      accessProfiles: serialiseSnapshot(accessProfilesSnapshot),
      clientOverviews: serialiseSnapshot(clientOverviewsSnapshot),
      reportLinks: serialiseSnapshot(reportLinksSnapshot),
      adminPasswordEvents: serialiseSnapshot(adminPasswordEventsSnapshot),
      authLoginEvents: serialiseSnapshot(loginEventsSnapshot),
      supportThreads,
      supportMessages
    },
    counts: {
      clients: CLIENTS.length,
      accessProfiles: accessProfilesSnapshot.size,
      clientOverviews: clientOverviewsSnapshot.size,
      reportLinks: reportLinksSnapshot.size,
      adminPasswordEvents: adminPasswordEventsSnapshot.size,
      authLoginEvents: loginEventsSnapshot.size,
      supportThreads: supportThreadsSnapshot.size,
      supportMessages: supportMessages.reduce((sum, thread) => sum + thread.messages.length, 0)
    },
    restoreNotes: [
      'Este archivo esta preparado para una futura restauracion automatica.',
      'La restauracion debe validar version, colecciones y confirmacion manual antes de escribir.',
      'Las contrasenas de usuarios deben regenerarse o restaurarse mediante export de Firebase Auth.'
    ]
  };

  const filename = `portfolio-backup-${createdAtFile}.json`;
  downloadJson(filename, backup);
  return { filename, counts: backup.counts };
};
