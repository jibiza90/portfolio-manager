import { usePortfolioStore } from '../store/portfolio';
import { YEAR_DAYS, findFocusDate } from '../utils/dates';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const fromFinals = (() => {
      const ordered = Object.entries(state.finalByDay)
        .filter(([, value]) => value !== undefined && !Number.isNaN(value))
        .map(([iso]) => iso)
        .sort((a, b) => (a > b ? 1 : -1));
      if (ordered.length) {
        return ordered[ordered.length - 1];
      }
      return null;
    })();

    const fromDailyRows = (() => {
      const rows = state.snapshot.dailyRows || [];
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i];
        if (r.final !== undefined && !Number.isNaN(r.final)) {
          return r.iso;
        }
      }
      return null;
    })();

    if (fromFinals) return fromFinals;
    if (fromDailyRows) return fromDailyRows;

    return findFocusDate();
  });
