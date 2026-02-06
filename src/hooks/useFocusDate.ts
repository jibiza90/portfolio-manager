import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate } from '../utils/dates';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const ordered = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .sort((a, b) => (a > b ? 1 : -1));
    
    if (ordered.length > 0) {
      return ordered[ordered.length - 1];
    }

    return findFocusDate();
  });
