import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate, YEAR_DAYS } from '../utils/dates';

const hasMeaningfulData = (row: { increment?: number; decrement?: number }) =>
  row.increment !== undefined || row.decrement !== undefined;

export const useClientFocusDate = (clientId: string) =>
  usePortfolioStore((state) => {
    const rows = state.snapshot.clientRowsById[clientId] ?? [];

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (hasMeaningfulData(rows[index])) {
        return rows[index].iso;
      }
    }

    if (rows.length > 0) {
      return findFocusDate();
    }

    return YEAR_DAYS[0].iso;
  });
