import { db, firebase } from './firebaseApp';

export type SupportSenderRole = 'admin' | 'client';

export interface SupportThread {
  clientId: string;
  clientName: string;
  clientEmail: string;
  lastMessageText: string;
  lastMessageAt: number;
  updatedAt: number;
  adminUnreadCount: number;
}

export interface SupportMessage {
  id: string;
  clientId: string;
  senderRole: SupportSenderRole;
  senderName: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  clientRead: boolean;
  clientReadAt: number | null;
  edited: boolean;
}

const THREADS_COLLECTION = 'support_threads';

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');

const mapMessage = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): SupportMessage => {
  const data = doc.data();
  return {
    id: doc.id,
    clientId: String(data.clientId ?? ''),
    senderRole: (data.senderRole === 'admin' ? 'admin' : 'client') as SupportSenderRole,
    senderName: String(data.senderName ?? ''),
    text: String(data.text ?? ''),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? data.createdAt ?? 0),
    clientRead: Boolean(data.clientRead),
    clientReadAt: data.clientReadAt === null || data.clientReadAt === undefined ? null : Number(data.clientReadAt),
    edited: Boolean(data.edited)
  };
};

const mapThread = (doc: firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>): SupportThread => {
  const data = doc.data();
  return {
    clientId: doc.id,
    clientName: String(data.clientName ?? ''),
    clientEmail: String(data.clientEmail ?? ''),
    lastMessageText: String(data.lastMessageText ?? ''),
    lastMessageAt: Number(data.lastMessageAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    adminUnreadCount: Number(data.adminUnreadCount ?? 0)
  };
};

const threadRef = (clientId: string) => db.collection(THREADS_COLLECTION).doc(clientId);
const messagesRef = (clientId: string) => threadRef(clientId).collection('messages');

export const sendSupportMessage = async ({
  clientId,
  clientName,
  clientEmail,
  senderRole,
  senderName,
  text
}: {
  clientId: string;
  clientName: string;
  clientEmail: string;
  senderRole: SupportSenderRole;
  senderName: string;
  text: string;
}) => {
  const cleanText = normalizeText(text);
  if (!cleanText) return;
  const now = Date.now();
  const tRef = threadRef(clientId);
  const mRef = messagesRef(clientId).doc();

  await db.runTransaction(async (tx) => {
    const tSnap = await tx.get(tRef);
    const prevUnread = Number(tSnap.data()?.adminUnreadCount ?? 0);
    const nextUnread = senderRole === 'client' ? prevUnread + 1 : prevUnread;

    tx.set(
      mRef,
      {
        clientId,
        senderRole,
        senderName: senderName.trim(),
        text: cleanText,
        createdAt: now,
        updatedAt: now,
        clientRead: senderRole === 'client',
        clientReadAt: senderRole === 'client' ? now : null,
        edited: false
      },
      { merge: false }
    );

    tx.set(
      tRef,
      {
        clientId,
        clientName,
        clientEmail,
        lastMessageText: cleanText,
        lastMessageAt: now,
        updatedAt: now,
        adminUnreadCount: nextUnread
      },
      { merge: true }
    );
  });
};

export const editAdminSupportMessage = async ({
  clientId,
  messageId,
  text
}: {
  clientId: string;
  messageId: string;
  text: string;
}) => {
  const cleanText = normalizeText(text);
  if (!cleanText) return;
  const now = Date.now();
  const ref = messagesRef(clientId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.senderRole !== 'admin') return;
  await ref.set(
    {
      text: cleanText,
      updatedAt: now,
      edited: true
    },
    { merge: true }
  );
  const latestMessage = await messagesRef(clientId).orderBy('createdAt', 'desc').limit(1).get();
  const latest = latestMessage.docs[0]?.data() ?? null;
  await threadRef(clientId).set(
    {
      lastMessageText: String(latest?.text ?? cleanText),
      lastMessageAt: Number(latest?.createdAt ?? now),
      updatedAt: now
    },
    { merge: true }
  );
};

export const markThreadSeenByAdmin = async (clientId: string) => {
  await threadRef(clientId).set(
    {
      adminUnreadCount: 0,
      adminLastSeenAt: Date.now()
    },
    { merge: true }
  );
};

export const markMessagesReadByClient = async (clientId: string) => {
  const now = Date.now();
  const unread = await messagesRef(clientId)
    .where('senderRole', '==', 'admin')
    .where('clientRead', '==', false)
    .get();
  if (!unread.empty) {
    const batch = db.batch();
    unread.docs.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          clientRead: true,
          clientReadAt: now,
          updatedAt: now
        },
        { merge: true }
      );
    });
    await batch.commit();
  }
  await threadRef(clientId).set(
    {
      clientLastSeenAt: now,
      updatedAt: now
    },
    { merge: true }
  );
};

export const subscribeSupportMessages = (
  clientId: string,
  onValue: (messages: SupportMessage[]) => void,
  onError: (error: unknown) => void
) =>
  messagesRef(clientId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(
      (snapshot) => onValue(snapshot.docs.map(mapMessage)),
      (error) => onError(error)
    );

export const subscribeSupportThreads = (
  onValue: (threads: SupportThread[]) => void,
  onError: (error: unknown) => void
) =>
  db
    .collection(THREADS_COLLECTION)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onValue(snapshot.docs.map(mapThread)),
      (error) => onError(error)
    );

export const subscribeThread = (
  clientId: string,
  onValue: (thread: SupportThread | null) => void,
  onError: (error: unknown) => void
) =>
  threadRef(clientId).onSnapshot(
    (doc) => {
      if (!doc.exists) {
        onValue(null);
        return;
      }
      const data = doc.data() ?? {};
      onValue({
        clientId: doc.id,
        clientName: String(data.clientName ?? ''),
        clientEmail: String(data.clientEmail ?? ''),
        lastMessageText: String(data.lastMessageText ?? ''),
        lastMessageAt: Number(data.lastMessageAt ?? 0),
        updatedAt: Number(data.updatedAt ?? 0),
        adminUnreadCount: Number(data.adminUnreadCount ?? 0)
      });
    },
    (error) => onError(error)
  );
