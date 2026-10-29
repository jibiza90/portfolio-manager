import type { ReportData } from '../services/reportLinks';
import type { PendingCashMovement } from '../components/ReportView';
import type { ClientReportPayload } from '../utils/clientReport';
import generated from './guestReport.json';

// Datos fijos de la demostracion. Se generan con scripts/generate-guest-demo.mjs (mismo calculo que la web).
export const GUEST_HOLDER_NAME = 'Laura Martín Vidal';
export const GUEST_CODE = 'invitado';

// Fecha del ultimo cierre que incluye la demostracion (para "actualizado el").
const PUBLISHED_AT = new Date('2026-10-01T09:00:00').getTime();

export const guestPayload = generated.report as ClientReportPayload;

export const guestReport: ReportData = {
  ...guestPayload,
  createdAt: PUBLISHED_AT,
  expiresAt: PUBLISHED_AT
};

export const guestPendingMovements = generated.pendingCashMovements as PendingCashMovement[];

export const guestCommissions = generated.commissions as { rate: number; paidWithdrawalIsos: string[] };

export interface GuestMessage {
  from: 'client' | 'admin';
  at: string;
  text: string;
}

export const guestMessages: GuestMessage[] = [
  {
    from: 'client',
    at: '2026-03-12T10:14:00',
    text: 'Hola, me gustaría retirar 38.000 € este mes. ¿Cómo lo hacemos?'
  },
  {
    from: 'admin',
    at: '2026-03-12T11:02:00',
    text: 'Hola Laura, sin problema. Lo dejamos programado para el día 20. Con esta retirada recuperas todo tu capital aportado y la comisión de éxito del 8 % solo se aplica a los 3.000 € que lo superan: son 240 €, así que recibirás 37.760 €. Tendrás el justificante en tu área.'
  },
  {
    from: 'client',
    at: '2026-03-12T11:20:00',
    text: 'Perfecto, muchas gracias.'
  }
];
