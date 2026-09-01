import { usePortfolioStore } from '../store/portfolio';
import { findFocusDate } from '../utils/dates';
import { getLatestPortfolioFocusDate } from '../utils/focusDate';

export const useFocusDate = () =>
  usePortfolioStore((state) => {
    return getLatestPortfolioFocusDate({
      finalByDay: state.finalByDay,
      movementsByClient: state.movementsByClient,
      monthlyHistoryByClient: state.monthlyHistoryByClient ?? {},
      dailyRows: state.snapshot.dailyRows,
      clientRowsById: state.snapshot.clientRowsById
    }) ?? findFocusDate();
  });
