import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { clientBalancesAt, buildRollForward } from './auditData';
import { getCommissionRate, getDefaultCommissionRate, getWithdrawalCommissions } from './commissions';
import { parseNumberEs } from './format';
import type { FundKpis } from './fundKpis';
import type { FundDetails } from './fundKpisDetails';
import { getDominantMonthlyReturn, normalizeMonthlyReturnPct } from './monthlyHistory';
import { getOccurrencesForMonth, monthOf, type RecurringWithdrawalsState } from './recurringWithdrawals';

// KPIs que miraria alguien que quiere comprar el fondo: ingresos, crecimiento, retencion, condiciones
// especiales, rentabilidad frente a riesgo, lista de espera y origen de los clientes. Solo lee datos.

export const CLIENT_ORIGINS = ['Relación personal', 'Recomendación de un cliente', 'Otro'] as const;

export interface BuyerContact {
  origin?: string;
  waitlistAmount?: string;
  waitlistNote?: string;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const addMonthsKey = (month: string, delta: number) => {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);

export const buildBuyerKpis = ({
  kpis,
  details,
  snapshot,
  movementsByClient,
  monthlyHistoryByClient,
  commissionRates,
  contacts,
  recurring
}: {
  kpis: FundKpis;
  details: FundDetails;
  snapshot: PortfolioSnapshot;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  commissionRates: Record<string, number | null>;
  contacts: Record<string, BuyerContact | undefined>;
  recurring: RecurringWithdrawalsState;
}) => {
  const { todayIso } = kpis;
  const currentMonth = monthOf(todayIso);
  const clientIds = kpis.clients.map((client) => client.clientId);
  const active = kpis.clients.filter((client) => client.balance > 0.5);

  // 1. Ingresos.
  const last12From = `${addMonthsKey(currentMonth, -12)}-01`;
  let commissionsLast12 = 0;
  kpis.clients.forEach((client) => {
    getWithdrawalCommissions(movementsByClient[client.clientId], getCommissionRate(client.clientId, commissionRates))
      .filter((item) => item.iso >= last12From && item.iso <= todayIso)
      .forEach((item) => { commissionsLast12 += item.commission; });
  });
  const revenueByYear = [...details.commissionsByYear].reverse().map((item, position, list) => ({
    ...item,
    change: position > 0 && list[position - 1].generated > 0 ? item.generated / list[position - 1].generated - 1 : undefined
  })).reverse();

  // Prevision 12 meses con las retiradas fijas (se simulan, sin guardar nada).
  let fixedForecast12 = 0;
  kpis.clients.forEach((client) => {
    const rate = getCommissionRate(client.clientId, commissionRates);
    if (!rate) return;
    const occurrences = Array.from({ length: 12 }, (_, index) => addMonthsKey(currentMonth, index))
      .flatMap((month) => getOccurrencesForMonth(recurring, movementsByClient, month, todayIso))
      .filter((item) => item.rule.clientId === client.clientId && (item.status === 'upcoming' || item.status === 'today'));
    if (occurrences.length === 0) return;
    const simulated: Record<string, Movement> = { ...(movementsByClient[client.clientId] ?? {}) };
    occurrences.forEach((item) => {
      simulated[item.scheduledIso] = { ...(simulated[item.scheduledIso] ?? {}), decrement: (simulated[item.scheduledIso]?.decrement ?? 0) + item.rule.amount };
    });
    const isos = new Set(occurrences.map((item) => item.scheduledIso));
    fixedForecast12 += getWithdrawalCommissions(simulated, rate).filter((item) => isos.has(item.iso)).reduce((sum, item) => sum + item.commission, 0);
  });

  // Ritmo de retiradas: lo retirado en los ultimos 12 meses sobre el patrimonio medio de esos meses.
  const last12Months = kpis.months.filter((month) => month.month >= addMonthsKey(currentMonth, -12) && month.month < currentMonth);
  const averageAum = last12Months.filter((month) => month.endBalance !== undefined).map((month) => month.endBalance!);
  const withdrawnLast12 = last12Months.reduce((sum, month) => sum + month.withdrawals, 0);
  const annualWithdrawalRate = averageAum.length > 0 && mean(averageAum) > 0 ? withdrawnLast12 / mean(averageAum) : undefined;

  // 2. Crecimiento: cuanto por dinero nuevo y cuanto por rentabilidad.
  const growthByYear = buildRollForward(kpis.months).yearly.map((row) => ({
    year: row.period,
    start: row.opening,
    end: row.closing,
    growth: row.closing - row.opening,
    fromInflows: row.contributions - row.withdrawals,
    fromReturns: row.profit,
    other: -row.difference
  })).reverse();
  const newClientsByMonth = Array.from({ length: 12 }, (_, index) => addMonthsKey(currentMonth, index - 11)).map((month) => {
    const list = kpis.clients.filter((client) => client.firstContribution?.startsWith(`${month}-`));
    return { month, count: list.length };
  });
  const firstContributions = kpis.clients.filter((client) => client.firstContribution).map((client) => movementsByClient[client.clientId]?.[client.firstContribution!]?.increment ?? 0);
  const contributionDates = kpis.clients.map((client) => Object.entries(movementsByClient[client.clientId] ?? {})
    .filter(([, item]) => (item.increment ?? 0) > 0).map(([iso]) => iso).sort());
  const withSecond = contributionDates.filter((list) => list.length >= 2);

  // 3. Retencion por año: clientes y patrimonio que se van.
  const years = [...new Set(kpis.months.map((month) => month.month.slice(0, 4)))].sort();
  const retentionByYear = years.map((year) => {
    const startBalances = clientBalancesAt(snapshot, clientIds, `${Number(year) - 1}-12`);
    const endMonth = year === todayIso.slice(0, 4) ? currentMonth : `${year}-12`;
    const endBalances = new Map(clientBalancesAt(snapshot, clientIds, endMonth).map((row) => [row.clientId, row.balance]));
    const atStart = startBalances.filter((row) => row.balance > 0.5);
    const lost = atStart.filter((row) => (endBalances.get(row.clientId) ?? 0) <= 0.5);
    const startAum = atStart.reduce((sum, row) => sum + row.balance, 0);
    const withdrawals = kpis.months.filter((month) => month.month.startsWith(`${year}-`)).reduce((sum, month) => sum + month.withdrawals, 0);
    return {
      year,
      clientsAtStart: atStart.length,
      lost: lost.length,
      churn: atStart.length > 0 ? lost.length / atStart.length : undefined,
      withdrawnOverStart: startAum > 0 ? withdrawals / startAum : undefined
    };
  }).reverse();

  // 4. Condiciones especiales.
  const specialConditions = clientIds.map((clientId) => {
    const conditions: string[] = [];
    const rate = getCommissionRate(clientId, commissionRates);
    const defaultRate = getDefaultCommissionRate(clientId);
    if (rate === null) conditions.push('Sin comisión');
    else if (rate !== defaultRate) conditions.push(`Comisión del ${String(Math.round(rate * 10_000) / 100).replace('.', ',')} %`);
    // Los meses con aportaciones o retiradas a rentabilidad propia (entrada a mitad de mes) siempre son distintos
    // a proposito: no cuentan. Es condicion especial si en la mayoria de los demas meses lleva otra rentabilidad.
    const ownReturnMonths = new Set(Object.entries(movementsByClient[clientId] ?? {})
      .filter(([, item]) => item.incrementReturnPct !== undefined || item.decrementReturnPct !== undefined)
      .map(([iso]) => iso.slice(0, 7)));
    const history = Object.entries(monthlyHistoryByClient[clientId] ?? {})
      .filter(([month, entry]) => normalizeMonthlyReturnPct(entry?.returnPct) !== undefined && !ownReturnMonths.has(month));
    const different = history.filter(([month, entry]) => {
      const general = getDominantMonthlyReturn(clientIds.map((id) => monthlyHistoryByClient[id]?.[month]?.returnPct));
      return general !== undefined && Math.abs(normalizeMonthlyReturnPct(entry.returnPct)! - general) > 0.001;
    });
    if (history.length >= 2 && different.length / history.length >= 0.5) conditions.push('Rentabilidad distinta a la general');
    const fixed = recurring.rules.filter((rule) => rule.clientId === clientId && !rule.removedAt && rule.active);
    if (fixed.length > 0) conditions.push(`Retirada fija de ${fixed.map((rule) => `${String(rule.amount).replace('.', ',')} € el día ${rule.day}`).join(' y ')}`);
    return { clientId, conditions };
  }).filter((item) => item.conditions.length > 0);

  // Rentabilidad frente a riesgo con cierres mensuales (sin tipo libre de riesgo).
  const returns = kpis.months.filter((month) => month.returnPct !== undefined).map((month) => month.returnPct!);
  let sharpe: number | undefined;
  let sortino: number | undefined;
  if (returns.length >= 3) {
    const average = mean(returns);
    const deviation = Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1));
    if (deviation > 0) sharpe = (average / deviation) * Math.sqrt(12);
    const downside = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / returns.length);
    if (downside > 0) sortino = (average / downside) * Math.sqrt(12);
  }

  // 5. Lista de espera (interes de ampliacion de la ficha).
  const waitlist = clientIds.map((clientId) => ({
    clientId,
    amount: parseNumberEs(contacts[clientId]?.waitlistAmount ?? '') ?? 0,
    note: contacts[clientId]?.waitlistNote?.trim() ?? ''
  })).filter((item) => item.amount > 0).sort((left, right) => right.amount - left.amount);

  // Origen de los clientes activos.
  const origins = [...CLIENT_ORIGINS, 'Sin indicar'].map((origin) => {
    const list = active.filter((client) => (contacts[client.clientId]?.origin?.trim() || 'Sin indicar') === origin);
    return { origin, count: list.length, aum: list.reduce((sum, client) => sum + client.balance, 0) };
  }).filter((item) => item.count > 0);

  return {
    revenue: {
      byYear: revenueByYear,
      last12: commissionsLast12,
      takeOnWithdrawnProfit: details.profitWithdrawn > 0 ? kpis.commissionsGenerated / details.profitWithdrawn : undefined,
      takeOnTotalProfit: kpis.totalProfit > 0 ? kpis.commissionsGenerated / kpis.totalProfit : undefined,
      perClientLast12: active.length > 0 ? commissionsLast12 / active.length : undefined,
      latentPerClient: active.length > 0 ? kpis.commissionsIfAllWithdraw / active.length : undefined,
      fixedForecast12,
      paceEstimate: annualWithdrawalRate !== undefined ? kpis.commissionsIfAllWithdraw * Math.min(1, annualWithdrawalRate) : undefined
    },
    growthByYear,
    newClientsByMonth,
    averageFirstContribution: firstContributions.length > 0 ? mean(firstContributions) : undefined,
    recontribution: {
      share: contributionDates.length > 0 ? withSecond.length / contributionDates.filter((list) => list.length > 0).length : undefined,
      clients: withSecond.length,
      averageDaysToSecond: withSecond.length > 0 ? mean(withSecond.map((list) => daysBetween(list[0], list[1]))) : undefined
    },
    retentionByYear,
    annualWithdrawalRate,
    specialConditions,
    sharpe,
    sortino,
    waitlist,
    waitlistTotal: waitlist.reduce((sum, item) => sum + item.amount, 0),
    origins
  };
};

export type BuyerKpis = ReturnType<typeof buildBuyerKpis>;
