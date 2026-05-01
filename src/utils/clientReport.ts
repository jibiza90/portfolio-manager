import { CLIENTS } from '../constants/clients';
import { PortfolioSnapshot, MonthlyHistoryEntry } from '../types';
import { calculateAllMonthsTWR } from './twr';
import { buildMonthlyStatsForMonths, buildMonthlyStatsForYear, normalizeMonthlyReturnPct } from './monthlyHistory';
import { getYearFromIso, YEAR } from './dates';

export type ClientContactInfo = {
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
};

export interface ClientReportData {
  id: string;
  code: string;
  name: string;
  contact?: ClientContactInfo;
  incrementos: number;
  decrementos: number;
  saldo: number;
  beneficioTotal: number;
  rentabilidad: number;
  monthlyStats: ReturnType<typeof buildMonthlyStatsForMonths>['monthlyStats'];
  movements: Array<{ iso: string; type: 'increment' | 'decrement'; amount: number; balance: number }>;
  contributionBreakdowns: Array<{
    month: string;
    monthLabel: string;
    initialCapital: number;
    initialReturnPct: number;
    initialProfit: number;
    contributions: Array<{ iso: string; amount: number; returnPct: number; profit: number }>;
    totalProfit: number;
  }>;
  patrimonioEvolution: ReturnType<typeof buildMonthlyStatsForMonths>['patrimonioEvolution'];
  beneficioUltimoMes: number;
  rentabilidadUltimoMes: number;
  twrYtd: number;
  twrMonthly: Array<{ month: string; twr: number; periods: Array<unknown> }>;
}

export interface ClientReportPayload {
  clientId: string;
  clientName: string;
  clientCode: string;
  incrementos: number;
  decrementos: number;
  saldo: number;
  beneficioTotal: number;
  rentabilidad: number;
  beneficioUltimoMes: number;
  rentabilidadUltimoMes: number;
  twrYtd: number;
  monthlyStats: Array<{
    month: string;
    profit: number;
    profitPct: number;
    endBalance: number;
    hasData: boolean;
  }>;
  patrimonioEvolution: Array<{
    month: string;
    balance: number;
    hasData: boolean;
  }>;
  movements: Array<{
    iso: string;
    type: 'increment' | 'decrement';
    amount: number;
    balance: number;
  }>;
  contributionBreakdowns: Array<{
    month: string;
    initialCapital: number;
    initialReturnPct: number;
    initialProfit: number;
    contributions: Array<{
      iso: string;
      amount: number;
      returnPct: number;
      profit: number;
    }>;
    totalProfit: number;
  }>;
}

const buildAvailableYears = (rows: PortfolioSnapshot['clientRowsById'][string], monthlyHistory: Record<string, MonthlyHistoryEntry>) => {
  const years = new Set<number>();
  rows.forEach((row) => years.add(getYearFromIso(row.iso)));
  Object.keys(monthlyHistory).forEach((monthKey) => years.add(Number.parseInt(monthKey.slice(0, 4), 10)));
  const sorted = Array.from(years).filter((year) => Number.isFinite(year)).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : [YEAR];
};

