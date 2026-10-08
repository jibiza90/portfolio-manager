import { expect, test } from '@playwright/test';
import type { ClientDayRow, PortfolioSnapshot } from '../src/types';
import { buildClientReportData } from '../src/utils/clientReport';

const snapshotWithRows = (rows: ClientDayRow[]): PortfolioSnapshot => ({
  dailyRows: [],
  dayIndex: {},
  clientRowsById: { 'client-002': rows },
  totals: {}
});

test('calculates total return over net contributed capital', () => {
  const report = buildClientReportData(
    'client-002',
    'all',
    {},
    snapshotWithRows([
      {
        iso: '2026-01-01', label: '', weekday: '', isWeekend: false,
        increment: 100_000, baseBalance: 100_000, finalBalance: 100_000
      },
      {
        iso: '2026-06-30', label: '', weekday: '', isWeekend: false,
        decrement: 20_000, baseBalance: 80_000, finalBalance: 90_000
      }
    ]),
    {}
  );

  expect(report?.beneficioTotal).toBe(10_000);
  expect(report?.rentabilidad).toBeCloseTo(12.5, 8);
  expect(report?.rentabilidadDisponible).toBe(true);
});

test('subtracts the opening balance in a year-filtered report', () => {
  const report = buildClientReportData(
    'client-002',
    2026,
    {},
    snapshotWithRows([
      {
        iso: '2025-12-31', label: '', weekday: '', isWeekend: false,
        baseBalance: 100_000, finalBalance: 100_000
      },
      {
        iso: '2026-12-31', label: '', weekday: '', isWeekend: false,
        baseBalance: 100_000, finalBalance: 105_000
      }
    ]),
    {}
  );

  expect(report?.beneficioTotal).toBe(5_000);
  expect(report?.rentabilidad).toBeCloseTo(5, 8);
  expect(report?.rentabilidadDisponible).toBe(true);
});
