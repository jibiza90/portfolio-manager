import { expect, test } from '@playwright/test';
import {
  buildMonthlyStatsForMonths,
  getStandaloneContributionReturnForMonth
} from '../src/utils/monthlyHistory';
import { buildSnapshot } from '../src/utils/snapshot';

test('uses the contribution return for a new client first month', () => {
  const result = getStandaloneContributionReturnForMonth(
    {
      '2026-09-18': { increment: 30_000, incrementReturnPct: 0.0193 }
    },
    {
      '2026-09': { returnPct: 0.0584 }
    },
    '2026-09'
  );

  expect(result).toBeCloseTo(0.0193, 10);
});

test('weights multiple first-month contributions by invested capital', () => {
  const result = getStandaloneContributionReturnForMonth(
    {
      '2026-09-05': { increment: 20_000, incrementReturnPct: 0.03 },
      '2026-09-20': { increment: 10_000, incrementReturnPct: 0.01 }
    },
    {},
    '2026-09'
  );

  expect(result).toBeCloseTo(700 / 30_000, 10);
});

test('keeps the monthly return for an existing client with a later contribution', () => {
  const result = getStandaloneContributionReturnForMonth(
    {
      '2026-08-01': { increment: 50_000 },
      '2026-09-18': { increment: 15_000, incrementReturnPct: 0.0193 }
    },
    {
      '2026-08': { returnPct: 0.04 },
      '2026-09': { returnPct: 0.0584 }
    },
    '2026-09'
  );

  expect(result).toBeUndefined();
});

test('keeps the monthly return when the first contribution has no custom return', () => {
  const result = getStandaloneContributionReturnForMonth(
    {
      '2026-09-01': { increment: 38_000 }
    },
    {
      '2026-09': { returnPct: 0.0584 }
    },
    '2026-09'
  );

  expect(result).toBeUndefined();
});

test('calculates a new client first month from its contribution return end to end', () => {
  const movements = {
    'client-019': {
      '2026-09-18': { increment: 30_000, incrementReturnPct: 0.0193 }
    }
  };
  const history = {
    'client-019': {
      '2026-09': { returnPct: 0.0584 }
    }
  };
  const snapshot = buildSnapshot({}, movements, history);
  const rows = snapshot.clientRowsById['client-019'];
  const monthEnd = rows.find((row) => row.iso === '2026-09-30');
  const stats = buildMonthlyStatsForMonths(rows, history['client-019'], ['2026-09'], {
    forceHistoryReturn: true
  }).monthlyStats[0];

  expect(monthEnd?.profit).toBeCloseTo(579, 8);
  expect(monthEnd?.profitPct).toBeCloseTo(0.0193, 10);
  expect(monthEnd?.finalBalance).toBeCloseTo(30_579, 8);
  expect(stats.profit).toBeCloseTo(579, 8);
  expect(stats.profitPct).toBeCloseTo(1.93, 8);
  expect(stats.endBalance).toBeCloseTo(30_579, 8);
});

test('keeps the general return for existing capital and the custom return for a later contribution', () => {
  const movements = {
    'client-019': {
      '2026-08-01': { increment: 50_000 },
      '2026-09-18': { increment: 15_000, incrementReturnPct: 0.02 }
    }
  };
  const history = {
    'client-019': {
      '2026-08': { returnPct: 0 },
      '2026-09': { returnPct: 0.05 }
    }
  };
  const snapshot = buildSnapshot({}, movements, history);
  const rows = snapshot.clientRowsById['client-019'];
  const monthEnd = rows.find((row) => row.iso === '2026-09-30');
  const stats = buildMonthlyStatsForMonths(rows, history['client-019'], ['2026-08', '2026-09'], {
    forceHistoryReturn: true
  }).monthlyStats.find((point) => point.monthKey === '2026-09');

  expect(monthEnd?.profit).toBeCloseTo(2_800, 8);
  expect(monthEnd?.profitPct).toBeCloseTo(0.05, 10);
  expect(monthEnd?.finalBalance).toBeCloseTo(67_800, 8);
  expect(stats?.profit).toBeCloseTo(2_800, 8);
  expect(stats?.profitPct).toBeCloseTo(5, 8);
  expect(stats?.endBalance).toBeCloseTo(67_800, 8);
});
