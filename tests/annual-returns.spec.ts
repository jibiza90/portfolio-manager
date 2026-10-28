import { expect, test } from '@playwright/test';
import { availableReportYears, buildAnnualReport, type AnnualMonthInput, type AnnualMovementInput } from '../src/utils/annualReturns';

// Casos resueltos a mano para el Informe anual de rendimientos.
const months: AnnualMonthInput[] = [
  { month: 'Ene 2025', profit: 20000, profitPct: 20, endBalance: 120000 },
  { month: 'Feb 2025', profit: 0, profitPct: 0, endBalance: 108000 },
  { month: 'Dic 2025', profit: 0, profitPct: 0, endBalance: 108000 },
  { month: 'Ene 2026', profit: 10800, profitPct: 10, endBalance: 118800 },
  { month: 'Feb 2026', profit: 0, profitPct: 0, endBalance: 106920 }
];
const movements: AnnualMovementInput[] = [
  { iso: '2025-01-01', type: 'increment', amount: 100000 },
  { iso: '2025-02-01', type: 'decrement', amount: 12000 },
  { iso: '2026-02-10', type: 'decrement', amount: 11880 }
];
const base = { months, movements, openingCapital: 0, commissions: null };

test('proportional method splits each withdrawal by the cost and value at that moment', () => {
  const y2025 = buildAnnualReport({ ...base, year: 2025, mode: 'withdrawn', method: 'proportional' });
  // 100.000 aportados, la cartera vale 120.000 y se retiran 12.000: 10.000 son capital y 2.000 beneficio.
  expect(y2025.withdrawals).toEqual([{ iso: '2025-02-01', amount: 12000, capital: 10000, gain: 2000 }]);
  expect(y2025.headline).toBe(2000);
  expect(y2025.startBalance).toBe(0);
  expect(y2025.endBalance).toBe(108000);
  expect(y2025.increments).toBe(100000);
  expect(y2025.decrements).toBe(12000);
  expect(y2025.provisional).toBe(false);

  // El coste se arrastra al año siguiente: quedan 90.000 de coste sobre 118.800 de valor.
  const y2026 = buildAnnualReport({ ...base, year: 2026, mode: 'withdrawn', method: 'proportional' });
  expect(y2026.withdrawals).toEqual([{ iso: '2026-02-10', amount: 11880, capital: 9000, gain: 2880 }]);
  expect(y2026.headline).toBe(2880);
  expect(y2026.startBalance).toBe(108000);
  expect(y2026.provisional).toBe(true);
});

test('capital-first method treats withdrawals as capital until all contributions are recovered', () => {
  const y2025 = buildAnnualReport({ ...base, year: 2025, mode: 'withdrawn', method: 'capital-first' });
  expect(y2025.withdrawals).toEqual([{ iso: '2025-02-01', amount: 12000, capital: 12000, gain: 0 }]);
  expect(y2025.headline).toBe(0);

  const recovered = buildAnnualReport({
    months: [{ month: 'Ene 2025', profit: 6000, profitPct: 60, endBalance: 16000 }, { month: 'Feb 2025', profit: 0, profitPct: 0, endBalance: 1000 }],
    movements: [{ iso: '2025-01-01', type: 'increment', amount: 10000 }, { iso: '2025-02-01', type: 'decrement', amount: 15000 }],
    openingCapital: 0, commissions: null, year: 2025, mode: 'withdrawn', method: 'capital-first'
  });
  expect(recovered.withdrawals).toEqual([{ iso: '2025-02-01', amount: 15000, capital: 10000, gain: 5000 }]);
});

test('all-profit mode adds every published monthly result of the year', () => {
  expect(buildAnnualReport({ ...base, year: 2025, mode: 'all', method: 'proportional' }).headline).toBe(20000);
  expect(buildAnnualReport({ ...base, year: 2026, mode: 'all', method: 'proportional' }).headline).toBe(10800);
});

test('uses the month-to-date return registered on a withdrawal', () => {
  const report = buildAnnualReport({
    ...base,
    movements: [movements[0], { iso: '2025-02-01', type: 'decrement', amount: 12000, returnPct: 0.2 }],
    year: 2025, mode: 'withdrawn', method: 'proportional'
  });
  // Valor ese dia: 120.000 x 1,20 = 144.000; capital = 12.000 x 100.000 / 144.000.
  expect(report.withdrawals[0].capital).toBe(8333.33);
  expect(report.withdrawals[0].gain).toBe(3666.67);
});

test('counts the opening capital of clients that started before the web', () => {
  const report = buildAnnualReport({
    months: [{ month: 'Ene 2025', profit: 2000, profitPct: 4, endBalance: 52000 }, { month: 'Feb 2025', profit: 0, profitPct: 0, endBalance: 49400 }],
    movements: [{ iso: '2025-02-01', type: 'decrement', amount: 2600 }],
    openingCapital: 50000, commissions: null, year: 2025, mode: 'withdrawn', method: 'proportional'
  });
  expect(report.withdrawals).toEqual([{ iso: '2025-02-01', amount: 2600, capital: 2500, gain: 100 }]);
});

test('lists only commissions marked as paid, with the same calculation as the commissions screen', () => {
  const input = {
    months: [{ month: 'Ene 2025', profit: 6000, profitPct: 60, endBalance: 16000 }, { month: 'Feb 2025', profit: 0, profitPct: 0, endBalance: 1000 }],
    movements: [{ iso: '2025-01-01', type: 'increment' as const, amount: 10000 }, { iso: '2025-02-01', type: 'decrement' as const, amount: 15000 }],
    openingCapital: 0, year: 2025, mode: 'withdrawn' as const, method: 'proportional' as const
  };
  const paid = buildAnnualReport({ ...input, commissions: { rate: 0.05, paidWithdrawalIsos: ['2025-02-01'] } });
  expect(paid.commissions).toEqual([{ iso: '2025-02-01', withdrawal: 15000, commission: 250 }]);
  expect(paid.commissionsTotal).toBe(250);
  const unpaid = buildAnnualReport({ ...input, commissions: { rate: 0.05, paidWithdrawalIsos: [] } });
  expect(unpaid.commissions).toEqual([]);
  expect(buildAnnualReport({ ...input, commissions: null }).commissionsAvailable).toBe(false);
});

test('lists the years with published closes, newest first', () => {
  expect(availableReportYears(months)).toEqual([2026, 2025]);
});
