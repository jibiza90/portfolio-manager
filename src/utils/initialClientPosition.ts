import type { Movement, MonthlyHistoryEntry } from '../types';

export interface InitialClientPosition {
  iso: string;
  amount: number;
  totalIncrements: number;
  totalDecrements: number;
  movements: Array<{
    iso: string;
    increment?: number;
    decrement?: number;
    balance: number;
  }>;
}

const hasValue = (value?: number) => value !== undefined && Number.isFinite(value);
const hasMeaningfulValue = (value?: number) => hasValue(value) && Math.abs(value ?? 0) > 0.000001;

export const hasClosedClientPeriod = (history: Record<string, MonthlyHistoryEntry> = {}) =>
  Object.values(history).some((entry) => hasValue(entry.finalBalance) || hasValue(entry.returnPct));

export const getInitialClientPosition = (
  movements: Record<string, Movement> = {},
  history: Record<string, MonthlyHistoryEntry> = {}
): InitialClientPosition | null => {
  if (hasClosedClientPeriod(history)) return null;

  const entries = Object.entries(movements).sort(([left], [right]) => left.localeCompare(right));
  const hasManualResult = entries.some(([, movement]) =>
    hasMeaningfulValue(movement.manualProfit) ||
    hasMeaningfulValue(movement.manualProfitPct)
  );
  if (hasManualResult) return null;

  let balance = 0;
  let totalIncrements = 0;
  let totalDecrements = 0;
  const positionMovements: InitialClientPosition['movements'] = [];

  entries.forEach(([iso, movement]) => {
    const increment = Math.max(0, movement.increment ?? 0);
    const decrement = Math.max(0, movement.decrement ?? 0);
    if (increment <= 0 && decrement <= 0) return;
    totalIncrements += increment;
    totalDecrements += decrement;
    balance += increment - decrement;
    positionMovements.push({
      iso,
      ...(increment > 0 ? { increment } : {}),
      ...(decrement > 0 ? { decrement } : {}),
      balance
    });
  });

  const firstContribution = positionMovements.find((movement) => (movement.increment ?? 0) > 0);
  if (!firstContribution || totalIncrements <= 0 || balance <= 0) return null;

  return {
    iso: firstContribution.iso,
    amount: balance,
    totalIncrements,
    totalDecrements,
    movements: positionMovements
  };
};

export const hasAnyClientContribution = (movements: Record<string, Movement> = {}) =>
  Object.values(movements).some((movement) => (movement.increment ?? 0) > 0);
