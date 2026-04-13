import type { ClientDayRow, MonthlyHistoryEntry } from '../types';
import { calculateAllMonthsTWR } from './twr';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTHLY_HISTORY_TOLERANCE = 0.5;

export interface MonthlyStatPoint {
  monthKey: string;
  month: string;
  monthLabel: string;
  monthNum: number;
  profit: number;
  profitPct: number;
  simpleProfitPct: number;
  endBalance: number;
  hasData: boolean;
}

export interface PatrimonyPoint {
  month: string;
  monthLabel: string;
  balance?: number;
  hasData: boolean;
}

interface MonthlyStatsResult {
  monthlyStats: MonthlyStatPoint[];
  patrimonioEvolution: PatrimonyPoint[];
  lastMonth: MonthlyStatPoint | null;
}

interface MonthlyStatsOptions {
  forceHistoryReturn?: boolean;
}

export function normalizeMonthlyReturnPct(value?: number) {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.abs(value) > 1 ? value / 100 : value;
}

export function hasMonthlyHistoryValue(entry?: MonthlyHistoryEntry) {
  return !!entry && (entry.finalBalance !== undefined || entry.returnPct !== undefined);
}

export function canHonorMonthlyHistoryReturn(baseStart: number | undefined, entry?: MonthlyHistoryEntry) {
  const normalizedReturn = normalizeMonthlyReturnPct(entry?.returnPct);
  if (entry?.finalBalance === undefined || normalizedReturn === undefined || normalizedReturn <= -1) {
    return false;
  }

  const derivedBase = entry.finalBalance / (1 + normalizedReturn);
  if (baseStart === undefined || Math.abs(baseStart) <= MONTHLY_HISTORY_TOLERANCE) {
    return true;
  }

  return Math.abs(derivedBase - baseStart) <= MONTHLY_HISTORY_TOLERANCE;
}

