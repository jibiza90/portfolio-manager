import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate } from '../utils/dates';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    console.log('[useFocusDate] Raw finalByDay:', state.finalByDay);
    const ordered = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .sort((a, b) => (a > b ? 1 : -1));
    
    console.log('[useFocusDate] Ordered dates:', ordered);
    
    if (ordered.length > 0) {
      const lastDate = ordered[ordered.length - 1];
      console.log('[useFocusDate] Returning last date:', lastDate);
      return lastDate;
    }

    const fallback = findFocusDate();
    console.log('[useFocusDate] No finals, returning fallback:', fallback);
    return fallback;
  });
