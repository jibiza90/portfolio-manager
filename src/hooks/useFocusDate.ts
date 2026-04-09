import dayjs from 'dayjs';
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

    const monthlyHistoryDates = Object.values(state.monthlyHistoryByClient ?? {})
      .flatMap((months) =>
        Object.keys(months)
          .map((month) => dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
      )
      .sort((a, b) => (a > b ? 1 : -1));

    const lastFinalDate = finalDates[finalDates.length - 1];
    const lastMovementDate = movementDates[movementDates.length - 1];
    const lastMonthlyHistoryDate = monthlyHistoryDates[monthlyHistoryDates.length - 1];
    const allDates = [lastFinalDate, lastMovementDate, lastMonthlyHistoryDate]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => (a > b ? 1 : -1));
    const lastWrittenDate = allDates[allDates.length - 1];

    if (lastWrittenDate) {
      return lastWrittenDate;
    }

    return findFocusDate();
  });
