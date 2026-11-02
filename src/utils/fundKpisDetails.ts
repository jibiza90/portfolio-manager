import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { buildClientReportData } from './clientReport';
import { getCapitalPendingToRecover, getCommissionRate, getWithdrawalCommissions } from './commissions';
import type { ClientFigure, FundKpis, FundMonth } from './fundKpis';
import { getOccurrencesForMonth, monthOf, type RecurringWithdrawalsState } from './recurringWithdrawals';

// Mas KPIs del fondo: riesgo, periodos, distribucion de clientes, records, comisiones por mes,
// buscador de cliente y foto del fondo a una fecha. Solo lee datos; no cambia nada.

const compound = (returns: number[]) => returns.reduce((factor, value) => factor * (1 + value), 1) - 1;
const median = (values: number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const lastDayIso = (month: string) => `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;

export const BALANCE_TIERS = [
  { label: 'Menos de 10.000 €', min: 0, max: 10_000 },
  { label: '10.000 € a 50.000 €', min: 10_000, max: 50_000 },
  { label: '50.000 € a 100.000 €', min: 50_000, max: 100_000 },
  { label: '100.000 € a 500.000 €', min: 100_000, max: 500_000 },
  { label: 'Más de 500.000 €', min: 500_000, max: Infinity }
];

export interface FundDetails {
  periods: { m1?: number; m3?: number; m6?: number; ytd?: number; y1?: number; sinceStart?: number };
  annualReturns: Array<{ year: string; returnPct: number; months: number; complete: boolean }>;
  growthOf10k?: { since: string; value: number };
  volatility?: number;
  maxDrawdown: { depth: number; peakMonth?: string; troughMonth?: string; recoveredMonth?: string; recoveryMonths?: number };
  streak: { current: number; best: number };
  netOfCommission: Array<{ rate: number; last12?: number; sinceStart?: number }>;
  tiers: Array<{ label: string; count: number; total: number }>;
  medianBalance?: number;
  largest?: ClientFigure;
  smallest?: ClientFigure;
  recurringActive: { count: number; monthlyTotal: number };
  flowsByYear: Array<{
    year: string;
    newClientsMoney: number;
    existingClientsMoney: number;
    contributions: number;
    averageContribution?: number;
    withdrawals: number;
    averageWithdrawal?: number;
  }>;
  withdrawalsPctByMonth: Record<string, number | undefined>;
  commissionsByMonth: Array<{ month: string; generated: number; paid: number }>;
  commissionsByYear: Array<{ year: string; generated: number; paid: number }>;
  commissionForecast30: number;
  clientReturns: { positive: number; total: number; best?: { clientId: string; pct: number }; worst?: { clientId: string; pct: number }; median?: number };
  profitWithdrawn: number;
  profitInvested: number;
  capitalPending: number;
  records: {
    peakAum?: { month: string; value: number };
    biggestContribution?: { clientId: string; iso: string; amount: number };
    biggestWithdrawal?: { clientId: string; iso: string; amount: number };
    bestInflowMonth?: FundMonth;
  };
  cohorts: Array<{ year: string; clients: number; contributed: number; stillActive: number; balance: number }>;
}

interface DetailsInput {
  kpis: FundKpis;
  movementsByClient: Record<string, Record<string, Movement>>;
  commissionRates: Record<string, number | null>;
  paidWithdrawals: Record<string, boolean>;
  recurring: RecurringWithdrawalsState;
}

export const buildFundDetails = ({ kpis, movementsByClient, commissionRates, paidWithdrawals, recurring }: DetailsInput): FundDetails => {
  const { todayIso } = kpis;
  const currentYear = todayIso.slice(0, 4);
  const closed = kpis.months.filter((month) => month.returnPct !== undefined);
  const returns = closed.map((month) => month.returnPct!);
  const lastN = (count: number) => (returns.length >= count ? compound(returns.slice(-count)) : undefined);
  const clientIds = new Set(kpis.clients.map((client) => client.clientId));

  // Rentabilidad por año natural.
  const years = [...new Set(closed.map((month) => month.month.slice(0, 4)))].sort();
  const annualReturns = years.map((year) => {
    const list = closed.filter((month) => month.month.startsWith(`${year}-`));
    return { year, returnPct: compound(list.map((month) => month.returnPct!)), months: list.length, complete: list.length === 12 || (year < currentYear && list[list.length - 1]?.month === `${year}-12`) };
  });

  // Volatilidad anualizada (desviacion de los meses x raiz de 12).
  let volatility: number | undefined;
  if (returns.length >= 3) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    volatility = Math.sqrt(variance) * Math.sqrt(12);
  }

  // Maxima caida con cierres mensuales y cuanto tardo en recuperarse.
  // Indice acumulado al cierre de cada mes (empieza en 1 antes del primer mes).
  const indexes: number[] = [];
  closed.forEach((month, position) => indexes.push((position > 0 ? indexes[position - 1] : 1) * (1 + month.returnPct!)));
  const maxDrawdown: FundDetails['maxDrawdown'] = { depth: 0 };
  let peak = 1;
  let peakMonth: string | undefined;
  let worst: { depth: number; peak: number; peakMonth?: string; trough: number } | null = null;
  indexes.forEach((value, position) => {
    if (value >= peak) {
      peak = value;
      peakMonth = closed[position].month;
      return;
    }
    const depth = value / peak - 1;
    if (!worst || depth < worst.depth) worst = { depth, peak, peakMonth, trough: position };
  });
  if (worst) {
    const found: { depth: number; peak: number; peakMonth?: string; trough: number } = worst;
    maxDrawdown.depth = found.depth;
    maxDrawdown.peakMonth = found.peakMonth;
    maxDrawdown.troughMonth = closed[found.trough].month;
    const recovery = indexes.findIndex((value, position) => position > found.trough && value >= found.peak);
    if (recovery >= 0) {
      maxDrawdown.recoveredMonth = closed[recovery].month;
      maxDrawdown.recoveryMonths = recovery - found.trough;
    }
  }

  // Rachas de meses positivos.
  let current = 0;
  let best = 0;
  returns.forEach((value) => {
    current = value > 0 ? current + 1 : 0;
    best = Math.max(best, current);
  });

  const sinceStart = returns.length > 0 ? compound(returns) : undefined;
  const last12 = lastN(12);

  // Distribucion de clientes.
  const active = kpis.clients.filter((client) => client.balance > 0.5);
  const tiers = BALANCE_TIERS.map((tier) => {
    const list = active.filter((client) => client.balance >= tier.min && client.balance < tier.max);
    return { label: tier.label, count: list.length, total: list.reduce((sum, client) => sum + client.balance, 0) };
  });
  const byBalance = [...active].sort((left, right) => right.balance - left.balance);

  const activeRules = recurring.rules.filter((rule) => !rule.removedAt && rule.active && clientIds.has(rule.clientId));

  // Captacion por año: dinero de clientes nuevos (entran ese año) frente a los que ya estaban.
  const firstYear = new Map(kpis.clients.map((client) => [client.clientId, client.firstContribution?.slice(0, 4)]));
  const flowYears = new Map<string, { newMoney: number; existing: number; contributions: number[]; withdrawals: number[] }>();
  kpis.clients.forEach((client) => {
    Object.entries(movementsByClient[client.clientId] ?? {}).forEach(([iso, item]) => {
      const year = iso.slice(0, 4);
      if (iso > todayIso) return;
      if (!flowYears.has(year)) flowYears.set(year, { newMoney: 0, existing: 0, contributions: [], withdrawals: [] });
      const entry = flowYears.get(year)!;
      if ((item.increment ?? 0) > 0) {
        entry.contributions.push(item.increment!);
        if (firstYear.get(client.clientId) === year) entry.newMoney += item.increment!;
        else entry.existing += item.increment!;
      }
      if ((item.decrement ?? 0) > 0) entry.withdrawals.push(item.decrement!);
    });
  });
  const average = (list: number[]) => (list.length > 0 ? list.reduce((sum, value) => sum + value, 0) / list.length : undefined);
  const flowsByYear = [...flowYears.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([year, entry]) => ({
    year,
    newClientsMoney: entry.newMoney,
    existingClientsMoney: entry.existing,
    contributions: entry.contributions.length,
    averageContribution: average(entry.contributions),
    withdrawals: entry.withdrawals.length,
    averageWithdrawal: average(entry.withdrawals)
  }));

  // Retiradas del mes sobre el patrimonio del mes anterior.
  const withdrawalsPctByMonth: Record<string, number | undefined> = {};
  kpis.months.forEach((month, position) => {
    const previous = kpis.months[position - 1]?.endBalance;
    withdrawalsPctByMonth[month.month] = previous && previous > 0 && month.withdrawals > 0 ? month.withdrawals / previous : undefined;
  });

  // Comisiones por mes y año, beneficio ya retirado y capital pendiente de recuperar.
  const commissionMonths = new Map<string, { generated: number; paid: number }>();
  let profitWithdrawn = 0;
  let capitalPending = 0;
  let commissionForecast30 = 0;
  const limit = (() => {
    const date = new Date(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1, Number(todayIso.slice(8, 10)) + 30);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();
  const upcoming = [0, 1, 2].flatMap((offset) => {
    const date = new Date(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1 + offset, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return getOccurrencesForMonth(recurring, movementsByClient, month, todayIso)
      .filter((item) => (item.status === 'upcoming' || item.status === 'today') && item.scheduledIso <= limit);
  });
  kpis.clients.forEach((client) => {
    const movements = movementsByClient[client.clientId] ?? {};
    const rate = getCommissionRate(client.clientId, commissionRates);
    getWithdrawalCommissions(movements, rate).forEach((item) => {
      profitWithdrawn += item.commissionableAmount;
      const entry = commissionMonths.get(monthOf(item.iso)) ?? { generated: 0, paid: 0 };
      entry.generated += item.commission;
      if (paidWithdrawals[`${client.clientId}-${item.iso}`]) entry.paid += item.commission;
      commissionMonths.set(monthOf(item.iso), entry);
    });
    capitalPending += client.balance > 0.5 ? Math.min(client.balance, getCapitalPendingToRecover(movements)) : 0;
    // Prevision: se simulan las retiradas fijas de los proximos 30 dias (sin guardar nada).
    const own = upcoming.filter((item) => item.rule.clientId === client.clientId);
    if (own.length > 0 && rate) {
      const simulated: Record<string, Movement> = { ...movements };
      own.forEach((item) => {
        simulated[item.scheduledIso] = { ...(simulated[item.scheduledIso] ?? {}), decrement: (simulated[item.scheduledIso]?.decrement ?? 0) + item.rule.amount };
      });
      const isos = new Set(own.map((item) => item.scheduledIso));
      commissionForecast30 += getWithdrawalCommissions(simulated, rate).filter((item) => isos.has(item.iso)).reduce((sum, item) => sum + item.commission, 0);
    }
  });
  const commissionsByMonth = [...commissionMonths.entries()]
    .filter(([, value]) => value.generated > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, value]) => ({ month, ...value }));
  const commissionsByYear = [...new Set(commissionsByMonth.map((item) => item.month.slice(0, 4)))].sort().reverse().map((year) => ({
    year,
    generated: commissionsByMonth.filter((item) => item.month.startsWith(`${year}-`)).reduce((sum, item) => sum + item.generated, 0),
    paid: commissionsByMonth.filter((item) => item.month.startsWith(`${year}-`)).reduce((sum, item) => sum + item.paid, 0)
  }));

  // Rentabilidad total de cada cliente (beneficio / todo lo aportado).
  const clientPcts = active.filter((client) => client.contributed > 0).map((client) => ({ clientId: client.clientId, pct: client.profit / client.contributed }));
  const sortedPcts = [...clientPcts].sort((left, right) => right.pct - left.pct);

  // Records.
  let biggestContribution: FundDetails['records']['biggestContribution'];
  let biggestWithdrawal: FundDetails['records']['biggestWithdrawal'];
  kpis.clients.forEach((client) => {
    Object.entries(movementsByClient[client.clientId] ?? {}).forEach(([iso, item]) => {
      if ((item.increment ?? 0) > (biggestContribution?.amount ?? 0)) biggestContribution = { clientId: client.clientId, iso, amount: item.increment! };
      if ((item.decrement ?? 0) > (biggestWithdrawal?.amount ?? 0)) biggestWithdrawal = { clientId: client.clientId, iso, amount: item.decrement! };
    });
  });
  const withBalance = kpis.months.filter((month) => month.endBalance !== undefined);
  const peakMonthEntry = withBalance.reduce<FundMonth | undefined>((max, month) => (!max || month.endBalance! > max.endBalance! ? month : max), undefined);
  const bestInflowMonth = kpis.months.reduce<FundMonth | undefined>((max, month) => (!max || month.net > max.net ? month : max), undefined);

  // Por año de entrada.
  const cohortYears = [...new Set(kpis.clients.map((client) => client.firstContribution?.slice(0, 4)).filter((year): year is string => Boolean(year)))].sort();
  const cohorts = cohortYears.map((year) => {
    const list = kpis.clients.filter((client) => client.firstContribution?.startsWith(`${year}-`));
    const stillActive = list.filter((client) => client.balance > 0.5);
    return { year, clients: list.length, contributed: list.reduce((sum, client) => sum + client.contributed, 0), stillActive: stillActive.length, balance: stillActive.reduce((sum, client) => sum + client.balance, 0) };
  });

  return {
    periods: { m1: lastN(1), m3: lastN(3), m6: lastN(6), ytd: kpis.ytdReturn, y1: last12, sinceStart },
    annualReturns,
    growthOf10k: sinceStart !== undefined && kpis.sinceMonth ? { since: kpis.sinceMonth, value: 10_000 * (1 + sinceStart) } : undefined,
    volatility,
    maxDrawdown,
    streak: { current, best },
    netOfCommission: [0.05, 0.08].map((rate) => ({
      rate,
      last12: last12 !== undefined ? last12 * (1 - rate) : undefined,
      sinceStart: sinceStart !== undefined ? sinceStart * (1 - rate) : undefined
    })),
    tiers,
    medianBalance: median(active.map((client) => client.balance)),
    largest: byBalance[0],
    smallest: byBalance[byBalance.length - 1],
    recurringActive: { count: activeRules.length, monthlyTotal: activeRules.reduce((sum, rule) => sum + rule.amount, 0) },
    flowsByYear,
    withdrawalsPctByMonth,
    commissionsByMonth,
    commissionsByYear,
    commissionForecast30,
    clientReturns: {
      positive: clientPcts.filter((item) => item.pct > 0).length,
      total: clientPcts.length,
      best: sortedPcts[0],
      worst: sortedPcts[sortedPcts.length - 1],
      median: median(clientPcts.map((item) => item.pct))
    },
    profitWithdrawn,
    profitInvested: kpis.totalProfit - profitWithdrawn,
    capitalPending,
    records: {
      peakAum: peakMonthEntry ? { month: peakMonthEntry.month, value: peakMonthEntry.endBalance! } : undefined,
      biggestContribution,
      biggestWithdrawal,
      bestInflowMonth
    },
    cohorts
  };
};

// Foto del fondo a final de un mes: como estaba ese dia (saldo, clientes, aportado, beneficio).
export const getFundAt = (snapshot: PortfolioSnapshot, clientIds: string[], month: string) => {
  const end = lastDayIso(month);
  const clients = clientIds.map((clientId) => {
    const rows = (snapshot.clientRowsById[clientId] ?? []).filter((row) => row.iso <= end);
    const reversed = [...rows].reverse();
    const last = reversed.find((row) => row.finalBalance !== undefined || row.baseBalance !== undefined);
    return {
      clientId,
      balance: Math.max(0, last?.finalBalance ?? last?.baseBalance ?? 0),
      contributed: rows.reduce((sum, row) => sum + (row.increment ?? 0), 0),
      withdrawn: rows.reduce((sum, row) => sum + (row.decrement ?? 0), 0),
      profit: reversed.find((row) => row.cumulativeProfit !== undefined)?.cumulativeProfit ?? 0
    };
  });
  const active = clients.filter((client) => client.balance > 0.5);
  return {
    month,
    aum: active.reduce((sum, client) => sum + client.balance, 0),
    activeClients: active.length,
    contributed: clients.reduce((sum, client) => sum + client.contributed, 0),
    withdrawn: clients.reduce((sum, client) => sum + client.withdrawn, 0),
    profit: clients.reduce((sum, client) => sum + client.profit, 0),
    largest: [...active].sort((left, right) => right.balance - left.balance)[0]
  };
};

// Ficha rapida de un cliente para el buscador.
export const getClientSummary = ({
  clientId,
  kpis,
  snapshot,
  movementsByClient,
  monthlyHistoryByClient,
  commissionRates,
  paidWithdrawals,
  recurring
}: {
  clientId: string;
  kpis: FundKpis;
  snapshot: PortfolioSnapshot;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  commissionRates: Record<string, number | null>;
  paidWithdrawals: Record<string, boolean>;
  recurring: RecurringWithdrawalsState;
}) => {
  const figure = kpis.clients.find((client) => client.clientId === clientId);
  if (!figure) return null;
  const movements = movementsByClient[clientId] ?? {};
  const report = buildClientReportData(clientId, 'all', {}, snapshot, monthlyHistoryByClient);
  const months = (report?.monthlyStats ?? []).filter((month) => month.hasData && (month.profit !== 0 || month.profitPct !== 0 || month.endBalance !== 0));
  const twr = months.length > 0 ? compound(months.map((month) => month.profitPct / 100)) : undefined;
  const rate = getCommissionRate(clientId, commissionRates);
  const commissions = getWithdrawalCommissions(movements, rate);
  const isos = Object.keys(movements).sort();
  return {
    ...figure,
    totalReturn: figure.contributed > 0 ? figure.profit / figure.contributed : undefined,
    twr,
    lastMonth: months[months.length - 1],
    share: kpis.aum > 0 ? figure.balance / kpis.aum : 0,
    rate,
    commissionsPending: commissions.filter((item) => !paidWithdrawals[`${clientId}-${item.iso}`]).reduce((sum, item) => sum + item.commission, 0),
    commissionsPaid: commissions.filter((item) => paidWithdrawals[`${clientId}-${item.iso}`]).reduce((sum, item) => sum + item.commission, 0),
    capitalPending: getCapitalPendingToRecover(movements),
    lastContribution: isos.filter((iso) => (movements[iso].increment ?? 0) > 0).pop(),
    lastWithdrawalIso: isos.filter((iso) => (movements[iso].decrement ?? 0) > 0).pop(),
    contributions: isos.filter((iso) => (movements[iso].increment ?? 0) > 0).length,
    withdrawals: isos.filter((iso) => (movements[iso].decrement ?? 0) > 0).length,
    fixedWithdrawals: recurring.rules.filter((rule) => rule.clientId === clientId && !rule.removedAt && rule.active)
  };
};
