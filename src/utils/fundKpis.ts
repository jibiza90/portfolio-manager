import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { getCapitalPendingToRecover, getCommissionRate, getWithdrawalCommissions } from './commissions';
import { getDominantMonthlyReturn } from './monthlyHistory';
import {
  addMonths,
  getOccurrencesForMonth,
  getPendingOccurrences,
  monthOf,
  type RecurringWithdrawalsState
} from './recurringWithdrawals';

// KPIs del fondo para el admin. Solo lee los datos guardados (incluye lo pendiente de publicar).
// Saldo y beneficio: los de la ficha de cada cliente. Aportado, retirado y comisiones: como la pantalla de Comisiones. Rentabilidad mensual del fondo: la general (como Estadisticas).

export interface FundMonth {
  month: string;
  contributions: number;
  withdrawals: number;
  net: number;
  profit: number;
  endBalance?: number;
  // Rentabilidad del mes en tanto por uno (undefined: mes sin cerrar).
  returnPct?: number;
}

export interface ClientFigure {
  clientId: string;
  balance: number;
  contributed: number;
  withdrawn: number;
  profit: number;
  firstContribution?: string;
  lastWithdrawal?: string;
}

export interface FundKpis {
  todayIso: string;
  aum: number;
  activeClients: number;
  netContributed: number;
  totalContributed: number;
  totalWithdrawn: number;
  totalProfit: number;
  averageBalance: number;
  months: FundMonth[];
  lastClosedMonth?: FundMonth;
  ytdReturn?: number;
  last12Return?: number;
  annualizedReturn?: number;
  sinceMonth?: string;
  positiveMonths: number;
  closedMonths: number;
  bestMonth?: FundMonth;
  worstMonth?: FundMonth;
  flows: Record<'month' | 'year' | 'all', { contributions: number; withdrawals: number; net: number }>;
  clients: ClientFigure[];
  newClientsThisYear: ClientFigure[];
  newClientsThisMonth: number;
  closedClients: ClientFigure[];
  averageTenureMonths?: number;
  top: Array<ClientFigure & { share: number }>;
  top3Share: number;
  top5Share: number;
  upcomingWithdrawals: Array<{ clientId: string; amount: number; iso: string }>;
  upcomingTotal: number;
  overdueWithdrawals: number;
  overdueTotal: number;
  commissionsPaidThisYear: number;
  commissionsPending: number;
  commissionsIfAllWithdraw: number;
  commissionsGenerated: number;
}

