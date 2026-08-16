import type { Movement, MonthlyHistoryEntry } from '../types';

export interface InitialClientPosition {
  iso: string;
  amount: number;
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
  const contributions = entries.filter(([, movement]) => (movement.increment ?? 0) > 0);
  const hasOtherFinancialMovement = entries.some(([, movement]) =>
    (movement.decrement ?? 0) > 0 ||
    hasMeaningfulValue(movement.manualProfit) ||
    hasMeaningfulValue(movement.manualProfitPct)
  );

  if (contributions.length !== 1 || hasOtherFinancialMovement) return null;

  const [iso, movement] = contributions[0];
  return { iso, amount: movement.increment ?? 0 };
};

export const hasAnyClientContribution = (movements: Record<string, Movement> = {}) =>
  Object.values(movements).some((movement) => (movement.increment ?? 0) > 0);
