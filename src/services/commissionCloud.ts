import { CLIENTS, isDemoClient } from '../constants/clients';
import { getCommissionRate, loadCommissionRates } from '../utils/commissions';
import { db } from './firebaseApp';

// Copia en Firebase de las comisiones que el admin gestiona en su navegador:
// el porcentaje de cada cliente y las retiradas cuya comision esta marcada como cobrada.
// El navegador del admin sigue siendo la fuente; aqui solo se replica (nunca se borra nada local).
export const CLIENT_COMMISSIONS_COLLECTION = 'client_commissions';
const PAID_WITHDRAWALS_STORAGE_KEY = 'portfolio-comision-estado-retiro';

export interface ClientCommissionsDoc {
  clientId: string;
  rate: number | null;
  paidWithdrawalIsos: string[];
  updatedAt: number;
}

const readPaidMarks = (): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PAID_WITHDRAWALS_STORAGE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
};

const buildMirror = () => {
  const rates = loadCommissionRates();
  const marks = readPaidMarks();
  return CLIENTS.filter((client) => !isDemoClient(client.id) || client.id === 'client-001').map((client) => {
    const prefix = `${client.id}-`;
    const paidWithdrawalIsos = Object.entries(marks)
      .filter(([key, paid]) => paid === true && key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length)))
      .map(([key]) => key.slice(prefix.length))
      .sort();
    return { clientId: client.id, rate: getCommissionRate(client.id, rates), paidWithdrawalIsos };
  });
};

let lastPushed = '';
let pushTimer: number | null = null;

// Sube la copia si ha cambiado desde la ultima vez. Los fallos (por ejemplo permisos aun no publicados)
// no afectan a nada: la pantalla de Comisiones sigue funcionando con los datos del navegador.
export const pushCommissionsMirror = async () => {
  const mirror = buildMirror();
  const signature = JSON.stringify(mirror);
  if (signature === lastPushed) return;
  const batch = db.batch();
  const now = Date.now();
  mirror.forEach((entry) => {
    batch.set(db.collection(CLIENT_COMMISSIONS_COLLECTION).doc(entry.clientId), { ...entry, updatedAt: now });
  });
  try {
    await batch.commit();
    lastPushed = signature;
  } catch (error) {
    console.warn('No se pudo copiar las comisiones a Firebase', error);
  }
};

export const schedulePushCommissionsMirror = (delayMs = 1200) => {
  if (typeof window === 'undefined') return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushCommissionsMirror();
  }, delayMs);
};

export const fetchClientCommissions = async (clientId: string): Promise<ClientCommissionsDoc | null> => {
  try {
    const doc = await db.collection(CLIENT_COMMISSIONS_COLLECTION).doc(clientId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Partial<ClientCommissionsDoc>;
    return {
      clientId,
      rate: typeof data.rate === 'number' ? data.rate : null,
      paidWithdrawalIsos: Array.isArray(data.paidWithdrawalIsos) ? data.paidWithdrawalIsos.filter((iso): iso is string => typeof iso === 'string') : [],
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0
    };
  } catch {
    return null;
  }
};
