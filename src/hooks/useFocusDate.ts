import { usePortfolioStore } from '../store/portfolio';
import { YEAR, YEAR_DAYS, findFocusDate } from '../utils/dates';

const sortIsoDates = (dates: string[]) => [...dates].sort((a, b) => (a > b ? 1 : -1));

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const finalDays = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .filter((iso) => iso.startsWith(`${YEAR}-`));

    if (finalDays.length) {
      const ordered = sortIsoDates(finalDays);
      return ordered[ordered.length - 1];
    }

    return findFocusDate();
  });
