import { usePortfolioStore } from '../store/portfolio';
import { YEAR, YEAR_DAYS, findFocusDate } from '../utils/dates';

const sortIsoDates = (dates: string[]) => [...dates].sort((a, b) => (a > b ? 1 : -1));
const isCurrentYear = (iso: string) => iso.startsWith(`${YEAR}-`);

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const finalDays = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .filter(isCurrentYear);

    const fromFinals = (() => {
      if (finalDays.length) {
        const ordered = sortIsoDates(finalDays);
        return ordered[ordered.length - 1];
      }
      return null;
    })();

    const fromDailyRows = (() => {
      const candidates = (state.snapshot.dailyRows || [])
        .filter((r) => r.final !== undefined && !Number.isNaN(r.final) && isCurrentYear(r.iso))
        .map((r) => r.iso);
      if (candidates.length === 0) return null;
      const ordered = sortIsoDates(candidates);
      return ordered[ordered.length - 1];
    })();

    const fromMovements = (() => {
      const days = new Set<string>();
      Object.values(state.movementsByClient || {}).forEach((byDay) => {
        Object.entries(byDay || {}).forEach(([iso, mov]) => {
          if (!isCurrentYear(iso)) return;
          if ((mov.increment ?? 0) !== 0 || (mov.decrement ?? 0) !== 0) days.add(iso);
        });
      });
      if (days.size === 0) return null;
      const ordered = sortIsoDates(Array.from(days));
      return ordered[ordered.length - 1];
    })();

    if (fromFinals) return fromFinals;
    if (fromDailyRows) return fromDailyRows;
    if (fromMovements) return fromMovements;

    return findFocusDate();
  });
