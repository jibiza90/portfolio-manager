import type { Movement } from '../types';
import { getWithdrawalCommissions } from './commissions';

// Justificante de una aportacion o retirada publicada. Mismo calculo de comision que la pantalla de Comisiones.

export interface ReceiptMovementInput {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

export interface ReceiptCommissionsInput {
  rate: number | null;
  paidWithdrawalIsos: string[];
}

export interface MovementReceiptData {
  number: string;
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
  // null: no hay datos de comisiones (o es una aportacion).
  commission: null | {
    rate: number | null;
    capitalPendingBefore: number;
    commissionableAmount: number;
    paid: boolean;
    amount: number;
  };
  net: number;
  contributedAfter: number;
  withdrawnAfter: number;
  capitalPendingAfter: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Numero estable y con aspecto aleatorio: siempre el mismo para el mismo movimiento.
export const receiptNumber = (clientId: string, iso: string, type: 'increment' | 'decrement') => {
  let hash = 0x811c9dc5;
  for (const char of `${clientId}|${iso}|${type}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `JO-${iso.slice(0, 4)}-${10_000_000 + (hash % 90_000_000)}`;
};

export const buildMovementReceipt = (
  clientId: string,
  movements: Array<{ iso: string; type: string; amount: number }>,
  target: ReceiptMovementInput,
  commissions: ReceiptCommissionsInput | null
): MovementReceiptData => {
  const record: Record<string, Movement> = {};
  movements.filter((movement) => movement.amount > 0).forEach((movement) => {
    const entry = record[movement.iso] ?? {};
    if (movement.type === 'increment') entry.increment = (entry.increment ?? 0) + movement.amount;
    else entry.decrement = (entry.decrement ?? 0) + movement.amount;
    record[movement.iso] = entry;
  });

  // Totales hasta el movimiento incluido (en el mismo dia la aportacion va antes que la retirada).
  let contributedAfter = 0;
  let withdrawnAfter = 0;
  Object.keys(record).sort().forEach((iso) => {
    if (iso > target.iso) return;
    contributedAfter += record[iso].increment ?? 0;
    if (iso < target.iso || target.type === 'decrement') withdrawnAfter += record[iso].decrement ?? 0;
  });

  let commission: MovementReceiptData['commission'] = null;
  if (target.type === 'decrement' && commissions) {
    const row = getWithdrawalCommissions(record, commissions.rate).find((item) => item.iso === target.iso);
    const paid = commissions.paidWithdrawalIsos.includes(target.iso);
    commission = {
      rate: commissions.rate,
      capitalPendingBefore: round2(row?.capitalPendingBefore ?? 0),
      commissionableAmount: round2(row?.commissionableAmount ?? 0),
      paid,
      amount: paid ? round2(row?.commission ?? 0) : 0
    };
  }

  return {
    number: receiptNumber(clientId, target.iso, target.type),
    iso: target.iso,
    type: target.type,
    amount: round2(target.amount),
    commission,
    net: round2(target.amount - (commission?.amount ?? 0)),
    contributedAfter: round2(contributedAfter),
    withdrawnAfter: round2(withdrawnAfter),
    capitalPendingAfter: round2(Math.max(0, contributedAfter - withdrawnAfter))
  };
};
