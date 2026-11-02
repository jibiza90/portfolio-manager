import type { Movement, PortfolioSnapshot } from '../types';
import { getCommissionRate, getWithdrawalCommissions } from './commissions';
import type { FundMonth } from './fundKpis';

// Datos para una auditoria: cuadres, movimiento del patrimonio, libros y excepciones.
// Solo lee los datos guardados; no cambia nada.

const lastDayIso = (month: string) => `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;

export interface ClientBalanceAt {
  clientId: string;
  contributed: number;
  withdrawn: number;
  profit: number;
  balance: number;
}

// Saldo de cada cliente a final de un mes (mismo criterio que la ficha: ultimo saldo, aunque sea 0).
export const clientBalancesAt = (snapshot: PortfolioSnapshot, clientIds: string[], month: string): ClientBalanceAt[] => {
  const end = lastDayIso(month);
  return clientIds.map((clientId) => {
    const rows = (snapshot.clientRowsById[clientId] ?? []).filter((row) => row.iso <= end);
    const reversed = [...rows].reverse();
    const last = reversed.find((row) => row.finalBalance !== undefined || row.baseBalance !== undefined);
    return {
      clientId,
      contributed: rows.reduce((sum, row) => sum + (row.increment ?? 0), 0),
      withdrawn: rows.reduce((sum, row) => sum + (row.decrement ?? 0), 0),
      profit: reversed.find((row) => row.cumulativeProfit !== undefined)?.cumulativeProfit ?? 0,
      balance: Math.max(0, last?.finalBalance ?? last?.baseBalance ?? 0)
    };
  }).filter((row) => row.contributed > 0 || row.balance > 0);
};

// Patrimonio de la cartera general a final de mes (ultimo saldo final apuntado hasta ese dia).
const portfolioBalanceAt = (snapshot: PortfolioSnapshot, month: string) => {
  const end = lastDayIso(month);
  let balance: number | undefined;
  snapshot.dailyRows.forEach((row) => {
    if (row.iso <= end && row.final !== undefined) balance = row.final;
  });
  return balance;
};

export interface ReconciliationRow {
  month: string;
  clientsTotal: number;
  portfolioTotal?: number;
  difference?: number;
  activeClients: number;
}

// Cuadre: suma de los saldos de los clientes frente al patrimonio de la cartera, a final de cada mes.
export const buildReconciliation = (snapshot: PortfolioSnapshot, clientIds: string[], months: string[]): ReconciliationRow[] =>
  months.map((month) => {
    const balances = clientBalancesAt(snapshot, clientIds, month);
    const clientsTotal = balances.reduce((sum, row) => sum + row.balance, 0);
    const portfolioTotal = portfolioBalanceAt(snapshot, month);
    return {
      month,
      clientsTotal,
      portfolioTotal,
      difference: portfolioTotal !== undefined ? clientsTotal - portfolioTotal : undefined,
      activeClients: balances.filter((row) => row.balance > 0.5).length
    };
  });

export interface RollForwardRow {
  period: string;
  opening: number;
  contributions: number;
  withdrawals: number;
  profit: number;
  closing: number;
  difference: number;
}

// Movimiento del patrimonio: inicial + aportaciones - retiradas + beneficio = final.
export const buildRollForward = (months: FundMonth[]) => {
  const withBalance = months.filter((month) => month.endBalance !== undefined);
  const monthly: RollForwardRow[] = withBalance.map((month, position) => {
    const opening = position > 0 ? withBalance[position - 1].endBalance! : 0;
    const closing = month.endBalance!;
    return {
      period: month.month,
      opening,
      contributions: month.contributions,
      withdrawals: month.withdrawals,
      profit: month.profit,
      closing,
      difference: opening + month.contributions - month.withdrawals + month.profit - closing
    };
  });
  const years = [...new Set(monthly.map((row) => row.period.slice(0, 4)))].sort();
  const yearly: RollForwardRow[] = years.map((year) => {
    const list = monthly.filter((row) => row.period.startsWith(`${year}-`));
    const opening = list[0].opening;
    const closing = list[list.length - 1].closing;
    const contributions = list.reduce((sum, row) => sum + row.contributions, 0);
    const withdrawals = list.reduce((sum, row) => sum + row.withdrawals, 0);
    const profit = list.reduce((sum, row) => sum + row.profit, 0);
    return { period: year, opening, contributions, withdrawals, profit, closing, difference: opening + contributions - withdrawals + profit - closing };
  });
  return { monthly, yearly };
};

// Por debajo de 1 € se considera redondeo.
export const isBalanced = (difference?: number) => difference === undefined || Math.abs(difference) < 1;

const previousMonth = (month: string) => {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// Que clientes explican la diferencia de un mes: su saldo cambia sin que lo expliquen sus aportaciones,
// retiradas y beneficio (por ejemplo, dinero que entro sin apuntarse como aportacion).
export const explainRollForwardDifference = (snapshot: PortfolioSnapshot, clientIds: string[], month: string) => {
  const before = new Map(clientBalancesAt(snapshot, clientIds, previousMonth(month)).map((row) => [row.clientId, row]));
  return clientBalancesAt(snapshot, clientIds, month).map((row) => {
    const prev = before.get(row.clientId);
    const difference = (prev?.balance ?? 0) + (row.contributed - (prev?.contributed ?? 0)) - (row.withdrawn - (prev?.withdrawn ?? 0)) + (row.profit - (prev?.profit ?? 0)) - row.balance;
    return { clientId: row.clientId, difference };
  }).filter((item) => !isBalanced(item.difference));
};

export interface LedgerRow {
  iso: string;
  clientId: string;
  type: 'Aportación' | 'Retirada';
  amount: number;
  ownReturnPct?: number;
}

// Libro de movimientos: todas las aportaciones y retiradas apuntadas.
export const buildMovementLedger = (movementsByClient: Record<string, Record<string, Movement>>, clientIds: string[]): LedgerRow[] =>
  clientIds.flatMap((clientId) => Object.entries(movementsByClient[clientId] ?? {}).flatMap(([iso, item]) => {
    const rows: LedgerRow[] = [];
    if ((item.increment ?? 0) > 0) rows.push({ iso, clientId, type: 'Aportación', amount: item.increment!, ownReturnPct: item.incrementReturnPct });
    if ((item.decrement ?? 0) > 0) rows.push({ iso, clientId, type: 'Retirada', amount: item.decrement!, ownReturnPct: item.decrementReturnPct });
    return rows;
  })).sort((left, right) => left.iso.localeCompare(right.iso) || left.clientId.localeCompare(right.clientId));

export interface CommissionLedgerRow {
  iso: string;
  clientId: string;
  withdrawal: number;
  capitalPendingBefore: number;
  base: number;
  rate: number | null;
  commission: number;
  paid: boolean;
}

// Libro de comisiones: cada retirada con su base, porcentaje, comision y si esta cobrada.
export const buildCommissionLedger = (
  movementsByClient: Record<string, Record<string, Movement>>,
  clientIds: string[],
  commissionRates: Record<string, number | null>,
  paidWithdrawals: Record<string, boolean>
): CommissionLedgerRow[] =>
  clientIds.flatMap((clientId) => {
    const rate = getCommissionRate(clientId, commissionRates);
    return getWithdrawalCommissions(movementsByClient[clientId], rate).map((item) => ({
      iso: item.iso,
      clientId,
      withdrawal: item.amount,
      capitalPendingBefore: item.capitalPendingBefore,
      base: item.commissionableAmount,
      rate,
      commission: item.commission,
      paid: Boolean(paidWithdrawals[`${clientId}-${item.iso}`])
    }));
  }).sort((left, right) => left.iso.localeCompare(right.iso));

export interface AuditExceptions {
  ownReturns: Array<{ clientId: string; iso: string; type: string; pct: number }>;
  manualAdjustments: Array<{ clientId: string; iso: string; profit?: number; pct?: number }>;
  missingContact: Array<{ clientId: string; missing: string[] }>;
}

// Excepciones: rentabilidades propias, ajustes manuales y clientes activos sin datos de contacto.
export const buildExceptions = (
  movementsByClient: Record<string, Record<string, Movement>>,
  activeClientIds: string[],
  allClientIds: string[],
  contacts: Record<string, { email?: string; phone?: string } | undefined>
): AuditExceptions => {
  const ownReturns: AuditExceptions['ownReturns'] = [];
  const manualAdjustments: AuditExceptions['manualAdjustments'] = [];
  allClientIds.forEach((clientId) => {
    Object.entries(movementsByClient[clientId] ?? {}).forEach(([iso, item]) => {
      if ((item.increment ?? 0) > 0 && item.incrementReturnPct !== undefined) ownReturns.push({ clientId, iso, type: 'Aportación', pct: item.incrementReturnPct });
      if ((item.decrement ?? 0) > 0 && item.decrementReturnPct !== undefined) ownReturns.push({ clientId, iso, type: 'Retirada', pct: item.decrementReturnPct });
      if (item.manualProfit !== undefined || item.manualProfitPct !== undefined) manualAdjustments.push({ clientId, iso, profit: item.manualProfit, pct: item.manualProfitPct });
    });
  });
  const missingContact = activeClientIds.map((clientId) => {
    const contact = contacts[clientId];
    const missing = [!contact?.email?.trim() ? 'email' : '', !contact?.phone?.trim() ? 'teléfono' : ''].filter(Boolean);
    return { clientId, missing };
  }).filter((item) => item.missing.length > 0);
  const byDate = (left: { iso: string }, right: { iso: string }) => left.iso.localeCompare(right.iso);
  return { ownReturns: ownReturns.sort(byDate), manualAdjustments: manualAdjustments.sort(byDate), missingContact };
};

// CSV para Excel en español: separador ";", coma decimal y BOM para que lea bien los acentos.
const csvCell = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'number' ? String(Math.round(value * 100) / 100).replace('.', ',') : value;
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export const toCsv = (headers: string[], rows: Array<Array<string | number | undefined | null>>) =>
  `﻿${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;

export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
