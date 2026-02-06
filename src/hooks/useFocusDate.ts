import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate } from '../utils/dates';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const ordered = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .sort((a, b) => (a > b ? 1 : -1));
    
    console.log('[useFocusDate] finalByDay entries:', Object.entries(state.finalByDay));
    console.log('[useFocusDate] ordered dates:', ordered);
    
    if (ordered.length > 0) {
      const lastDate = ordered[ordered.length - 1];
      console.log('[useFocusDate] returning last date:', lastDate);
      return lastDate;
    }

    const fallback = findFocusDate();
    console.log('[useFocusDate] no finals found, returning fallback:', fallback);
    return fallback;
  });
