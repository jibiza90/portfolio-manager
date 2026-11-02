import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { buildClientReportData } from './clientReport';
import { formatCurrency, formatPercentValue } from './format';
import {
  buildMonthlyStatsForMonths,
  getDominantMonthlyReturn,
  getStandaloneContributionReturnForMonth,
  normalizeMonthlyReturnPct
} from './monthlyHistory';

// Comprobacion antes de publicar: calcula lo que va a ver cada cliente y solo devuelve lo raro.
// No cambia nada: solo lee los datos guardados y lo publicado la ultima vez.

export type PublicationIssueSeverity = 'error' | 'warning' | 'info';

export interface PublicationIssue {
  clientId: string;
  severity: PublicationIssueSeverity;
  text: string;
}

export interface PublicationRow {
  clientId: string;
  saldoBefore?: number;
  saldoAfter: number;
  monthPct?: number;
  monthProfit?: number;
}

export interface PublicationCheck {
  month?: string;
  generalReturn?: number;
  checkedClients: number;
  issues: PublicationIssue[];
  rows: PublicationRow[];
}

// Lo publicado la ultima vez (forma del informe guardado para el cliente).
export interface PublishedReport {
  saldo?: number;
  monthlyStats?: Array<{ month?: string; profitPct?: number; profit?: number; endBalance?: number; hasData?: boolean }>;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const longMonthLabel = (monthKey: string) => `${MONTHS[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`;
const pct = (value: number) => formatPercentValue(value);
const monthEnd = (monthKey: string) => `${monthKey}-31`;

// Tolerancias: 0,01 puntos de rentabilidad y 1 € de beneficio (por debajo es redondeo).
const PCT_TOLERANCE = 0.01;
const PROFIT_TOLERANCE = 1;
// A partir de esta diferencia con la general (en puntos) se avisa.
const GENERAL_TOLERANCE = 0.5;
// Si el mes anterior ya se separaba mas que esto de la general, es un cliente con rentabilidad propia habitual.
const USUAL_DIFFERENCE = 0.1;

export const buildPublicationCheck = ({
  clientIds,
  snapshot,
  monthlyHistoryByClient,
  movementsByClient,
  published,
  excluded = new Set<string>()
}: {
  clientIds: string[];
  snapshot: PortfolioSnapshot;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  movementsByClient: Record<string, Record<string, Movement>>;
  published: Record<string, PublishedReport | null | undefined>;
  excluded?: Set<string>;
}): PublicationCheck => {
  const ids = clientIds.filter((id) => !excluded.has(id));
  // Mes que se publica: el ultimo con rentabilidad puesta en algun cliente.
  const month = ids
    .flatMap((id) => Object.entries(monthlyHistoryByClient[id] ?? {})
      .filter(([, entry]) => normalizeMonthlyReturnPct(entry?.returnPct) !== undefined)
      .map(([key]) => key))
    .sort()
    .pop();
  const generalReturn = month
    ? getDominantMonthlyReturn(ids.map((id) => monthlyHistoryByClient[id]?.[month]?.returnPct))
    : undefined;
  const label = month ? longMonthLabel(month) : '';

  const issues: PublicationIssue[] = [];
  const rows: PublicationRow[] = [];
  let checkedClients = 0;

  ids.forEach((clientId) => {
    const history = monthlyHistoryByClient[clientId] ?? {};
    const movements = movementsByClient[clientId] ?? {};
    const clientRows = snapshot.clientRowsById[clientId] ?? [];
    if (clientRows.length === 0 && Object.keys(movements).length === 0) return;
    const report = buildClientReportData(clientId, 'all', {}, snapshot, monthlyHistoryByClient);
    if (!report) return;
    const stats = report.monthlyStats.filter((item) => item.hasData && (item.profit !== 0 || item.profitPct !== 0 || item.endBalance !== 0));
    if (stats.length === 0 && !Object.values(movements).some((item) => (item.increment ?? 0) > 0)) return;
    checkedClients += 1;
    const add = (severity: PublicationIssueSeverity, text: string) => issues.push({ clientId, severity, text });

    if (!Number.isFinite(report.saldo) || report.saldo < -0.01) {
      add('error', 'El saldo sale negativo o no se puede calcular.');
    }

    const target = month ? stats.find((item) => item.monthKey === month) : undefined;
    rows.push({ clientId, saldoBefore: published[clientId]?.saldo, saldoAfter: report.saldo, monthPct: target?.profitPct, monthProfit: target?.profit });

    if (month) {
      const monthMovements = Object.entries(movements).filter(([iso]) => iso.startsWith(`${month}-`)).map(([, item]) => item);
      const contributedBefore = Object.entries(movements).some(([iso, item]) => iso <= monthEnd(month) && (item.increment ?? 0) > 0);
      const previous = [...stats].reverse().find((item) => item.monthKey < month);
      const investedInMonth = (previous?.endBalance ?? 0) > 0.5 || monthMovements.some((item) => (item.increment ?? 0) > 0);
      const standalone = getStandaloneContributionReturnForMonth(movements, history, month);
      const hasReturn = normalizeMonthlyReturnPct(history[month]?.returnPct) !== undefined || standalone !== undefined;

      if (contributedBefore && investedInMonth && !hasReturn) {
        add('error', `Falta la rentabilidad de ${label}.`);
      }

      if (target && standalone !== undefined) {
        add('info', `Empieza en ${label} con rentabilidad propia: ${pct(standalone * 100)}.`);
      } else if (target && hasReturn && generalReturn !== undefined) {
        const hasOwnReturns = monthMovements.some((item) =>
          item.incrementReturnPct !== undefined || item.decrementReturnPct !== undefined || item.manualProfitPct !== undefined || item.manualProfit !== undefined);
        // Clientes que siempre llevan otra rentabilidad (el mes anterior tambien era distinta a la general) no avisan.
        const previousGeneral = previous
          ? getDominantMonthlyReturn(ids.map((id) => monthlyHistoryByClient[id]?.[previous.monthKey]?.returnPct))
          : undefined;
        const usuallyDifferent = previous !== undefined && previousGeneral !== undefined &&
          Math.abs(previous.profitPct - previousGeneral * 100) > USUAL_DIFFERENCE;
        if (!hasOwnReturns && !usuallyDifferent && Math.abs(target.profitPct - generalReturn * 100) > GENERAL_TOLERANCE) {
          add('warning', `Rentabilidad de ${label}: ${pct(target.profitPct)} (la general es ${pct(generalReturn * 100)}).`);
        }
      }

      // Lo que ve el admin en la ficha frente a lo que vera el cliente, en el mes que se publica.
      const months = Array.from(new Set([...clientRows.map((row) => row.iso.slice(0, 7)), ...Object.keys(history)])).sort();
      const adminTarget = buildMonthlyStatsForMonths(clientRows, history, months).monthlyStats.find((item) => item.monthKey === month && item.hasData);
      if (target && adminTarget && (Math.abs(adminTarget.profitPct - target.profitPct) > PCT_TOLERANCE || Math.abs(adminTarget.profit - target.profit) > PROFIT_TOLERANCE)) {
        add('warning', `Tu ficha y lo que verá el cliente no coinciden en ${label}: ficha ${pct(adminTarget.profitPct)} (${formatCurrency(adminTarget.profit)}), cliente ${pct(target.profitPct)} (${formatCurrency(target.profit)}).`);
      }
    }

    // Meses que ya estaban publicados y cambian ahora.
    const before = published[clientId]?.monthlyStats?.filter((item) => item.hasData && item.month) ?? [];
    const changed: string[] = [];
    before.forEach((item) => {
      const now = stats.find((stat) => stat.monthLabel === item.month);
      if (!now) {
        changed.push(`${item.month} desaparece`);
        return;
      }
      if (month && now.monthKey >= month) return;
      const pctChanged = Math.abs((item.profitPct ?? 0) - now.profitPct) > PCT_TOLERANCE;
      const profitChanged = Math.abs((item.profit ?? 0) - now.profit) > PROFIT_TOLERANCE;
      if (pctChanged) changed.push(`${item.month}: ${pct(item.profitPct ?? 0)} → ${pct(now.profitPct)}`);
      else if (profitChanged) changed.push(`${item.month}: ${formatCurrency(item.profit ?? 0)} → ${formatCurrency(now.profit)}`);
    });
    if (changed.length > 0) {
      add('warning', `Cambian meses que ya estaban publicados: ${changed.join(' · ')}.`);
    }
  });

  return { month, generalReturn, checkedClients, issues, rows };
};