const compound = (returns: number[]) => returns.reduce((factor, value) => factor * (1 + value), 1) - 1;
const addDaysIso = (iso: string, days: number) => {
  const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const monthsBetween = (fromIso: string, toIso: string) =>
  (Number(toIso.slice(0, 4)) - Number(fromIso.slice(0, 4))) * 12 + Number(toIso.slice(5, 7)) - Number(fromIso.slice(5, 7)) +
  (Number(toIso.slice(8, 10)) - Number(fromIso.slice(8, 10))) / 30;

export const buildFundKpis = ({
  clientIds: allClientIds,
  excluded = new Set<string>(),
  snapshot,
  movementsByClient,
  monthlyHistoryByClient,
  commissionRates,
  paidWithdrawals,
  recurring,
  todayIso
}: {
  clientIds: string[];
  // Clientes que no cuentan en los KPIs.
  excluded?: Set<string>;
  snapshot: PortfolioSnapshot;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  commissionRates: Record<string, number | null>;
  // Retiradas con la comision marcada como cobrada: clave `${clientId}-${iso}`.
  paidWithdrawals: Record<string, boolean>;
  recurring: RecurringWithdrawalsState;
  todayIso: string;
}): FundKpis => {
  const clientIds = allClientIds.filter((id) => !excluded.has(id));
  const currentMonth = monthOf(todayIso);
  const currentYear = todayIso.slice(0, 4);

  // Cifras de cada cliente.
  const clients: ClientFigure[] = clientIds.map((clientId) => {
    const rows = snapshot.clientRowsById[clientId] ?? [];
    const reversed = [...rows].reverse();
    // Ultimo saldo, aunque sea 0 (como la ficha): asi un cliente que lo ha retirado todo no cuenta como activo.
    const last = reversed.find((row) => row.finalBalance !== undefined || row.baseBalance !== undefined);
    const balance = Math.max(0, last?.finalBalance ?? last?.baseBalance ?? 0);
    const movements = Object.entries(movementsByClient[clientId] ?? {});
    return {
      clientId,
      balance,
      contributed: rows.reduce((sum, row) => sum + (row.increment ?? 0), 0),
      withdrawn: rows.reduce((sum, row) => sum + (row.decrement ?? 0), 0),
      profit: reversed.find((row) => row.cumulativeProfit !== undefined)?.cumulativeProfit ?? 0,
      firstContribution: movements.filter(([, item]) => (item.increment ?? 0) > 0).map(([iso]) => iso).sort()[0],
      lastWithdrawal: movements.filter(([, item]) => (item.decrement ?? 0) > 0).map(([iso]) => iso).sort().pop()
    };
  }).filter((client) => client.balance > 0 || client.contributed > 0);

  const active = clients.filter((client) => client.balance > 0.5);
  const aum = active.reduce((sum, client) => sum + client.balance, 0);
  const totalContributed = clients.reduce((sum, client) => sum + client.contributed, 0);
  const totalWithdrawn = clients.reduce((sum, client) => sum + client.withdrawn, 0);

  // Meses del fondo: entradas y salidas del registro; beneficio y patrimonio de la cartera general.
  const byMonth = new Map<string, FundMonth>();
  const monthEntry = (month: string) => {
    if (!byMonth.has(month)) byMonth.set(month, { month, contributions: 0, withdrawals: 0, net: 0, profit: 0 });
    return byMonth.get(month)!;
  };
  clientIds.forEach((clientId) => {
    Object.entries(movementsByClient[clientId] ?? {}).forEach(([iso, item]) => {
      if (iso > todayIso && monthOf(iso) > currentMonth) return;
      const entry = monthEntry(monthOf(iso));
      entry.contributions += Math.max(0, item.increment ?? 0);
      entry.withdrawals += Math.max(0, item.decrement ?? 0);
    });
  });
  let equity: number | undefined;
  snapshot.dailyRows.forEach((row) => {
    if (row.final !== undefined) equity = row.final;
    if (equity === undefined || monthOf(row.iso) > currentMonth) return;
    const entry = monthEntry(monthOf(row.iso));
    entry.profit += row.profit ?? 0;
    entry.endBalance = equity;
  });
  const months = [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month)).map((entry) => {
    // Rentabilidad del fondo: la general que pone el admin (la mas repetida entre los clientes ese mes).
    const general = getDominantMonthlyReturn(clientIds.map((id) => monthlyHistoryByClient[id]?.[entry.month]?.returnPct));
    return { ...entry, net: entry.contributions - entry.withdrawals, returnPct: general };
  }).filter((entry) => entry.contributions > 0 || entry.withdrawals > 0 || entry.returnPct !== undefined || (entry.endBalance ?? 0) > 0);

  const closedMonths = months.filter((entry) => entry.returnPct !== undefined);
  const returns = closedMonths.map((entry) => entry.returnPct!);
  const lastClosedMonth = closedMonths[closedMonths.length - 1];
  const yearMonths = closedMonths.filter((entry) => entry.month.startsWith(`${currentYear}-`));
  const sorted = [...closedMonths].sort((left, right) => left.returnPct! - right.returnPct!);

  const sumFlows = (list: FundMonth[]) => {
    const contributions = list.reduce((sum, entry) => sum + entry.contributions, 0);
    const withdrawals = list.reduce((sum, entry) => sum + entry.withdrawals, 0);
    return { contributions, withdrawals, net: contributions - withdrawals };
  };

  // Clientes.
  const newClientsThisYear = clients.filter((client) => client.firstContribution?.startsWith(`${currentYear}-`))
    .sort((left, right) => (left.firstContribution ?? '').localeCompare(right.firstContribution ?? ''));
  const closedClients = clients.filter((client) => client.balance <= 0.5 && client.contributed > 0);
  const tenures = active.filter((client) => client.firstContribution).map((client) => monthsBetween(client.firstContribution!, todayIso));

  // Concentracion.
  const ranked = [...active].sort((left, right) => right.balance - left.balance);
  const share = (list: ClientFigure[]) => (aum > 0 ? list.reduce((sum, client) => sum + client.balance, 0) / aum : 0);

  // Liquidez: retiradas fijas de los proximos 30 dias y las atrasadas.
  const limit = addDaysIso(todayIso, 30);
  const upcomingWithdrawals = [currentMonth, addMonths(currentMonth, 1), addMonths(currentMonth, 2)]
    .flatMap((month) => getOccurrencesForMonth(recurring, movementsByClient, month, todayIso))
    .filter((item) => (item.status === 'upcoming' || item.status === 'today') && item.scheduledIso <= limit)
    .map((item) => ({ clientId: item.rule.clientId, amount: item.rule.amount, iso: item.scheduledIso }))
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const overdue = getPendingOccurrences(recurring, movementsByClient, todayIso).filter((item) => item.status === 'overdue');

  // Comisiones (mismo calculo que la pantalla de Comisiones).
  let commissionsPaidThisYear = 0;
  let commissionsPending = 0;
  let commissionsGenerated = 0;
  let commissionsIfAllWithdraw = 0;
  clients.forEach((client) => {
    const rate = getCommissionRate(client.clientId, commissionRates);
    getWithdrawalCommissions(movementsByClient[client.clientId], rate).forEach((item) => {
      commissionsGenerated += item.commission;
      if (paidWithdrawals[`${client.clientId}-${item.iso}`]) {
        if (item.iso.startsWith(`${currentYear}-`)) commissionsPaidThisYear += item.commission;
      } else {
        commissionsPending += item.commission;
      }
    });
    if (rate) commissionsIfAllWithdraw += Math.max(0, client.balance - getCapitalPendingToRecover(movementsByClient[client.clientId])) * rate;
  });

  return {
    todayIso,
    aum,
    activeClients: active.length,
    netContributed: totalContributed - totalWithdrawn,
    totalContributed,
    totalWithdrawn,
    totalProfit: clients.reduce((sum, client) => sum + client.profit, 0),
    averageBalance: active.length > 0 ? aum / active.length : 0,
    months,
    lastClosedMonth,
    ytdReturn: yearMonths.length > 0 ? compound(yearMonths.map((entry) => entry.returnPct!)) : undefined,
    last12Return: returns.length >= 12 ? compound(returns.slice(-12)) : undefined,
    annualizedReturn: returns.length >= 12 ? (1 + compound(returns)) ** (12 / returns.length) - 1 : undefined,
    sinceMonth: closedMonths[0]?.month,
    positiveMonths: returns.filter((value) => value > 0).length,
    closedMonths: closedMonths.length,
    bestMonth: sorted[sorted.length - 1],
    worstMonth: sorted[0],
    flows: {
      month: sumFlows(months.filter((entry) => entry.month === currentMonth)),
      year: sumFlows(months.filter((entry) => entry.month.startsWith(`${currentYear}-`))),
      all: sumFlows(months)
    },
    clients,
    newClientsThisYear,
    newClientsThisMonth: clients.filter((client) => client.firstContribution?.startsWith(`${currentMonth}-`)).length,
    closedClients,
    averageTenureMonths: tenures.length > 0 ? tenures.reduce((sum, value) => sum + value, 0) / tenures.length : undefined,
    top: ranked.slice(0, 5).map((client) => ({ ...client, share: aum > 0 ? client.balance / aum : 0 })),
    top3Share: share(ranked.slice(0, 3)),
    top5Share: share(ranked.slice(0, 5)),
    upcomingWithdrawals,
    upcomingTotal: upcomingWithdrawals.reduce((sum, item) => sum + item.amount, 0),
    overdueWithdrawals: overdue.length,
    overdueTotal: overdue.reduce((sum, item) => sum + item.rule.amount, 0),
    commissionsPaidThisYear,
    commissionsPending,
    commissionsIfAllWithdraw,
    commissionsGenerated
  };
};