export function buildClientReportData(
  clientId: string,
  selectedYear: number | 'all',
  contacts: Record<string, ClientContactInfo>,
  snapshot: PortfolioSnapshot,
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>,
  fallbackName?: string
): ClientReportData | null {
  const client = CLIENTS.find((entry) => entry.id === clientId);
  const rows = snapshot.clientRowsById[clientId] || [];
  const monthlyHistory = monthlyHistoryByClient[clientId] ?? {};
  const availableYears = buildAvailableYears(rows, monthlyHistory);
  const periodRows = selectedYear === 'all'
    ? rows
    : rows.filter((row) => row.iso.startsWith(`${selectedYear}-`));
  const incrementos = periodRows.reduce((sum, row) => sum + (row.increment || 0), 0);
  const decrementos = periodRows.reduce((sum, row) => sum + (row.decrement || 0), 0);
  const validRows = [...periodRows].reverse();
  const lastWithFinal = validRows.find((row) => row.finalBalance !== undefined && row.finalBalance > 0);
  const lastWithBase = validRows.find((row) => row.baseBalance !== undefined && row.baseBalance > 0);
  const saldo = lastWithFinal?.finalBalance ?? lastWithBase?.baseBalance ?? 0;
  const beneficioTotal = saldo + decrementos - incrementos;
  const rentabilidad = incrementos > 0 ? (beneficioTotal / incrementos) * 100 : 0;

  const periodYears = selectedYear === 'all' ? availableYears : [selectedYear];
  const periodMonthKeys = periodYears.flatMap((year) =>
    Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
  );
  const { monthlyStats, patrimonioEvolution, lastMonth } =
    selectedYear === 'all'
      ? buildMonthlyStatsForMonths(rows, monthlyHistory, periodMonthKeys, { forceHistoryReturn: true })
      : buildMonthlyStatsForYear(rows, monthlyHistory, selectedYear, { forceHistoryReturn: true });

  const movements: ClientReportData['movements'] = [];
  [...periodRows].sort((a, b) => a.iso.localeCompare(b.iso)).forEach((row) => {
    if (row.increment && row.increment > 0) {
      movements.push({ iso: row.iso, type: 'increment', amount: row.increment, balance: row.finalBalance || 0 });
    }
    if (row.decrement && row.decrement > 0) {
      movements.push({ iso: row.iso, type: 'decrement', amount: row.decrement, balance: row.finalBalance || 0 });
    }
  });

  const rowsByMonth = new Map<string, typeof periodRows>();
  [...periodRows].sort((a, b) => a.iso.localeCompare(b.iso)).forEach((row) => {
    const monthKey = row.iso.slice(0, 7);
    rowsByMonth.set(monthKey, [...(rowsByMonth.get(monthKey) ?? []), row]);
  });

  const contributionBreakdowns: ClientReportData['contributionBreakdowns'] = monthlyStats
    .map((monthStat) => {
      const monthRows = rowsByMonth.get(monthStat.monthKey) ?? [];
      const contributionRows = monthRows.filter((row) => (row.increment ?? 0) > 0);
      if (!monthStat.hasData || contributionRows.length === 0) return null;

      const firstRow = monthRows[0];
      const initialCapital = Math.max(
        0,
        (firstRow?.baseBalance ?? 0) - (firstRow?.increment ?? 0) + (firstRow?.decrement ?? 0)
      );
      const initialReturnPct = (monthStat.profitPct ?? 0) / 100;
      const initialProfit = initialCapital * initialReturnPct;
      const contributions = contributionRows.map((row) => {
        const amount = row.increment ?? 0;
        const returnPct = normalizeMonthlyReturnPct(row.incrementReturnPct) ?? initialReturnPct;
        return {
          iso: row.iso,
          amount,
          returnPct,
          profit: amount * returnPct
        };
      });
      const totalProfit = initialProfit + contributions.reduce((sum, item) => sum + item.profit, 0);

      return {
        month: monthStat.monthKey,
        monthLabel: monthStat.monthLabel,
        initialCapital,
        initialReturnPct,
        initialProfit,
        contributions,
        totalProfit
      };
    })
    .filter((item): item is ClientReportData['contributionBreakdowns'][number] => item !== null);

  const contact = contacts[clientId];
  const contactName = contact && (contact.name || contact.surname) ? `${contact.name ?? ''} ${contact.surname ?? ''}`.trim() : '';
  const displayName = contactName || fallbackName || client?.name || clientId;
  const twrMonths = monthlyStats.filter((item) => item.hasData && (item.profit !== 0 || item.profitPct !== 0 || item.endBalance !== 0));
  const twrYtd = twrMonths.reduce((acc, item) => acc * (1 + (item.profitPct ?? 0) / 100), 1) - 1;
  const twrMonthly = calculateAllMonthsTWR(periodRows);

  return {
    id: clientId,
    code: client?.name ?? clientId,
    name: displayName,
    contact,
    incrementos,
    decrementos,
    saldo,
    beneficioTotal,
    rentabilidad,
    monthlyStats,
    movements,
    contributionBreakdowns,
    patrimonioEvolution,
    beneficioUltimoMes: lastMonth?.profit ?? 0,
    rentabilidadUltimoMes: lastMonth?.profitPct ?? 0,
    twrYtd,
    twrMonthly
  };
}

export function toClientReportPayload(data: ClientReportData): ClientReportPayload {
  const monthlyStats = data.monthlyStats.filter(
    (item) => item.hasData && (item.profit !== 0 || item.profitPct !== 0 || item.endBalance !== 0)
  );
  const patrimonioEvolution = data.patrimonioEvolution.filter(
    (item) => item.hasData && (item.balance ?? 0) !== 0
  );

  return {
    clientId: data.id,
    clientName: data.name,
    clientCode: data.code,
    incrementos: data.incrementos ?? 0,
    decrementos: data.decrementos ?? 0,
    saldo: data.saldo ?? 0,
    beneficioTotal: data.beneficioTotal ?? 0,
    rentabilidad: data.rentabilidad ?? 0,
    beneficioUltimoMes: data.beneficioUltimoMes ?? 0,
    rentabilidadUltimoMes: data.rentabilidadUltimoMes ?? 0,
    twrYtd: data.twrYtd ?? 0,
    monthlyStats: monthlyStats.map((item) => ({
      month: item.monthLabel,
      profit: item.profit ?? 0,
      profitPct: item.profitPct ?? 0,
      endBalance: item.endBalance ?? 0,
      hasData: item.hasData ?? false
    })),
    patrimonioEvolution: patrimonioEvolution.map((item) => ({
      month: item.monthLabel,
      balance: item.balance ?? 0,
      hasData: item.hasData ?? false
    })),
    movements: data.movements.map((item) => ({
      iso: item.iso,
      type: item.type,
      amount: item.amount ?? 0,
      balance: item.balance ?? 0
    })),
    contributionBreakdowns: data.contributionBreakdowns.map((item) => ({
      month: item.monthLabel,
      initialCapital: item.initialCapital ?? 0,
      initialReturnPct: item.initialReturnPct ?? 0,
      initialProfit: item.initialProfit ?? 0,
      contributions: item.contributions.map((contribution) => ({
        iso: contribution.iso,
        amount: contribution.amount ?? 0,
        returnPct: contribution.returnPct ?? 0,
        profit: contribution.profit ?? 0
      })),
      totalProfit: item.totalProfit ?? 0
    }))
  };
}
