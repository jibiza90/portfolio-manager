import { db } from './firebaseApp';

export interface ReportData {
  clientId: string;
  clientName: string;
  clientCode: string;
  incrementos: number;
  decrementos: number;
  saldo: number;
  beneficioTotal: number;
  rentabilidad: number;
  beneficioUltimoMes: number;
  rentabilidadUltimoMes: number;
  twrYtd?: number;
  monthlyStats: Array<{
    month: string;
    profit: number;
    profitPct: number;
    endBalance: number;
    hasData: boolean;
  }>;
  patrimonioEvolution: Array<{
    month: string;
    balance?: number;
    hasData: boolean;
  }>;
  movements: Array<{
    iso: string;
    type: string;
    amount: number;
    balance: number;
  }>;
  createdAt: number;
  expiresAt: number;
}

const REPORT_TOKEN_BYTES = 32;
const REPORT_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

const toBase64Url = (bytes: Uint8Array) => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

// Generate strong random token for share links.
const generateToken = (): string => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random API no disponible para generar report token.');
  }
  const bytes = new Uint8Array(REPORT_TOKEN_BYTES);
  cryptoApi.getRandomValues(bytes);
  return toBase64Url(bytes);
};

export const isValidReportToken = (value: string | null | undefined): value is string =>
  typeof value === 'string' && REPORT_TOKEN_REGEX.test(value);

export const buildReportUrl = (baseUrl: string, token: string) => {
  if (!isValidReportToken(token)) return baseUrl;
  return `${baseUrl}#report=${token}`;
};

// Save report link with 24h expiration.
export const saveReportLink = async (data: Omit<ReportData, 'createdAt' | 'expiresAt'>): Promise<string> => {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000;

  const reportData: ReportData = {
    ...data,
    createdAt: now,
    expiresAt
  };

  await db.collection('reportLinks').doc(token).set(reportData);
  return token;
};

// Read report link if it is still valid.
export const getReportByToken = async (token: string): Promise<ReportData | null> => {
  if (!isValidReportToken(token)) return null;

  try {
    const doc = await db.collection('reportLinks').doc(token).get();
    if (!doc.exists) return null;

    const data = doc.data() as ReportData;
    if (Date.now() > data.expiresAt) {
      await db.collection('reportLinks').doc(token).delete();
      return null;
    }

    return data;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code === 'permission-denied') {
      return null;
    }
    console.error('Error leyendo report link', error);
    return null;
  }
};
