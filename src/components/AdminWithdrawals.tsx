import React, { useMemo, useState } from 'react';
import type { Movement } from '../types';
import { getCommissionRate, getWithdrawalCommissions, loadCommissionRates } from '../utils/commissions';
import { formatCurrency, parseNumberEs } from '../utils/format';
import {
  addMonths,
  checkKey,
  getMonthWithdrawals,
  getOccurrencesForMonth,
  getPendingOccurrences,
  isVisibleRule,
  monthOf,
  scheduledDate,
  toIso,
  type RecurringOccurrence,
  type RecurringWithdrawal,
  type RecurringWithdrawalsState
} from '../utils/recurringWithdrawals';
import './AdminWithdrawals.css';

// Pestaña "Retiradas" del admin: retiradas fijas de cada mes, lo pendiente y todas las retiradas apuntadas del mes.
// Solo lee el registro de los clientes; lo que se guarda aqui es la lista de fijas y los ticks.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const dayLabel = (iso: string) => {
  const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return `${WEEKDAYS[date.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
const newId = () => `rw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const STATUS_LABEL: Record<RecurringOccurrence['status'], string> = {
  done: 'Hecha',
  different: 'Otra cantidad',
  today: 'Hoy',
  overdue: 'Atrasada',
  upcoming: 'Próxima'
};

interface Props {
  clients: Array<{ id: string; label: string }>;
  movementsByClient: Record<string, Record<string, Movement>>;
  state: RecurringWithdrawalsState;
  onUpdate: (change: (current: RecurringWithdrawalsState) => RecurringWithdrawalsState) => Promise<void>;
  error?: string | null;
  todayIso?: string;
}

interface FormState {
  id: string | null;
  clientId: string;
  amount: string;
  day: string;
  note: string;
  startMonth: string;
}

