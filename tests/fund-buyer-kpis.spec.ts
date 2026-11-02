import { expect, test } from '@playwright/test';
import { buildBuyerKpis } from '../src/utils/fundBuyerKpis';
import { buildFundKpis } from '../src/utils/fundKpis';
import { buildFundDetails } from '../src/utils/fundKpisDetails';
import { buildSnapshot } from '../src/utils/snapshot';
import type { MonthlyHistoryEntry, Movement } from '../src/types';

// Clientes inventados (nunca datos reales).
const months = (from: string, to: string) => {
  const out: Record<string, MonthlyHistoryEntry> = {};
  for (let date = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1); ; date.setMonth(date.getMonth() + 1)) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (key > to) break;
    out[key] = { returnPct: 0.1 };
  }
  return out;
};
const movements: Record<string, Record<string, Movement>> = {
  'client-060': { '2025-11-05': { increment: 10_000 }, '2026-02-01': { increment: 5_000 }, '2026-03-10': { decrement: 18_000 } },
  'client-061': { '2026-01-10': { increment: 30_000 } },
  'client-062': { '2025-11-20': { increment: 5_000 }, '2026-02-15': { decrement: 10_000 } }
};
const history: Record<string, Record<string, MonthlyHistoryEntry>> = {
  'client-060': months('2025-11', '2026-03'),
  'client-061': months('2026-01', '2026-03'),
  'client-062': months('2025-11', '2026-02')
};
const contacts = {
  'client-060': { origin: 'Relación personal', waitlistAmount: '25.000', waitlistNote: 'En enero' },
  'client-061': { origin: 'Recomendación de un cliente' }
};
const commissionRates = { 'client-061': 0.05 };
const recurring = { rules: [], checks: {} };
const snapshot = buildSnapshot({}, movements, history);
const kpis = buildFundKpis({
  clientIds: Object.keys(movements), snapshot, movementsByClient: movements, monthlyHistoryByClient: history,
  commissionRates, paidWithdrawals: {}, recurring, todayIso: '2026-04-15'
});
const details = buildFundDetails({ kpis, movementsByClient: movements, commissionRates, paidWithdrawals: {}, recurring });
const buyer = buildBuyerKpis({ kpis, details, snapshot, movementsByClient: movements, monthlyHistoryByClient: history, commissionRates, contacts, recurring });

test('buyer view: revenue, growth and repeat contributions', () => {
  // client-060: 18.000 retirados con 15.000 aportados -> 3.000 al 8 % = 240 €. client-062: 10.000 con 5.000 aportados -> 400 €.
  expect(buyer.revenue.last12).toBeCloseTo(640, 6);
  expect(buyer.revenue.byYear).toEqual([expect.objectContaining({ year: '2026', generated: 640 })]);
  expect(buyer.averageFirstContribution).toBe(15_000);
  expect(buyer.recontribution).toEqual({ share: 1 / 3, clients: 1, averageDaysToSecond: 88 });
  expect(buyer.growthByYear[0]).toMatchObject({ year: '2026', fromInflows: 35_000 - 28_000 });
  expect(buyer.newClientsByMonth).toHaveLength(12);
  expect(buyer.newClientsByMonth.find((item) => item.month === '2026-01')?.count).toBe(1);
});

test('buyer view: retention, special conditions, risk, waiting list and origin', () => {
  expect(buyer.retentionByYear.find((row) => row.year === '2026')).toMatchObject({ clientsAtStart: 2, lost: 1, churn: 0.5 });
  expect(buyer.specialConditions).toEqual([{ clientId: 'client-061', conditions: ['Comisión del 5 %'] }]);
  // Todos los meses iguales: sin variacion no hay ratio.
  expect(buyer.sharpe).toBeUndefined();
  expect(buyer.sortino).toBeUndefined();
  expect(buyer.waitlistTotal).toBe(25_000);
  expect(buyer.waitlist).toEqual([{ clientId: 'client-060', amount: 25_000, note: 'En enero' }]);
  expect(buyer.origins.map((item) => `${item.origin} ${item.count}`)).toEqual(['Relación personal 1', 'Recomendación de un cliente 1']);
});
