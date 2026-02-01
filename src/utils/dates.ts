import dayjs from 'dayjs';
import 'dayjs/locale/es';

export interface CalendarDay {
  iso: string;
  label: string;
  weekday: string;
  isWeekend: boolean;
}

export const YEAR = 2026;

dayjs.locale('es');

export const YEAR_DAYS: CalendarDay[] = (() => {
  const start = dayjs(`${YEAR}-01-01`);
  const days: CalendarDay[] = [];

  const totalDays = dayjs(`${YEAR}-12-31`).diff(start, 'day') + 1;

  for (let i = 0; i < totalDays; i += 1) {
    const date = start.add(i, 'day');
    days.push({
      iso: date.format('YYYY-MM-DD'),
      label: date.format('DD MMM'),
      weekday: date.format('ddd'),
      isWeekend: [6, 0].includes(date.day())
    });
  }

  return days;
})();

export const findFocusDate = (): string => {
  const today = dayjs();
  const startOfTodayYear = today.startOf('year');
  const dayOffset = today.diff(startOfTodayYear, 'day');
  const startOfTargetYear = dayjs(`${YEAR}-01-01`);
  const endOfTargetYear = dayjs(`${YEAR}-12-31`);
  let target = startOfTargetYear.add(dayOffset, 'day');

  if (target.isBefore(startOfTargetYear)) {
    target = startOfTargetYear;
  }
  if (target.isAfter(endOfTargetYear)) {
    target = endOfTargetYear;
  }

  return target.format('YYYY-MM-DD');
};
