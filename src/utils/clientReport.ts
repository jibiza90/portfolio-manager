import { CLIENTS } from '../constants/clients';
import { PortfolioSnapshot, MonthlyHistoryEntry } from '../types';
import { calculateAllMonthsTWR, calculateTWR } from './twr';
import { buildMonthlyStatsForMonths, buildMonthlyStatsForYear } from './monthlyHistory';
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
  patrimonioEvolution: ReturnType<typeof buildMonthlyStatsForMonths>['patrimonioEvolution'];
  beneficioUltimoMes: number;
  rentabilidadUltimoMes: number;
  twrYtd: number;
  twrMonthly: Array<{ month: string; twr: number; periods: Array<unknown> }>;
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
      ? buildMonthlyStatsForMonths(rows, monthlyHistory, periodMonthKeys)
      : buildMonthlyStatsForYear(rows, monthlyHistory, selectedYear);

  const movements: ClientReportData['movements'] = [];
  [...periodRows].sort((a, b) => a.iso.localeCompare(b.iso)).forEach((row) => {
    if (row.increment && row.increment > 0) {
      movements.push({ iso: row.iso, type: 'increment', amount: row.increment, balance: row.finalBalance || 0 });
    }
    if (row.decrement && row.decrement > 0) {
      movements.push({ iso: row.iso, type: 'decrement', amount: row.decrement, balance: row.finalBalance || 0 });
    }
  });

  const contact = contacts[clientId];
  const contactName = contact && (contact.name || contact.surname) ? `${contact.name ?? ''} ${contact.surname ?? ''}`.trim() : '';
  const displayName = contactName || fallbackName || client?.name || clientId;
  const twrYtd = calculateTWR(periodRows).twr;
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
    patrimonioEvolution,
    beneficioUltimoMes: lastMonth?.profit ?? 0,
    rentabilidadUltimoMes: lastMonth?.profitPct ?? 0,
    twrYtd,
    twrMonthly
  };
}
