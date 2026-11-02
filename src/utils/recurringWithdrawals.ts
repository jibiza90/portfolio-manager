import type { Movement } from '../types';

// Retiradas fijas: clientes que retiran la misma cantidad cada mes en un dia concreto.
// Solo se LEE el registro de cada cliente para saber si ya esta apuntada; nunca se apunta nada desde aqui.

export interface RecurringWithdrawal {
  id: string;
  clientId: string;
  amount: number;
  // Dia del mes (1-31). Si el mes es mas corto, se usa el ultimo dia.
  day: number;
  note?: string;
  // Pausada: no genera tareas hasta que se reactive.
  active: boolean;
  // Quitada por el admin: no se borra, solo deja de salir.
  removedAt?: number;
  // Primer mes en que cuenta (YYYY-MM).
  startMonth: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecurringWithdrawalsState {
  rules: RecurringWithdrawal[];
  // Ticks del admin: clave `${ruleId}|${YYYY-MM}`.
  checks: Record<string, { checkedAt: number }>;
}

export type RecurringStatus = 'done' | 'different' | 'today' | 'overdue' | 'upcoming';

export interface RecurringOccurrence {
  rule: RecurringWithdrawal;
  month: string;
  scheduledIso: string;
  status: RecurringStatus;
  // Retirada del registro que corresponde a esta fija (si la hay).
  matched?: { iso: string; amount: number };
  checked: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');
export const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromIso = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const addDays = (iso: string, days: number) => {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
};
export const monthOf = (iso: string) => iso.slice(0, 7);
export const addMonths = (month: string, delta: number) => {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

// Solo cuentan los fines de semana (no los festivos).
export const isWorkingDay = (iso: string) => {
  const weekday = fromIso(iso).getDay();
  return weekday !== 0 && weekday !== 6;
};

// Dia en que toca la retirada ese mes: si cae en sabado o domingo, el lunes siguiente.
export const scheduledDate = (day: number, month: string) => {
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  let iso = `${month}-${pad(Math.min(Math.max(1, Math.round(day)), lastDay))}`;
  while (!isWorkingDay(iso)) iso = addDays(iso, 1);
  return iso;
};

// Cuenta como apuntada una retirada del mismo cliente desde unos dias antes del dia fijado hasta final de mes
// (o hasta el dia fijado, si por fin de semana pasa al mes siguiente).
const MATCH_DAYS_BEFORE = 7;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
export const isVisibleRule = (rule: RecurringWithdrawal) => !rule.removedAt;
export const checkKey = (ruleId: string, month: string) => `${ruleId}|${month}`;

export const getOccurrencesForMonth = (
  state: RecurringWithdrawalsState,
  movementsByClient: Record<string, Record<string, Movement>>,
  month: string,
  todayIso: string
): RecurringOccurrence[] => {
  const rules = state.rules.filter((rule) => isVisibleRule(rule) && rule.active && rule.startMonth <= month);
  const used = new Set<string>();
  const withScheduled = rules.map((rule) => ({ rule, scheduledIso: scheduledDate(rule.day, month) }));
  // Primero las que encajan con la cantidad exacta, para que dos fijas del mismo cliente no se pisen.
  const matches = new Map<string, { iso: string; amount: number }>();
  for (const exactPass of [true, false]) {
    withScheduled.forEach(({ rule, scheduledIso }) => {
      if (matches.has(rule.id)) return;
      const from = addDays(scheduledIso, -MATCH_DAYS_BEFORE);
      const monthEnd = `${month}-${pad(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())}`;
      const to = scheduledIso > monthEnd ? scheduledIso : monthEnd;
      const candidates = Object.entries(movementsByClient[rule.clientId] ?? {})
        .filter(([iso, movement]) => iso >= from && iso <= to && (movement.decrement ?? 0) > 0 && !used.has(`${rule.clientId}|${iso}`))
        .sort(([left], [right]) => Math.abs(fromIso(left).getTime() - fromIso(scheduledIso).getTime()) - Math.abs(fromIso(right).getTime() - fromIso(scheduledIso).getTime()));
      const found = candidates.find(([, movement]) => !exactPass || sameAmount(movement.decrement ?? 0, rule.amount));
      if (!found) return;
      used.add(`${rule.clientId}|${found[0]}`);
      matches.set(rule.id, { iso: found[0], amount: found[1].decrement ?? 0 });
    });
  }
  return withScheduled.map(({ rule, scheduledIso }) => {
    const matched = matches.get(rule.id);
    const checked = Boolean(state.checks[checkKey(rule.id, month)]);
    let status: RecurringStatus;
    if (matched && sameAmount(matched.amount, rule.amount)) status = 'done';
    else if (checked) status = 'done';
    else if (matched) status = 'different';
    else if (todayIso < scheduledIso) status = 'upcoming';
    else if (todayIso === scheduledIso) status = 'today';
    else status = 'overdue';
    return { rule, month, scheduledIso, status, matched, checked };
  }).sort((left, right) => left.scheduledIso.localeCompare(right.scheduledIso));
};

// Lo que el admin tiene que mirar: las de hoy, las atrasadas (de este mes o de meses anteriores) y las apuntadas
// con otra cantidad. Siguen saliendo hasta que estan apuntadas o marcadas.
export const getPendingOccurrences = (
  state: RecurringWithdrawalsState,
  movementsByClient: Record<string, Record<string, Movement>>,
  todayIso: string
) => {
  const currentMonth = monthOf(todayIso);
  const firstMonth = state.rules
    .filter((rule) => isVisibleRule(rule) && rule.active)
    .reduce((first, rule) => (rule.startMonth < first ? rule.startMonth : first), currentMonth);
  const pending: RecurringOccurrence[] = [];
  for (let month = firstMonth; month <= currentMonth; month = addMonths(month, 1)) {
    pending.push(...getOccurrencesForMonth(state, movementsByClient, month, todayIso)
      .filter((item) => item.status === 'today' || item.status === 'overdue' || item.status === 'different'));
  }
  return pending;
};

// Todas las retiradas apuntadas en el registro ese mes, de todos los clientes.
export const getMonthWithdrawals = (
  movementsByClient: Record<string, Record<string, Movement>>,
  month: string,
  includeClient: (clientId: string) => boolean = () => true
) => Object.entries(movementsByClient)
  .filter(([clientId]) => includeClient(clientId))
  .flatMap(([clientId, movements]) => Object.entries(movements)
    .filter(([iso, movement]) => iso.startsWith(`${month}-`) && (movement.decrement ?? 0) > 0)
    .map(([iso, movement]) => ({ clientId, iso, amount: movement.decrement ?? 0 })))
  .sort((left, right) => left.iso.localeCompare(right.iso) || left.clientId.localeCompare(right.clientId));

// Firebase no acepta campos vacios (undefined): se quitan antes de guardar (por ejemplo, la nota sin rellenar).
// Todas las aportaciones (ingresos) apuntadas en el registro ese mes. isFirst: es la primera aportacion del cliente.
export const getMonthContributions = (
  movementsByClient: Record<string, Record<string, Movement>>,
  month: string,
  includeClient: (clientId: string) => boolean = () => true
) => Object.entries(movementsByClient)
  .filter(([clientId]) => includeClient(clientId))
  .flatMap(([clientId, movements]) => {
    const first = Object.entries(movements).filter(([, movement]) => (movement.increment ?? 0) > 0).map(([iso]) => iso).sort()[0];
    return Object.entries(movements)
      .filter(([iso, movement]) => iso.startsWith(`${month}-`) && (movement.increment ?? 0) > 0)
      .map(([iso, movement]) => ({ clientId, iso, amount: movement.increment ?? 0, isFirst: iso === first }));
  })
  .sort((left, right) => left.iso.localeCompare(right.iso) || left.clientId.localeCompare(right.clientId));

export const toFirestoreRecurringState = (state: RecurringWithdrawalsState) => ({
  rules: state.rules.map((rule) => Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== undefined))),
  checks: Object.fromEntries(Object.entries(state.checks).filter(([, value]) => value && typeof value.checkedAt === 'number'))
});

export const sanitizeRecurringState = (raw: unknown): RecurringWithdrawalsState => {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rules = Array.isArray(data.rules)
    ? data.rules.filter((rule): rule is RecurringWithdrawal => {
      const value = rule as Partial<RecurringWithdrawal>;
      return Boolean(value && typeof value.id === 'string' && typeof value.clientId === 'string' &&
        typeof value.amount === 'number' && Number.isFinite(value.amount) && typeof value.day === 'number' &&
        typeof value.startMonth === 'string');
    }).map((rule) => ({ ...rule, active: rule.active !== false }))
    : [];
  const checks: RecurringWithdrawalsState['checks'] = {};
  if (data.checks && typeof data.checks === 'object') {
    Object.entries(data.checks as Record<string, unknown>).forEach(([key, value]) => {
      const checkedAt = (value as { checkedAt?: unknown })?.checkedAt;
      if (typeof checkedAt === 'number') checks[key] = { checkedAt };
    });
  }
  return { rules, checks };
};
