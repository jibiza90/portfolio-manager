import { expect, test } from '@playwright/test';
import { buildPendingCashMovements } from '../src/utils/pendingCashMovements';

test('returns only cash movements not included in the published report', () => {
  expect(buildPendingCashMovements(
    {
      '2026-08-01': { increment: 50_000 },
      '2026-09-10': { increment: 30_000, incrementReturnPct: 0.0314 }
    },
    [{ iso: '2026-08-01', type: 'increment', amount: 50_000 }]
  )).toEqual([
    { iso: '2026-09-10', type: 'increment', amount: 30_000 }
  ]);
});

test('does not expose return percentages and removes movements once published', () => {
  const current = {
    '2026-09-10': { increment: 30_000, incrementReturnPct: 0.0314 }
  };

  expect(buildPendingCashMovements(current, [])).toEqual([
    { iso: '2026-09-10', type: 'increment', amount: 30_000 }
  ]);
  expect(buildPendingCashMovements(current, [
    { iso: '2026-09-10', type: 'increment', amount: 30_000 }
  ])).toEqual([]);
});
