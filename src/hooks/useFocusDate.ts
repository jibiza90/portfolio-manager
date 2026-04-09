import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate } from '../utils/dates';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    const finalDates = Object.entries(state.finalByDay)
      .filter(([, value]) => value !== undefined && !Number.isNaN(value))
      .map(([iso]) => iso)
      .sort((a, b) => (a > b ? 1 : -1));

    const movementDates = Object.values(state.movementsByClient)
      .flatMap((rows) => Object.keys(rows))
      .sort((a, b) => (a > b ? 1 : -1));

    const lastFinalDate = finalDates[finalDates.length - 1];
    const lastMovementDate = movementDates[movementDates.length - 1];
    const lastWrittenDate =
      lastFinalDate && lastMovementDate
        ? (lastFinalDate > lastMovementDate ? lastFinalDate : lastMovementDate)
        : lastFinalDate ?? lastMovementDate;

    if (lastWrittenDate) {
      return lastWrittenDate;
    }

    return findFocusDate();
  });
