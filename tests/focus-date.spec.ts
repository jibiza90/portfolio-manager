import { expect, test } from '@playwright/test';
import { getLatestPortfolioFocusDate } from '../src/utils/focusDate';

test('uses a calculated month-end row as the latest focus date', () => {
  expect(getLatestPortfolioFocusDate({
    finalByDay: {},
    movementsByClient: {
      'client-004': {
        '2026-08-16': { increment: 15_000 }
      }
    },
    monthlyHistoryByClient: {},
    dailyRows: [
      {
        iso: '2026-08-31',
        label: '31 ago',
        weekday: 'lun.',
        isWeekend: false,
        final: 150_000,
        profit: 7_000
      }
    ]
  })).toBe('2026-08-31');
});

test('ignores empty future records when resolving the focus date', () => {
  expect(getLatestPortfolioFocusDate({
    finalByDay: { '2026-08-31': 150_000 },
    movementsByClient: {
      'client-004': {
        '2026-09-15': {}
      }
    },
    monthlyHistoryByClient: {
      'client-004': {
        '2026-10': {}
      }
    }
  })).toBe('2026-08-31');
});
