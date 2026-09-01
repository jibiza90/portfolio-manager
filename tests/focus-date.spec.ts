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
    ],
    todayIso: '2026-09-01'
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
    },
    todayIso: '2026-09-01'
  })).toBe('2026-08-31');
});

test('does not jump to future carry rows or placeholder monthly closes', () => {
  expect(getLatestPortfolioFocusDate({
    finalByDay: {},
    movementsByClient: {
      'client-004': {
        '2026-08-16': { increment: 15_000 }
      }
    },
    monthlyHistoryByClient: {
      'client-004': {
        '2026-08': { returnPct: 0.0532 },
        '2027-12': { returnPct: 0 }
      }
    },
    dailyRows: [
      {
        iso: '2026-08-31',
        label: '31 ago',
        weekday: 'lun.',
        isWeekend: false,
        initial: 150_000,
        final: 157_980,
        profit: 7_980,
        profitPct: 0.0532
      },
      {
        iso: '2026-09-01',
        label: '01 sep',
        weekday: 'mar.',
        isWeekend: false,
        initial: 157_980,
        final: 157_980,
        profit: 0,
        profitPct: 0
      },
      {
        iso: '2027-12-31',
        label: '31 dic',
        weekday: 'vie.',
        isWeekend: false,
        initial: 157_980,
        final: 157_980,
        profit: 0,
        profitPct: 0
      }
    ],
    todayIso: '2026-09-01'
  })).toBe('2026-08-31');
});
