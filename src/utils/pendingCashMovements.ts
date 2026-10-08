import type { Movement } from '../types';

export interface PublishedCashMovement {
  iso: string;
  type: string;
  amount: number;
}

export interface PendingCashMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

const movementKey = (iso: string, type: PendingCashMovement['type']) => `${iso}:${type}`;

export const buildPendingCashMovements = (
  currentMovements: Record<string, Movement> = {},
  publishedMovements: PublishedCashMovement[] = []
): PendingCashMovement[] => {
  const publishedAmounts = new Map<string, number>();
  publishedMovements.forEach((movement) => {
    if (movement.type !== 'increment' && movement.type !== 'decrement') return;
    const amount = Number.isFinite(movement.amount) ? Math.max(0, movement.amount) : 0;
    const key = movementKey(movement.iso, movement.type);
    publishedAmounts.set(key, (publishedAmounts.get(key) ?? 0) + amount);
  });

  const pending: PendingCashMovement[] = [];
  Object.entries(currentMovements)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([iso, movement]) => {
      const currentIncrement = Math.max(0, movement.increment ?? 0);
      const publishedIncrement = publishedAmounts.get(movementKey(iso, 'increment')) ?? 0;
      if (currentIncrement > publishedIncrement) {
        pending.push({ iso, type: 'increment', amount: currentIncrement - publishedIncrement });
      }

      const currentDecrement = Math.max(0, movement.decrement ?? 0);
      const publishedDecrement = publishedAmounts.get(movementKey(iso, 'decrement')) ?? 0;
      if (currentDecrement > publishedDecrement) {
        pending.push({ iso, type: 'decrement', amount: currentDecrement - publishedDecrement });
      }
    });

  return pending;
};
