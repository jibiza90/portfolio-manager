import { expect, test } from '@playwright/test';
import { getInitialClientPosition, hasClosedClientPeriod } from '../src/utils/initialClientPosition';

test('calculates a new client provisional position from all pre-close flows', () => {
  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000 }
  })).toEqual({
    iso: '2026-08-10',
    amount: 50_000,
    totalIncrements: 50_000,
    totalDecrements: 0,
    movements: [{ iso: '2026-08-10', increment: 50_000, balance: 50_000 }]
  });

  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000, incrementReturnPct: 0.02 }
  })?.amount).toBe(50_000);

  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000 },
    '2026-08-12': { increment: 10_000 },
    '2026-08-20': { decrement: 5_000 }
  })).toEqual({
    iso: '2026-08-10',
    amount: 55_000,
    totalIncrements: 60_000,
    totalDecrements: 5_000,
    movements: [
      { iso: '2026-08-10', increment: 50_000, balance: 50_000 },
      { iso: '2026-08-12', increment: 10_000, balance: 60_000 },
      { iso: '2026-08-20', decrement: 5_000, balance: 55_000 }
    ]
  });

  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000 }
  }, {
    '2026-08': { returnPct: 0.02 }
  })).toBeNull();
});

test('recognises a balance or return as an existing monthly close', () => {
  expect(hasClosedClientPeriod({ '2026-08': { finalBalance: 50_000 } })).toBe(true);
  expect(hasClosedClientPeriod({ '2026-08': { returnPct: 0 } })).toBe(true);
  expect(hasClosedClientPeriod({})).toBe(false);
});
