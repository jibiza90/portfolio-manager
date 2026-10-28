import type { Movement } from '../types';
import { getWithdrawalCommissions } from './commissions';

// Calculo del "Informe anual de rendimientos" a partir de los datos PUBLICADOS del cliente
// (los mismos que ve en su area): cierres mensuales y movimientos de capital.

export type AnnualMode = 'withdrawn' | 'all';
export type WithdrawnMethod = 'proportional' | 'capital-first';

export interface AnnualMonthInput {
  month: string; // etiqueta publicada, p. ej. "Mar 2026"
  profit: number;
  profitPct: number; // en %
  endBalance: number;
}

export interface AnnualMovementInput {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
  returnPct?: number; // rentabilidad del mes hasta la retirada (decimal), si se registro
}

export interface AnnualReportInput {
  months: AnnualMonthInput[];
  movements: AnnualMovementInput[];
  openingCapital: number;
  commissions: { rate: number | null; paidWithdrawalIsos: string[] } | null;
  year: number;
  mode: AnnualMode;
  method: WithdrawnMethod;
}

export interface AnnualWithdrawalRow {
  iso: string;
  amount: number;
  capital: number;
  gain: number;
}

export interface AnnualMonthRow {
  key: string;
  label: string;
  profit: number;
  returnPct: number;
}

export interface AnnualCommissionRow {
  iso: string;
  withdrawal: number;
  commission: number;
}

export interface AnnualReport {
  year: number;
  mode: AnnualMode;
  method: WithdrawnMethod;
  provisional: boolean;
  firstKey: string | null;
  lastKey: string | null;
  startBalance: number;
  endBalance: number;
  increments: number;
  decrements: number;
  headline: number;
  withdrawals: AnnualWithdrawalRow[];
  monthRows: AnnualMonthRow[];
  commissions: AnnualCommissionRow[];
  commissionsTotal: number;
  commissionsAvailable: boolean;
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12
};