export const AdminWithdrawalsView: React.FC<Props> = ({ clients, movementsByClient, state, onUpdate, error, todayIso = toIso(new Date()) }) => {
  const currentMonth = monthOf(todayIso);
  const [month, setMonth] = useState(currentMonth);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clientIds = useMemo(() => new Set(clients.map((client) => client.id)), [clients]);
  const nameOf = (clientId: string) => clients.find((client) => client.id === clientId)?.label ?? clientId;
  const visibleRules = state.rules.filter(isVisibleRule).sort((left, right) => nameOf(left.clientId).localeCompare(nameOf(right.clientId), 'es') || left.day - right.day);

  const pending = useMemo(() => getPendingOccurrences(state, movementsByClient, todayIso), [movementsByClient, state, todayIso]);
  const monthOccurrences = useMemo(() => getOccurrencesForMonth(state, movementsByClient, month, todayIso), [month, movementsByClient, state, todayIso]);
  const monthWithdrawals = useMemo(() => getMonthWithdrawals(movementsByClient, month, (clientId) => clientIds.has(clientId)), [clientIds, month, movementsByClient]);
  const commissionByKey = useMemo(() => {
    const rates = loadCommissionRates();
    const map = new Map<string, number>();
    new Set(monthWithdrawals.map((item) => item.clientId)).forEach((clientId) => {
      getWithdrawalCommissions(movementsByClient[clientId], getCommissionRate(clientId, rates))
        .forEach((item) => map.set(`${clientId}|${item.iso}`, item.commission));
    });
    return map;
  }, [monthWithdrawals, movementsByClient]);
  const fixedByKey = new Map(monthOccurrences.filter((item) => item.matched).map((item) => [`${item.rule.clientId}|${item.matched!.iso}`, item.rule]));
  const monthTotal = monthWithdrawals.reduce((sum, item) => sum + item.amount, 0);
  const monthCommission = monthWithdrawals.reduce((sum, item) => sum + (commissionByKey.get(`${item.clientId}|${item.iso}`) ?? 0), 0);

  const run = async (change: (current: RecurringWithdrawalsState) => RecurringWithdrawalsState) => {
    setBusy(true);
    try {
      await onUpdate(change);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setChecked = (occurrence: RecurringOccurrence, checked: boolean) => run((current) => {
    const checks = { ...current.checks };
    if (checked) checks[checkKey(occurrence.rule.id, occurrence.month)] = { checkedAt: Date.now() };
    else delete checks[checkKey(occurrence.rule.id, occurrence.month)];
    return { ...current, checks };
  });

  const changeRule = (id: string, patch: Partial<RecurringWithdrawal>) => run((current) => ({
    ...current,
    rules: current.rules.map((rule) => (rule.id === id ? { ...rule, ...patch, updatedAt: Date.now() } : rule))
  }));

  // Por defecto empieza este mes si aun no ha llegado el dia; si ya ha pasado, el mes que viene.
  const defaultStartMonth = (day: number) => (scheduledDate(day, currentMonth) >= todayIso ? currentMonth : addMonths(currentMonth, 1));
  const startMonthOptions = Array.from({ length: 13 }, (_, index) => addMonths(currentMonth, index - 1));

  const openNew = () => {
    setFormError(null);
    setForm({ id: null, clientId: '', amount: '', day: '', note: '', startMonth: currentMonth });
  };
  const openEdit = (rule: RecurringWithdrawal) => {
    setFormError(null);
    setForm({ id: rule.id, clientId: rule.clientId, amount: String(rule.amount).replace('.', ','), day: String(rule.day), note: rule.note ?? '', startMonth: rule.startMonth });
  };

  const saveForm = async () => {
    if (!form) return;
    const amount = parseNumberEs(form.amount);
    const day = Number.parseInt(form.day, 10);
    if (!form.clientId) return setFormError('Elige el cliente.');
    if (amount === undefined || !(amount > 0)) return setFormError('Pon una cantidad mayor que 0.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return setFormError('El día tiene que ser entre 1 y 31.');
    const now = Date.now();
    const note = form.note.trim();
    const ok = await run((current) => {
      if (form.id) {
        return {
          ...current,
          rules: current.rules.map((rule) => (rule.id === form.id
            ? { ...rule, clientId: form.clientId, amount, day, note: note || undefined, startMonth: form.startMonth, updatedAt: now }
            : rule))
        };
      }
      return {
        ...current,
        rules: [...current.rules, { id: newId(), clientId: form.clientId, amount, day, note: note || undefined, active: true, startMonth: form.startMonth, createdAt: now, updatedAt: now }]
      };
    });
    if (ok) setForm(null);
  };

  const remove = (rule: RecurringWithdrawal) => {
    if (!window.confirm(`¿Quitar la retirada fija de ${nameOf(rule.clientId)} (${formatCurrency(rule.amount)} el día ${rule.day})?\n\nNo se borra nada del registro del cliente.`)) return;
    void changeRule(rule.id, { removedAt: Date.now(), active: false });
  };

  const occurrenceText = (item: RecurringOccurrence) => {
    if (item.status === 'different' && item.matched) return `Apuntada ${formatCurrency(item.matched.amount)} el ${dayLabel(item.matched.iso)} (la fija es de ${formatCurrency(item.rule.amount)})`;
    if (item.status === 'overdue') return `Pendiente desde el ${dayLabel(item.scheduledIso)}`;
    if (item.status === 'today') return 'Toca hoy';
    if (item.status === 'upcoming') return `Toca el ${dayLabel(item.scheduledIso)}`;
    if (item.matched) return `Apuntada el ${dayLabel(item.matched.iso)}`;
    return 'Marcada como hecha';
  };

  return (
    <div className="glass-card fade-in aw-root">
      {error ? <p className="aw-error" role="alert">{error}</p> : null}

      <section className="aw-card" aria-labelledby="aw-pending-title">
        <h3 id="aw-pending-title">Pendientes</h3>
        {pending.length === 0 ? (
          <p className="aw-empty">Nada pendiente. Todas las retiradas fijas que tocaban están apuntadas o marcadas.</p>
        ) : (
          <ul className="aw-list">
            {pending.map((item) => (
              <li key={`${item.rule.id}|${item.month}`} className={`aw-item is-${item.status}`}>
                <span className={`aw-chip is-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                <span className="aw-item-main">
                  <strong>{nameOf(item.rule.clientId)} · {formatCurrency(item.rule.amount)}</strong>
                  <span>{occurrenceText(item)}{item.month !== currentMonth ? ` · ${monthLabel(item.month)}` : ''}</span>
                </span>
                <button type="button" className="aw-tick" disabled={busy} onClick={() => { void setChecked(item, true); }}>Hecha ✓</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="aw-card" aria-labelledby="aw-rules-title">
        <div className="aw-head">
          <h3 id="aw-rules-title">Retiradas fijas</h3>
          <button type="button" className="info-add-btn aw-add" onClick={openNew}>+ Añadir</button>
        </div>

        {form ? (
          <form className="aw-form" onSubmit={(event) => { event.preventDefault(); void saveForm(); }}>
            <label>
              <span>Cliente</span>
              <select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })}>
                <option value="">Elige un cliente…</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
              </select>
            </label>
            <label>
              <span>Cantidad (€)</span>
              <input inputMode="decimal" value={form.amount} placeholder="500" onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </label>
            <label>
              <span>Día del mes</span>
              <input
                inputMode="numeric"
                value={form.day}
                placeholder="15"
                onChange={(event) => {
                  const day = Number.parseInt(event.target.value, 10);
                  setForm({ ...form, day: event.target.value, startMonth: !form.id && day >= 1 && day <= 31 ? defaultStartMonth(day) : form.startMonth });
                }}
              />
            </label>
            <label>
              <span>Empieza en</span>
              <select value={form.startMonth} onChange={(event) => setForm({ ...form, startMonth: event.target.value })}>
                {[...new Set([form.startMonth, ...startMonthOptions])].sort().map((option) => <option key={option} value={option}>{monthLabel(option)}</option>)}
              </select>
            </label>
            <label className="aw-form-note">
              <span>Nota (opcional)</span>
              <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </label>
            {formError ? <p className="aw-error" role="alert">{formError}</p> : null}
            <div className="aw-form-actions">
              <button type="button" className="aw-ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="info-add-btn aw-save" disabled={busy}>{form.id ? 'Guardar cambios' : 'Añadir'}</button>
            </div>
          </form>
        ) : null}

        {visibleRules.length === 0 ? (
          <p className="aw-empty">Todavía no hay retiradas fijas. Pulsa «+ Añadir».</p>
        ) : (
          <div className="aw-table-wrap">
            <table className="aw-table">
              <thead>
                <tr><th>Cliente</th><th className="is-num">Cantidad</th><th>Día</th><th>Desde</th><th>Nota</th><th>Estado</th><th aria-label="Acciones" /></tr>
              </thead>
              <tbody>
                {visibleRules.map((rule) => (
                  <tr key={rule.id} className={rule.active ? '' : 'is-paused'}>
                    <td><strong>{nameOf(rule.clientId)}</strong></td>
                    <td className="is-num">{formatCurrency(rule.amount)}</td>
                    <td>Cada día {rule.day}</td>
                    <td>{monthLabel(rule.startMonth)}</td>
                    <td>{rule.note ?? ''}</td>
                    <td><span className={`aw-chip ${rule.active ? 'is-done' : 'is-paused'}`}>{rule.active ? 'Activa' : 'Pausada'}</span></td>
                    <td className="aw-actions">
                      <button type="button" className="aw-ghost" onClick={() => openEdit(rule)}>Modificar</button>
                      <button type="button" className="aw-ghost" disabled={busy} onClick={() => { void changeRule(rule.id, { active: !rule.active }); }}>{rule.active ? 'Pausar' : 'Reactivar'}</button>
                      <button type="button" className="aw-ghost is-danger" disabled={busy} onClick={() => remove(rule)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="aw-card" aria-labelledby="aw-month-title">
        <div className="aw-head">
          <h3 id="aw-month-title">Retiradas de {monthLabel(month)}</h3>
          <div className="aw-month-nav" role="group" aria-label="Cambiar de mes">
            <button type="button" className="aw-ghost" onClick={() => setMonth(addMonths(month, -1))}>‹ Anterior</button>
            {month !== currentMonth ? <button type="button" className="aw-ghost" onClick={() => setMonth(currentMonth)}>Este mes</button> : null}
            <button type="button" className="aw-ghost" onClick={() => setMonth(addMonths(month, 1))}>Siguiente ›</button>
          </div>
        </div>

        {monthOccurrences.length > 0 ? (
          <>
            <h4>Retiradas fijas del mes</h4>
            <ul className="aw-list">
              {monthOccurrences.map((item) => (
                <li key={item.rule.id} className={`aw-item is-${item.status}`}>
                  <span className={`aw-chip is-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                  <span className="aw-item-main">
                    <strong>{nameOf(item.rule.clientId)} · {formatCurrency(item.rule.amount)}</strong>
                    <span>{occurrenceText(item)}</span>
                  </span>
                  {item.checked && !(item.matched && item.matched.amount === item.rule.amount) ? (
                    <button type="button" className="aw-ghost" disabled={busy} onClick={() => { void setChecked(item, false); }}>Quitar tick</button>
                  ) : item.status === 'done' || item.status === 'upcoming' ? <span /> : (
                    <button type="button" className="aw-tick" disabled={busy} onClick={() => { void setChecked(item, true); }}>Hecha ✓</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h4>Todas las retiradas apuntadas</h4>
        {monthWithdrawals.length === 0 ? (
          <p className="aw-empty">No hay retiradas apuntadas en {monthLabel(month)}.</p>
        ) : (
          <div className="aw-table-wrap">
            <table className="aw-table">
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th className="is-num">Cantidad</th><th className="is-num">Comisión</th><th>Tipo</th></tr>
              </thead>
              <tbody>
                {monthWithdrawals.map((item) => {
                  const commission = commissionByKey.get(`${item.clientId}|${item.iso}`) ?? 0;
                  return (
                    <tr key={`${item.clientId}|${item.iso}`}>
                      <td>{dayLabel(item.iso)}</td>
                      <td><strong>{nameOf(item.clientId)}</strong></td>
                      <td className="is-num">{formatCurrency(item.amount)}</td>
                      <td className="is-num">{commission > 0 ? formatCurrency(commission) : '—'}</td>
                      <td>{fixedByKey.has(`${item.clientId}|${item.iso}`) ? <span className="aw-chip is-fixed">Fija</span> : <span className="aw-chip is-once">Puntual</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total {monthLabel(month)} · {monthWithdrawals.length} {monthWithdrawals.length === 1 ? 'retirada' : 'retiradas'}</strong></td>
                  <td className="is-num"><strong>{formatCurrency(monthTotal)}</strong></td>
                  <td className="is-num"><strong>{monthCommission > 0 ? formatCurrency(monthCommission) : '—'}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
