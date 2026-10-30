import { expect, test } from '@playwright/test';
import { getCapitalPendingToRecover, getWithdrawalCommissions } from '../src/utils/commissions';
import { buildMovementReceipt } from '../src/utils/movementReceipts';

// Ejemplo de Jordi: aporta 50.000, la cuenta sube a 80.000 y retira 70.000 (50.000 de capital y 20.000
// de beneficio, que pagan el 8 %). Despues aporta 50.000 nuevos: no pagan comision hasta recuperarlos.
const movements = {
  '2025-01-10': { increment: 50000 },
  '2025-12-15': { decrement: 70000 },
  '2026-02-01': { increment: 50000 },
  '2026-05-10': { decrement: 30000 },
  '2026-08-20': { decrement: 25000 }
};

test('commission is charged once on the profit and new money after a full recovery counts entirely as capital', () => {
  const rows = getWithdrawalCommissions(movements, 0.08);
  expect(rows.map(({ iso, capitalPendingBefore, commissionableAmount, commission }) => ({ iso, capitalPendingBefore, commissionableAmount, commission }))).toEqual([
    { iso: '2025-12-15', capitalPendingBefore: 50000, commissionableAmount: 20000, commission: 1600 },
    { iso: '2026-05-10', capitalPendingBefore: 50000, commissionableAmount: 0, commission: 0 },
    { iso: '2026-08-20', capitalPendingBefore: 20000, commissionableAmount: 5000, commission: 400 }
  ]);
});

test('capital pending to recover never goes below zero and restarts with new contributions', () => {
  expect(getCapitalPendingToRecover({ '2025-01-10': { increment: 50000 }, '2025-12-15': { decrement: 70000 } })).toBe(0);
  expect(getCapitalPendingToRecover({ '2025-01-10': { increment: 50000 }, '2025-12-15': { decrement: 70000 }, '2026-02-01': { increment: 50000 } })).toBe(50000);
  expect(getCapitalPendingToRecover(movements)).toBe(0);
  // Sin haber recuperado todo, sigue siendo aportado menos retirado.
  expect(getCapitalPendingToRecover({ '2025-01-10': { increment: 50000 }, '2025-06-01': { decrement: 15000 }, '2025-09-01': { increment: 10000 } })).toBe(45000);
});

test('receipts use the same step-by-step capital', () => {
  const list = Object.entries(movements).map(([iso, movement]) => ({
    iso,
    type: 'increment' in movement ? 'increment' : 'decrement',
    amount: 'increment' in movement ? movement.increment : movement.decrement
  }));
  const paid = { rate: 0.08, paidWithdrawalIsos: ['2025-12-15', '2026-05-10', '2026-08-20'] };
  const contribution = buildMovementReceipt('client-001', list, { iso: '2026-02-01', type: 'increment', amount: 50000 }, paid);
  expect(contribution.capitalPendingAfter).toBe(50000);
  const ownMoney = buildMovementReceipt('client-001', list, { iso: '2026-05-10', type: 'decrement', amount: 30000 }, paid);
  expect(ownMoney.commission?.amount).toBe(0);
  expect(ownMoney.net).toBe(30000);
  expect(ownMoney.capitalPendingAfter).toBe(20000);
});