export function buildMonthlyStatsForMonths(
  rows: ClientDayRow[],
  monthlyHistory: Record<string, MonthlyHistoryEntry>,
  monthKeys: string[],
  options: MonthlyStatsOptions = {}
): MonthlyStatsResult {
  const forceHistoryReturn = options.forceHistoryReturn === true;
  const trackedMonths = [...monthKeys].sort((a, b) => (a > b ? 1 : -1));
  const trackedMonthSet = new Set(trackedMonths);
  const scopedRows = rows.filter((row) => trackedMonthSet.has(row.iso.slice(0, 7)));
  const byMonth = new Map<string, { profit: number; baseStart?: number; finalEnd?: number }>();
  const twrByMonth = new Map(calculateAllMonthsTWR(scopedRows).map((item) => [item.month, item.twr]));
  let lastKnownFinal: number | undefined;

  scopedRows.forEach((row) => {
    const monthKey = row.iso.slice(0, 7);
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, { profit: 0, baseStart: undefined, finalEnd: undefined });
    }

    const entry = byMonth.get(monthKey)!;
    if (row.profit !== undefined) entry.profit += row.profit;
    if (entry.baseStart === undefined && row.baseBalance !== undefined && row.baseBalance > 0) {
      entry.baseStart = row.baseBalance;
    }
    if (row.finalBalance !== undefined && row.finalBalance > 0) {
      entry.finalEnd = row.finalBalance;
      lastKnownFinal = row.finalBalance;
    }
  });

  const monthlyStats: MonthlyStatPoint[] = [];

  trackedMonths.forEach((monthKey) => {
    const year = Number.parseInt(monthKey.slice(0, 4), 10);
    const month = Number.parseInt(monthKey.slice(5, 7), 10);
    const derivedEntry = byMonth.get(monthKey);
    const historyEntry = monthlyHistory[monthKey];
    const normalizedHistoryReturn = normalizeMonthlyReturnPct(historyEntry?.returnPct);
    const monthlyTwr = twrByMonth.get(monthKey);

    let profit = derivedEntry?.profit ?? 0;
    let baseStart = derivedEntry?.baseStart;
    let finalEnd = derivedEntry?.finalEnd;

    if ((baseStart === undefined || baseStart === 0) && monthlyStats.length > 0) {
      const prevWithBalance = [...monthlyStats].reverse().find((item) => item.endBalance > 0);
      baseStart = prevWithBalance?.endBalance;
    }

    if ((baseStart === undefined || baseStart === 0) && finalEnd !== undefined && finalEnd > 0) {
      baseStart = Math.max(1, finalEnd - profit);
    }

    if (historyEntry?.finalBalance !== undefined) {
      finalEnd = historyEntry.finalBalance;
    }

    const canUseHistoryReturn = canHonorMonthlyHistoryReturn(baseStart, historyEntry);
    if (forceHistoryReturn && normalizedHistoryReturn !== undefined) {
      if (historyEntry?.finalBalance !== undefined && normalizedHistoryReturn > -1) {
        finalEnd = historyEntry.finalBalance;
        baseStart = historyEntry.finalBalance / (1 + normalizedHistoryReturn);
        profit = historyEntry.finalBalance - baseStart;
      } else {
        if ((baseStart === undefined || baseStart === 0) && finalEnd !== undefined && finalEnd > 0 && normalizedHistoryReturn > -1) {
          baseStart = finalEnd / (1 + normalizedHistoryReturn);
        }
        if (baseStart !== undefined && baseStart > 0) {
          profit = baseStart * normalizedHistoryReturn;
          if (finalEnd === undefined || finalEnd === 0) {
            finalEnd = baseStart + profit;
          }
        }
      }
    } else if (canUseHistoryReturn && historyEntry?.finalBalance !== undefined && normalizedHistoryReturn !== undefined) {
      baseStart = historyEntry.finalBalance / (1 + normalizedHistoryReturn);
      profit = historyEntry.finalBalance - baseStart;
    }

    const safeBase = baseStart ?? 0;
    const simpleProfitPct = safeBase > 0 ? profit / safeBase : 0;
    const profitPct =
      (forceHistoryReturn && normalizedHistoryReturn !== undefined) ||
      (canUseHistoryReturn && normalizedHistoryReturn !== undefined)
        ? normalizedHistoryReturn
        : monthlyTwr ?? simpleProfitPct;
    const hasData = !!derivedEntry || hasMonthlyHistoryValue(historyEntry);

    if (finalEnd !== undefined && finalEnd > 0) {
      lastKnownFinal = finalEnd;
    }

    monthlyStats.push({
      monthKey,
      month: MONTH_NAMES[month - 1],
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      monthNum: month,
      profit,
      profitPct: profitPct * 100,
      simpleProfitPct: simpleProfitPct * 100,
      endBalance: finalEnd ?? 0,
      hasData
    });
  });

  let running = lastKnownFinal;
  const patrimonioEvolution = monthlyStats.map((item) => {
    if (item.endBalance > 0) {
      running = item.endBalance;
      return { month: item.month, monthLabel: item.monthLabel, balance: item.endBalance, hasData: true };
    }

    return { month: item.month, monthLabel: item.monthLabel, balance: undefined, hasData: false };
  });

  const monthlyWithData = monthlyStats.filter((item) => item.hasData && (item.profit !== 0 || item.profitPct !== 0 || item.endBalance !== 0));

  return {
    monthlyStats,
    patrimonioEvolution,
    lastMonth: monthlyWithData.length > 0 ? monthlyWithData[monthlyWithData.length - 1] : null
  };
}

export function buildMonthlyStatsForYear(
  rows: ClientDayRow[],
  monthlyHistory: Record<string, MonthlyHistoryEntry>,
  year: number,
  options: MonthlyStatsOptions = {}
): MonthlyStatsResult {
  const monthKeys = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  return buildMonthlyStatsForMonths(rows, monthlyHistory, monthKeys, options);
}
