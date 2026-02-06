import dayjs from 'dayjs';
import 'dayjs/locale/es';

export interface CalendarDay {
  iso: string;
  label: string;
  weekday: string;
  isWeekend: boolean;
}

export const START_YEAR = 2026;
export const YEAR = dayjs().year();
export const END_YEAR = YEAR + 3;

dayjs.locale('es');

export const YEAR_DAYS: CalendarDay[] = (() => {
  const start = dayjs(`${START_YEAR}-01-01`);
  const end = dayjs(`${END_YEAR}-12-31`);
  const days: CalendarDay[] = [];
  const totalDays = end.diff(start, 'day') + 1;

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
  const start = dayjs(`${START_YEAR}-01-01`);
  const end = dayjs(`${END_YEAR}-12-31`);
  let target = today;

  if (target.isBefore(start)) {
    target = start;
  }
  if (target.isAfter(end)) {
    target = end;
  }

  return target.format('YYYY-MM-DD');
};
