import { expect, test } from '@playwright/test';
import { buildFundKpis } from '../src/utils/fundKpis';
import { buildFundDetails, getClientSummary, getFundAt } from '../src/utils/fundKpisDetails';
import { buildSnapshot } from '../src/utils/snapshot';
import type { MonthlyHistoryEntry, Movement } from '../src/types';

// Clientes inventados (nunca datos reales). Meses: +10 %, -10 %, -5 %, +5 %, +20 %.
const RETURNS: Record<string, number> = { '2026-01': 0.1, '2026-02': -0.1, '2026-03': -0.05, '2026-04': 0.05, '2026-05': 0.2 };
const historyFrom = (from: string) => Object.fromEntries(Object.entries(RETURNS).filter(([month]) => month >= from).map(([month, returnPct]) => [month, { returnPct }]));
const movements: Record<string, Record<string, Movement>> = {
  'client-040': { '2026-01-05': { increment: 10_000 } },
  'client-041': { '2026-02-10': { increment: 60_000 } },
  'client-042': { '2026-01-05': { increment: 10_000 }, '2026-04-10': { decrement: 4_000 }, '2026-05-20': { decrement: 7_000 } }
};
const history: Record<string, Record<string, MonthlyHistoryEntry>> = {
  'client-040': historyFrom('2026-01'),
  'client-041': historyFrom('2026-02'),
  'client-042': historyFrom('2026-01')
};
const recurring = {
  rules: [{ id: 'f', clientId: 'client-041', amount: 70_000, day: 20, active: true, startMonth: '2026-06', createdAt: 0, updatedAt: 0 }],
  checks: {}
};
const snapshot = buildSnapshot({}, movements, history);
const paidWithdrawals = { 'client-042-2026-05-20': true };
const kpis = buildFundKpis({
  clientIds: Object.keys(movements), snapshot, movementsByClient: movements, monthlyHistoryByClient: history,
  commissionRates: {}, paidWithdrawals, recurring, todayIso: '2026-06-15'
});
const details = buildFundDetails({ kpis, movementsByClient: movements, commissionRates: {}, paidWithdrawals, recurring });

test('returns by period, drawdown, recovery and streak', () => {
  const all = 1.1 * 0.9 * 0.95 * 1.05 * 1.2 - 1;
  expect(details.periods.m1).toBeCloseTo(0.2, 10);
  expect(details.periods.m3).toBeCloseTo(0.95 * 1.05 * 1.2 - 1, 10);
  expect(details.periods.sinceStart).toBeCloseTo(all, 10);
  expect(details.periods.y1).toBeUndefined();
  expect(details.growthOf10k?.value).toBeCloseTo(10_000 * (1 + all), 6);
  expect(details.annualReturns).toEqual([{ year: '2026', returnPct: expect.any(Number), months: 5, complete: false }]);
  expect(details.maxDrawdown.depth).toBeCloseTo((1.1 * 0.9 * 0.95) / 1.1 - 1, 10);
  expect(details.maxDrawdown).toMatchObject({ peakMonth: '2026-01', troughMonth: '2026-03', recoveredMonth: '2026-05', recoveryMonths: 2 });
  expect(details.streak).toEqual({ current: 2, best: 2 });
  expect(details.volatility).toBeGreaterThan(0);
  expect(details.netOfCommission[0].sinceStart).toBeCloseTo(all * 0.95, 10);
});

test('clients, flows, commissions, records and cohorts', () => {
  expect(details.tiers.find((tier) => tier.label === '50.000 € a 100.000 €')?.count).toBe(1);
  expect(details.recurringActive).toEqual({ count: 1, monthlyTotal: 70_000 });
  expect(details.flowsByYear[0]).toMatchObject({ year: '2026', newClientsMoney: 80_000, existingClientsMoney: 0, contributions: 3, withdrawals: 2 });
  // Segunda retirada de client-042: 1.000 € por encima del capital pendiente -> 8 % = 80 €, marcada como cobrada.
  expect(details.commissionsByMonth).toEqual([{ month: '2026-05', generated: 80, paid: 80 }]);
  expect(details.commissionsByYear).toEqual([{ year: '2026', generated: 80, paid: 80 }]);
  expect(details.profitWithdrawn).toBeCloseTo(1_000, 6);
  // Prevision: la fija del 20/06 (sabado -> lunes 22) supera el capital de 60.000 € en 10.000 € -> 800 €.
  expect(details.commissionForecast30).toBeCloseTo(800, 6);
  expect(details.records.biggestContribution).toEqual({ clientId: 'client-041', iso: '2026-02-10', amount: 60_000 });
  expect(details.records.biggestWithdrawal).toEqual({ clientId: 'client-042', iso: '2026-05-20', amount: 7_000 });
  expect(details.cohorts).toEqual([expect.objectContaining({ year: '2026', clients: 3, contributed: 80_000 })]);
});

test('fund snapshot at a month end and quick client summary', () => {
  const january = getFundAt(snapshot, Object.keys(movements), '2026-01');
  expect(january.activeClients).toBe(2);
  expect(january.contributed).toBe(20_000);
  const summary = getClientSummary({
    clientId: 'client-041', kpis, snapshot, movementsByClient: movements, monthlyHistoryByClient: history,
    commissionRates: {}, paidWithdrawals, recurring
  })!;
  expect(summary.contributions).toBe(1);
  expect(summary.rate).toBe(0.08);
  expect(summary.fixedWithdrawals).toHaveLength(1);
  expect(summary.share).toBeCloseTo(summary.balance / kpis.aum, 10);
  expect(summary.twr).toBeCloseTo(0.9 * 0.95 * 1.05 * 1.2 - 1, 6);
});
