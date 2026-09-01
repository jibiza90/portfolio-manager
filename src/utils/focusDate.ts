import dayjs from 'dayjs';
import type { ClientDayRow, DailyRow, MonthlyHistoryEntry, Movement } from '../types';

interface FocusDateSources {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  dailyRows?: DailyRow[];
  clientRowsById?: Record<string, ClientDayRow[]>;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const getLatestPortfolioFocusDate = ({
  finalByDay,
  movementsByClient,
  monthlyHistoryByClient,
  dailyRows = [],
  clientRowsById = {}
}: FocusDateSources): string | null => {
  const dates = new Set<string>();

  Object.entries(finalByDay).forEach(([iso, value]) => {
    if (isFiniteNumber(value)) dates.add(iso);
  });

  Object.values(movementsByClient).forEach((rows) => {
    Object.entries(rows).forEach(([iso, movement]) => {
      if (Object.values(movement).some(isFiniteNumber)) dates.add(iso);
    });
  });

  Object.values(monthlyHistoryByClient).forEach((months) => {
    Object.entries(months).forEach(([month, entry]) => {
      if (isFiniteNumber(entry.finalBalance) || isFiniteNumber(entry.returnPct)) {
        dates.add(dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'));
      }
    });
  });

  dailyRows.forEach((row) => {
    if (isFiniteNumber(row.final)) dates.add(row.iso);
  });

  Object.values(clientRowsById).forEach((rows) => {
    rows.forEach((row) => {
      if (isFiniteNumber(row.finalBalance)) dates.add(row.iso);
    });
  });

  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  return sortedDates[sortedDates.length - 1] ?? null;
};
