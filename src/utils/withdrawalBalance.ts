import type { ClientDayRow } from '../types';

export const getAvailableBalanceBeforeWithdrawal = (rows: ClientDayRow[], iso: string) => {
  const rowIndex = rows.findIndex((row) => row.iso === iso);
  if (rowIndex < 0) return 0;

  const currentRow = rows[rowIndex];
  if (currentRow.baseBalance !== undefined) {
    // baseBalance already includes the current withdrawal, so add it back when editing it.
    return Math.max(0, currentRow.baseBalance + (currentRow.decrement ?? 0));
  }

  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const previousBalance = rows[index].finalBalance ?? rows[index].baseBalance;
    if (previousBalance !== undefined) {
      return Math.max(0, previousBalance + (currentRow.increment ?? 0));
    }
  }

  return Math.max(0, currentRow.increment ?? 0);
};
