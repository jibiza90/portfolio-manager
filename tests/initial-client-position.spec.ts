import { expect, test } from '@playwright/test';
import { getInitialClientPosition, hasClosedClientPeriod } from '../src/utils/initialClientPosition';

test('detects only a new client first contribution', () => {
  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000 }
  })).toEqual({ iso: '2026-08-10', amount: 50_000 });

  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000, incrementReturnPct: 0.02 }
  })).toEqual({ iso: '2026-08-10', amount: 50_000 });

  expect(getInitialClientPosition({
    '2026-08-10': { increment: 50_000 },
    '2026-08-12': { increment: 10_000 }
  })).toBeNull();

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