export const monthLabelToKey = (label: string) => {
  if (/^\d{4}-\d{2}$/.test(label)) return label;
  const parts = label.trim().toLowerCase().replace('.', '').split(/\s+/);
  const month = MONTHS[parts[0]];
  const year = Number(parts[parts.length - 1]);
  return month && Number.isFinite(year) ? `${year}-${String(month).padStart(2, '0')}` : '';
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export const availableReportYears = (months: AnnualMonthInput[]) =>
  [...new Set(months.map((month) => monthLabelToKey(month.month)).filter(Boolean).map((key) => Number(key.slice(0, 4))))].sort((a, b) => b - a);

export const buildAnnualReport = (input: AnnualReportInput): AnnualReport => {
  const months = input.months
    .map((month) => ({ ...month, key: monthLabelToKey(month.month) }))
    .filter((month) => month.key)
    .sort((a, b) => a.key.localeCompare(b.key));
  const movements = [...input.movements]
    .filter((movement) => movement.amount > 0)
    .sort((a, b) => a.iso.localeCompare(b.iso) || (a.type === b.type ? 0 : a.type === 'increment' ? -1 : 1));
  const yearPrefix = String(input.year);
  const yearMonths = months.filter((month) => month.key.startsWith(yearPrefix));
  const before = months.filter((month) => month.key < `${yearPrefix}-01`);

  // Beneficio contenido en cada retirada, recorriendo todo el historial (el coste se arrastra entre años).
  const allWithdrawals: AnnualWithdrawalRow[] = [];
  if (input.method === 'proportional') {
    // Coste medio: cada retirada se lleva la parte de capital y de beneficio que tiene la cartera en ese momento.
    let cost = Math.max(0, input.openingCapital);
    let value = 0;
    months.forEach((month, index) => {
      const monthMoves = movements.filter((movement) => movement.iso.slice(0, 7) === month.key);
      const inflow = monthMoves.filter((m) => m.type === 'increment').reduce((s, m) => s + m.amount, 0);
      const outflow = monthMoves.filter((m) => m.type === 'decrement').reduce((s, m) => s + m.amount, 0);
      value = index > 0 ? months[index - 1].endBalance : Math.max(0, month.endBalance - month.profit - inflow + outflow);
      monthMoves.forEach((movement) => {
        if (movement.type === 'increment') {
          value += movement.amount;
          cost += movement.amount;
          return;
        }
        // Valor de la cartera el dia de la retirada: lo que habia + la rentabilidad del mes hasta ese dia (si se registro).
        const valueAtDate = value * (1 + (movement.returnPct ?? 0));
        const ratio = valueAtDate > 0 ? Math.min(1, cost / valueAtDate) : 1;
        const capital = movement.amount * ratio;
        allWithdrawals.push({ iso: movement.iso, amount: movement.amount, capital: round2(capital), gain: round2(movement.amount - capital) });
        cost = Math.max(0, cost - capital);
        value = Math.max(0, valueAtDate - movement.amount);
      });
    });
    // Retiradas posteriores al ultimo cierre no forman parte del informe (aun no estan publicadas).
  } else {
    // Primero el capital: hasta recuperar todo lo aportado, lo retirado es capital.
    let capitalLeft = Math.max(0, input.openingCapital);
    movements.forEach((movement) => {
      if (movement.type === 'increment') {
        capitalLeft += movement.amount;
        return;
      }
      const capital = Math.min(movement.amount, capitalLeft);
      capitalLeft -= capital;
      allWithdrawals.push({ iso: movement.iso, amount: movement.amount, capital: round2(capital), gain: round2(movement.amount - capital) });
    });
  }
  const lastKey = yearMonths.length ? yearMonths[yearMonths.length - 1].key : null;
  const withdrawals = allWithdrawals.filter((row) => row.iso.startsWith(yearPrefix) && (!lastKey || row.iso.slice(0, 7) <= lastKey));

  const monthRows: AnnualMonthRow[] = yearMonths.map((month) => ({ key: month.key, label: month.month, profit: month.profit, returnPct: month.profitPct }));

  // Comisiones marcadas como cobradas en retiradas del año, con el mismo calculo que la pantalla de Comisiones.
  const record: Record<string, Movement> = {};
  input.movements.forEach((movement) => {
    const row = record[movement.iso] ?? {};
    if (movement.type === 'increment') row.increment = (row.increment ?? 0) + movement.amount;
    else row.decrement = (row.decrement ?? 0) + movement.amount;
    record[movement.iso] = row;
  });
  const paid = new Set(input.commissions?.paidWithdrawalIsos ?? []);
  const commissions = input.commissions
    ? getWithdrawalCommissions(record, input.commissions.rate)
      .filter((row) => row.iso.startsWith(yearPrefix) && paid.has(row.iso) && row.commission > 0.005)
      .map((row) => ({ iso: row.iso, withdrawal: row.amount, commission: round2(row.commission) }))
    : [];

  const inYear = (movement: AnnualMovementInput) => movement.iso.startsWith(yearPrefix) && (!lastKey || movement.iso.slice(0, 7) <= lastKey);
  const headline = input.mode === 'all'
    ? round2(monthRows.reduce((sum, row) => sum + row.profit, 0))
    : round2(withdrawals.reduce((sum, row) => sum + row.gain, 0));

  return {
    year: input.year,
    mode: input.mode,
    method: input.method,
    provisional: !yearMonths.some((month) => month.key === `${yearPrefix}-12`),
    firstKey: yearMonths.length ? yearMonths[0].key : null,
    lastKey,
    startBalance: before.length ? before[before.length - 1].endBalance : 0,
    endBalance: yearMonths.length ? yearMonths[yearMonths.length - 1].endBalance : 0,
    increments: round2(movements.filter((m) => m.type === 'increment' && inYear(m)).reduce((s, m) => s + m.amount, 0)),
    decrements: round2(movements.filter((m) => m.type === 'decrement' && inYear(m)).reduce((s, m) => s + m.amount, 0)),
    headline,
    withdrawals,
    monthRows,
    commissions,
    commissionsTotal: round2(commissions.reduce((sum, row) => sum + row.commission, 0)),
    commissionsAvailable: input.commissions !== null
  };
};
