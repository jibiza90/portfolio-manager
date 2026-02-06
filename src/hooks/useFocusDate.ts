import { usePortfolioStore } from '../store/portfolio';
import { YEAR, YEAR_DAYS, findFocusDate } from '../utils/dates';

const isCurrentYear = (iso: string) => iso.startsWith(`${YEAR}-`);

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const fromFinals = (() => {
      for (let i = YEAR_DAYS.length - 1; i >= 0; i -= 1) {
        const iso = YEAR_DAYS[i].iso;
        const value = state.finalByDay[iso];
        if (value !== undefined && !Number.isNaN(value) && isCurrentYear(iso)) {
          return iso;
        }
      }
      return null;
    })();

    const fromDailyRows = (() => {
      const rows = state.snapshot.dailyRows || [];
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i];
        if (r.final !== undefined && !Number.isNaN(r.final) && isCurrentYear(r.iso)) {
          return r.iso;
        }
      }
      return null;
    })();

    if (fromFinals) return fromFinals;
    if (fromDailyRows) return fromDailyRows;

    return findFocusDate();
  });
