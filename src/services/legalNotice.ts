import { db, firebase } from './firebaseApp';

export const CLIENT_LEGAL_NOTICE_VERSION = 'privacy-cookies-2026-08';

export interface ClientLegalAcknowledgement {
  uid: string;
  clientId: string;
  version: string;
  acknowledgedAt: number;
}

const COLLECTION = 'client_legal_acknowledgements';

const toMillis = (value: unknown) => {
  if (value instanceof firebase.firestore.Timestamp) return value.toMillis();
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

export const fetchClientLegalAcknowledgement = async (uid: string) => {
  const cleanUid = uid.trim();
  if (!cleanUid) return null;
  const snapshot = await db.collection(COLLECTION).doc(cleanUid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  return {
    uid: String(data.uid ?? ''),
    clientId: String(data.clientId ?? ''),
    version: String(data.version ?? ''),
    acknowledgedAt: toMillis(data.acknowledgedAt)
  } satisfies ClientLegalAcknowledgement;
};

export const acknowledgeClientLegalNotice = async (uid: string, clientId: string) => {
  await db.collection(COLLECTION).doc(uid).set({
    uid,
    clientId,
    version: CLIENT_LEGAL_NOTICE_VERSION,
    acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};
