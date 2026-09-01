import dayjs from 'dayjs';
import type { ClientDayRow, DailyRow, MonthlyHistoryEntry, Movement } from '../types';

interface FocusDateSources {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  dailyRows?: DailyRow[];
  clientRowsById?: Record<string, ClientDayRow[]>;
  todayIso?: string;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const getLatestPortfolioFocusDate = ({
  finalByDay,
  movementsByClient,
  monthlyHistoryByClient,
  dailyRows = [],
  clientRowsById = {},
  todayIso = dayjs().format('YYYY-MM-DD')
}: FocusDateSources): string | null => {
  const dates = new Set<string>();
  const addPastOrPresentDate = (iso: string) => {
    if (iso <= todayIso) dates.add(iso);
  };

  Object.entries(finalByDay).forEach(([iso, value]) => {
    if (isFiniteNumber(value)) addPastOrPresentDate(iso);
  });

  Object.values(movementsByClient).forEach((rows) => {
    Object.entries(rows).forEach(([iso, movement]) => {
      if (Object.values(movement).some(isFiniteNumber)) addPastOrPresentDate(iso);
    });
  });

  Object.values(monthlyHistoryByClient).forEach((months) => {
    Object.entries(months).forEach(([month, entry]) => {
      if (isFiniteNumber(entry.finalBalance) || isFiniteNumber(entry.returnPct)) {
        addPastOrPresentDate(dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'));
      }
    });
  });

  dailyRows.forEach((row) => {
    const changesBalance =
      isFiniteNumber(row.final) &&
      isFiniteNumber(row.initial) &&
      Math.abs(row.final - row.initial) > 0.000001;
    const hasCalculatedResult =
      (isFiniteNumber(row.profit) && Math.abs(row.profit) > 0.000001) ||
      (isFiniteNumber(row.profitPct) && Math.abs(row.profitPct) > 0.000001);
    const hasFlow = [row.increments, row.decrements, row.manualProfits]
      .some((value) => isFiniteNumber(value) && Math.abs(value) > 0.000001);
    if (changesBalance || hasCalculatedResult || hasFlow) addPastOrPresentDate(row.iso);
  });

  Object.values(clientRowsById).forEach((rows) => {
    rows.forEach((row) => {
      const changesBalance =
        isFiniteNumber(row.finalBalance) &&
        isFiniteNumber(row.baseBalance) &&
        Math.abs(row.finalBalance - row.baseBalance) > 0.000001;
      const hasCalculatedResult =
        (isFiniteNumber(row.profit) && Math.abs(row.profit) > 0.000001) ||
        (isFiniteNumber(row.profitPct) && Math.abs(row.profitPct) > 0.000001);
      const hasFlow = [row.increment, row.decrement, row.manualProfit, row.manualProfitPct]
        .some((value) => isFiniteNumber(value) && Math.abs(value) > 0.000001);
      if (changesBalance || hasCalculatedResult || hasFlow) addPastOrPresentDate(row.iso);
    });
  });

  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  return sortedDates[sortedDates.length - 1] ?? null;
};
