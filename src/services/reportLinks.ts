// Importar db desde cloudPortfolio para asegurar que Firebase está inicializado con settings
import { db } from './cloudPortfolio';

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

// Generar token único
const generateToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// Guardar informe con token y caducidad 24h
export const saveReportLink = async (data: Omit<ReportData, 'createdAt' | 'expiresAt'>): Promise<string> => {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 horas

  const reportData: ReportData = {
    ...data,
    createdAt: now,
    expiresAt
  };

  await db.collection('reportLinks').doc(token).set(reportData);
  return token;
};

// Obtener informe por token (si no ha caducado)
export const getReportByToken = async (token: string): Promise<ReportData | null> => {
  const doc = await db.collection('reportLinks').doc(token).get();
  if (!doc.exists) return null;

  const data = doc.data() as ReportData;
  if (Date.now() > data.expiresAt) {
    // Caducado, eliminar
    await db.collection('reportLinks').doc(token).delete();
    return null;
  }

  return data;
};
