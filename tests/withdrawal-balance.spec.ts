import { expect, test } from '@playwright/test';
import type { ClientDayRow } from '../src/types';
import { getAvailableBalanceBeforeWithdrawal } from '../src/utils/withdrawalBalance';

const row = (iso: string, values: Partial<ClientDayRow> = {}): ClientDayRow => ({
  iso,
  label: iso,
  weekday: '',
  isWeekend: false,
  ...values
});

test('withdrawals use the latest confirmed or provisional balance', () => {
  expect(getAvailableBalanceBeforeWithdrawal([
    row('2026-07-31', { finalBalance: 100_000 }),
    row('2026-08-10')
  ], '2026-08-10')).toBe(100_000);

  expect(getAvailableBalanceBeforeWithdrawal([
    row('2026-07-31', { finalBalance: 100_000 }),
    row('2026-08-10', { increment: 15_000 })
  ], '2026-08-10')).toBe(115_000);

  expect(getAvailableBalanceBeforeWithdrawal([
    row('2026-07-31', { finalBalance: 100_000 }),
    row('2026-08-10', { baseBalance: 95_000, decrement: 5_000 })
  ], '2026-08-10')).toBe(100_000);
});
