import { expect, test } from '@playwright/test';
import {
  getMonthWithdrawals,
  getOccurrencesForMonth,
  getPendingOccurrences,
  isHoliday,
  scheduledDate,
  type RecurringWithdrawal,
  type RecurringWithdrawalsState
} from '../src/utils/recurringWithdrawals';

const rule = (overrides: Partial<RecurringWithdrawal> = {}): RecurringWithdrawal => ({
  id: 'r1',
  clientId: 'client-030',
  amount: 500,
  day: 15,
  active: true,
  startMonth: '2026-10',
  createdAt: 0,
  updatedAt: 0,
  ...overrides
});
const state = (rules: RecurringWithdrawal[], checks: RecurringWithdrawalsState['checks'] = {}): RecurringWithdrawalsState => ({ rules, checks });

test('weekends and Catalan holidays move the day to the next working day', () => {
  expect(scheduledDate(15, '2026-10')).toBe('2026-10-15'); // jueves
  expect(scheduledDate(15, '2026-11')).toBe('2026-11-16'); // domingo -> lunes
  expect(scheduledDate(14, '2026-11')).toBe('2026-11-16'); // sabado -> lunes
  expect(scheduledDate(8, '2026-12')).toBe('2026-12-09'); // Inmaculada (martes) -> miercoles
  expect(scheduledDate(25, '2026-12')).toBe('2026-12-28'); // Navidad, San Esteban y domingo -> lunes
  expect(scheduledDate(31, '2026-11')).toBe('2026-11-30'); // mes de 30 dias
  expect(isHoliday('2027-03-26')).toBe(true); // Viernes Santo
  expect(isHoliday('2027-03-29')).toBe(true); // Lunes de Pascua
  expect(isHoliday('2026-09-11')).toBe(true); // Diada
  expect(isHoliday('2026-09-10')).toBe(false);
});

test('a fixed withdrawal is upcoming, due today and overdue the next day when not recorded or ticked', () => {
  const s = state([rule()]);
  const status = (today: string) => getOccurrencesForMonth(s, {}, '2026-11', today)[0].status;
  expect(status('2026-11-10')).toBe('upcoming');
  expect(status('2026-11-16')).toBe('today');
  expect(status('2026-11-17')).toBe('overdue');
});

test('it is done when the withdrawal is in the client record, amber when the amount differs, done when ticked', () => {
  const s = state([rule()]);
  const done = getOccurrencesForMonth(s, { 'client-030': { '2026-11-13': { decrement: 500 } } }, '2026-11', '2026-11-20')[0];
  expect(done.status).toBe('done');
  expect(done.matched).toEqual({ iso: '2026-11-13', amount: 500 });

  const different = getOccurrencesForMonth(s, { 'client-030': { '2026-11-16': { decrement: 400 } } }, '2026-11', '2026-11-20')[0];
  expect(different.status).toBe('different');

  // Una retirada de otro cliente o de mucho antes no cuenta.
  const elsewhere = { 'client-031': { '2026-11-16': { decrement: 500 } }, 'client-030': { '2026-11-02': { decrement: 500 } } };
  expect(getOccurrencesForMonth(s, elsewhere, '2026-11', '2026-11-20')[0].status).toBe('overdue');

  const ticked = state([rule()], { 'r1|2026-11': { checkedAt: 1 } });
  expect(getOccurrencesForMonth(ticked, {}, '2026-11', '2026-11-20')[0].status).toBe('done');
  expect(getOccurrencesForMonth(ticked, { 'client-030': { '2026-11-16': { decrement: 400 } } }, '2026-11', '2026-11-20')[0].status).toBe('done');
});

test('pending list keeps overdue months until they are recorded or ticked; paused and removed ones do not count', () => {
  const s = state([rule(), rule({ id: 'r2', clientId: 'client-031', active: false }), rule({ id: 'r3', clientId: 'client-032', removedAt: 5 })]);
  const pending = getPendingOccurrences(s, { 'client-030': { '2026-10-15': { decrement: 500 } } }, '2026-12-20');
  expect(pending.map((item) => `${item.rule.id} ${item.month} ${item.status}`)).toEqual(['r1 2026-11 overdue', 'r1 2026-12 overdue']);
  expect(getPendingOccurrences(s, {}, '2026-10-14')).toEqual([]);
});

test('two fixed withdrawals of the same client each take their own record entry', () => {
  const s = state([rule({ id: 'a', amount: 500, day: 5 }), rule({ id: 'b', amount: 300, day: 20 })]);
  const movements = { 'client-030': { '2026-10-05': { decrement: 500 }, '2026-10-20': { decrement: 300 } } };
  const result = getOccurrencesForMonth(s, movements, '2026-10', '2026-10-31');
  expect(result.map((item) => `${item.rule.id} ${item.status} ${item.matched?.iso}`)).toEqual(['a done 2026-10-05', 'b done 2026-10-20']);
});

test('month list shows every recorded withdrawal of every client', () => {
  const list = getMonthWithdrawals({
    'client-030': { '2026-11-16': { decrement: 500 }, '2026-11-03': { increment: 1000 } },
    'client-031': { '2026-11-02': { decrement: 2000 }, '2026-10-30': { decrement: 100 } },
    'client-001': { '2026-11-05': { decrement: 50 } }
  }, '2026-11', (clientId) => clientId !== 'client-001');
  expect(list).toEqual([
    { clientId: 'client-031', iso: '2026-11-02', amount: 2000 },
    { clientId: 'client-030', iso: '2026-11-16', amount: 500 }
  ]);
});
