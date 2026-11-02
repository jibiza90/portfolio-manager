import React, { useMemo, useState } from 'react';
import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { loadCommissionRates } from '../utils/commissions';
import { formatCurrency, formatPercentValue } from '../utils/format';
import { buildFundKpis } from '../utils/fundKpis';
import {
  buildCommissionLedger,
  buildExceptions,
  buildMovementLedger,
  buildReconciliation,
  buildRollForward,
  clientBalancesAt,
  downloadCsv,
  explainRollForwardDifference,
  isBalanced,
  toCsv,
  type RollForwardRow
} from '../utils/auditData';
import { toIso } from '../utils/recurringWithdrawals';
import './AdminKpis.css';

// Pestaña "Auditoría" del admin: que todo cuadre y poder sacar cualquier listado en Excel.
// Solo lee los datos guardados (incluye lo pendiente de publicar). No cambia nada.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const periodLabel = (period: string) => (period.length === 4 ? period : monthLabel(period));
const dateLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const eur = (value: number) => formatCurrency(value);
const pct = (value: number) => formatPercentValue(value * 100);

const readPaidWithdrawals = (): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('portfolio-comision-estado-retiro') ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
};

interface Props {
  clients: Array<{ id: string; label: string }>;
  snapshot: PortfolioSnapshot;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  contacts: Record<string, { email?: string; phone?: string } | undefined>;
  todayIso?: string;
}

export const AdminAuditView: React.FC<Props> = ({ clients, snapshot, movementsByClient, monthlyHistoryByClient, contacts, todayIso = toIso(new Date()) }) => {
  const clientIds = useMemo(() => clients.map((client) => client.id), [clients]);
  const nameOf = (clientId: string) => clients.find((client) => client.id === clientId)?.label ?? clientId;
  const commissionRates = useMemo(() => loadCommissionRates(), []);
  const paidWithdrawals = useMemo(() => readPaidWithdrawals(), []);
  const kpis = useMemo(() => buildFundKpis({
    clientIds, snapshot, movementsByClient, monthlyHistoryByClient, commissionRates, paidWithdrawals,
    recurring: { rules: [], checks: {} }, todayIso
  }), [clientIds, commissionRates, monthlyHistoryByClient, movementsByClient, paidWithdrawals, snapshot, todayIso]);
  const balanceMonths = kpis.months.filter((month) => month.endBalance !== undefined).map((month) => month.month);
  const reconciliation = useMemo(() => buildReconciliation(snapshot, clientIds, balanceMonths), [balanceMonths.join(','), clientIds, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const rollForward = useMemo(() => buildRollForward(kpis.months), [kpis.months]);
  const exceptions = useMemo(() => buildExceptions(
    movementsByClient,
    kpis.clients.filter((client) => client.balance > 0.5).map((client) => client.clientId),
    clientIds,
    contacts
  ), [clientIds, contacts, kpis.clients, movementsByClient]);
  const [balancesMonth, setBalancesMonth] = useState(kpis.lastClosedMonth?.month ?? balanceMonths[balanceMonths.length - 1] ?? '');
  const [showMonthly, setShowMonthly] = useState(false);

  const unbalancedReconciliation = reconciliation.filter((row) => !isBalanced(row.difference));
  const unbalancedMonths = rollForward.monthly.filter((row) => !isBalanced(row.difference));
  const activeCount = kpis.clients.filter((client) => client.balance > 0.5).length;
  const withEmail = activeCount - exceptions.missingContact.filter((item) => item.missing.includes('email')).length;
  const withPhone = activeCount - exceptions.missingContact.filter((item) => item.missing.includes('teléfono')).length;
  const stamp = todayIso;

  const explanation = (row: RollForwardRow) => {
    if (row.period.length === 4) return null;
    const causes = explainRollForwardDifference(snapshot, clientIds, row.period);
    return causes.length > 0 ? `Explicado por: ${causes.map((item) => `${nameOf(item.clientId)} (${eur(item.difference)})`).join(', ')}` : null;
  };

  const downloads = {
    ledger: () => downloadCsv(`libro-movimientos-${stamp}.csv`, toCsv(
      ['Fecha', 'Cliente', 'Tipo', 'Importe (€)', 'Rentabilidad propia (%)'],
      buildMovementLedger(movementsByClient, clientIds).map((row) => [dateLabel(row.iso), nameOf(row.clientId), row.type, row.amount, row.ownReturnPct !== undefined ? row.ownReturnPct * 100 : undefined])
    )),
    balances: () => downloadCsv(`saldos-clientes-${balancesMonth}.csv`, toCsv(
      ['Cliente', 'Aportado (€)', 'Retirado (€)', 'Beneficio (€)', `Saldo a fin de ${monthLabel(balancesMonth)} (€)`],
      clientBalancesAt(snapshot, clientIds, balancesMonth)
        .sort((left, right) => nameOf(left.clientId).localeCompare(nameOf(right.clientId), 'es'))
        .map((row) => [nameOf(row.clientId), row.contributed, row.withdrawn, row.profit, row.balance])
    )),
    returns: () => downloadCsv(`rentabilidades-fondo-${stamp}.csv`, toCsv(
      ['Mes', 'Rentabilidad (%)', 'Beneficio (€)', 'Ingresos (€)', 'Retiradas (€)', 'Patrimonio fin de mes (€)'],
      kpis.months.map((month) => [monthLabel(month.month), month.returnPct !== undefined ? month.returnPct * 100 : 'En curso', month.profit, month.contributions, month.withdrawals, month.endBalance])
    )),
    commissions: () => downloadCsv(`libro-comisiones-${stamp}.csv`, toCsv(
      ['Fecha retirada', 'Cliente', 'Retirada (€)', 'Capital pendiente antes (€)', 'Base de comisión (€)', 'Comisión (%)', 'Comisión (€)', 'Estado'],
      buildCommissionLedger(movementsByClient, clientIds, commissionRates, paidWithdrawals)
        .map((row) => [dateLabel(row.iso), nameOf(row.clientId), row.withdrawal, row.capitalPendingBefore, row.base, row.rate !== null ? row.rate * 100 : 'Sin comisión', row.commission, row.commission > 0 ? (row.paid ? 'Cobrada' : 'Pendiente') : '—'])
    )),
    rollForward: () => downloadCsv(`movimiento-patrimonio-${stamp}.csv`, toCsv(
      ['Periodo', 'Saldo inicial (€)', 'Aportaciones (€)', 'Retiradas (€)', 'Beneficio (€)', 'Saldo final (€)', 'Diferencia (€)'],
      [...rollForward.yearly, ...rollForward.monthly].map((row) => [periodLabel(row.period), row.opening, row.contributions, row.withdrawals, row.profit, row.closing, row.difference])
    ))
  };

  const rollTable = (rows: RollForwardRow[]) => (
    <div className="kp-table-wrap">
      <table className="kp-table">
        <thead>
          <tr><th>Periodo</th><th className="is-num">Saldo inicial</th><th className="is-num">+ Aportaciones</th><th className="is-num">− Retiradas</th><th className="is-num">+ Beneficio</th><th className="is-num">= Saldo final</th><th className="is-num">Diferencia</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const balanced = isBalanced(row.difference);
            const why = balanced ? null : explanation(row);
            return (
              <React.Fragment key={row.period}>
                <tr>
                  <td>{periodLabel(row.period)}</td>
                  <td className="is-num">{eur(row.opening)}</td>
                  <td className="is-num">{eur(row.contributions)}</td>
                  <td className="is-num">{eur(row.withdrawals)}</td>
                  <td className="is-num">{eur(row.profit)}</td>
                  <td className="is-num">{eur(row.closing)}</td>
                  <td className={`is-num ${balanced ? '' : 'is-down'}`}>{balanced ? '✓' : eur(row.difference)}</td>
                </tr>
                {why ? <tr><td colSpan={7} className="kp-indent kp-why">{why}</td></tr> : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="glass-card fade-in kp-root">
      <div className="kp-top">
        <div>
          <h2>Auditoría</h2>
          <p className="kp-note">Con los datos guardados a {dateLabel(todayIso)} (incluye lo pendiente de publicar). Solo lee, no cambia nada.</p>
        </div>
      </div>

      <section className="kp-section" aria-label="Cuadre">
        <h3>Cuadre: clientes frente a la cartera</h3>
        <p className={`kp-status ${unbalancedReconciliation.length === 0 ? 'is-ok' : 'is-bad'}`}>
          {unbalancedReconciliation.length === 0
            ? `✓ La suma de los saldos de los clientes coincide con el patrimonio de la cartera en los ${reconciliation.length} meses.`
            : `No cuadra en ${unbalancedReconciliation.length} ${unbalancedReconciliation.length === 1 ? 'mes' : 'meses'}: ${unbalancedReconciliation.map((row) => monthLabel(row.month)).join(', ')}.`}
        </p>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Mes</th><th className="is-num">Suma de clientes</th><th className="is-num">Patrimonio de la cartera</th><th className="is-num">Diferencia</th><th className="is-num">Clientes activos</th></tr>
            </thead>
            <tbody>
              {[...reconciliation].reverse().map((row) => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td className="is-num">{eur(row.clientsTotal)}</td>
                  <td className="is-num">{row.portfolioTotal !== undefined ? eur(row.portfolioTotal) : '—'}</td>
                  <td className={`is-num ${isBalanced(row.difference) ? '' : 'is-down'}`}>{isBalanced(row.difference) ? '✓' : eur(row.difference ?? 0)}</td>
                  <td className="is-num">{row.activeClients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kp-section" aria-label="Movimiento del patrimonio">
        <h3>Movimiento del patrimonio</h3>
        <p className={`kp-status ${unbalancedMonths.length === 0 ? 'is-ok' : 'is-bad'}`}>
          {unbalancedMonths.length === 0
            ? '✓ Saldo inicial + aportaciones − retiradas + beneficio = saldo final, en todos los meses.'
            : `Hay diferencia en ${unbalancedMonths.length} ${unbalancedMonths.length === 1 ? 'mes' : 'meses'}: ${unbalancedMonths.map((row) => monthLabel(row.period)).join(', ')}. Debajo de cada uno, qué cliente lo explica.`}
        </p>
        {rollTable(rollForward.yearly)}
        <button type="button" className="kp-link" onClick={() => setShowMonthly(!showMonthly)}>{showMonthly ? 'Ocultar el detalle por meses' : 'Ver el detalle por meses'}</button>
        {showMonthly ? rollTable(rollForward.monthly) : rollTable(unbalancedMonths)}
      </section>

      <section className="kp-section" aria-label="Descargas">
        <h3>Descargas para Excel</h3>
        <div className="kp-downloads">
          <button type="button" className="kp-download" onClick={downloads.ledger}>Libro de movimientos<small>Todas las aportaciones y retiradas</small></button>
          <button type="button" className="kp-download" onClick={downloads.returns}>Rentabilidades del fondo<small>Mes a mes, con beneficio y patrimonio</small></button>
          <button type="button" className="kp-download" onClick={downloads.commissions}>Libro de comisiones<small>Cada retirada, base, %, comisión y estado</small></button>
          <button type="button" className="kp-download" onClick={downloads.rollForward}>Movimiento del patrimonio<small>Por año y por mes, con la diferencia</small></button>
          <div className="kp-download is-with-select">
            <label className="kp-field">
              <span>Saldos de todos los clientes a fin de</span>
              <select value={balancesMonth} onChange={(event) => setBalancesMonth(event.target.value)}>
                {[...balanceMonths].reverse().map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </label>
            <button type="button" className="info-add-btn kp-copy" onClick={downloads.balances}>Descargar saldos</button>
          </div>
        </div>
      </section>

      <section className="kp-section" aria-label="Excepciones">
        <h3>Excepciones</h3>
        <ul className="kp-list">
          <li><span>Aportaciones o retiradas con rentabilidad propia</span><span>{exceptions.ownReturns.length}</span></li>
          <li><span>Ajustes manuales de beneficio</span><span>{exceptions.manualAdjustments.length}</span></li>
          <li><span>Clientes activos con email guardado</span><span>{withEmail} de {activeCount}</span></li>
          <li><span>Clientes activos con teléfono guardado</span><span>{withPhone} de {activeCount}</span></li>
        </ul>
        {exceptions.ownReturns.length > 0 ? (
          <>
            <h4>Rentabilidades propias</h4>
            <div className="kp-table-wrap">
              <table className="kp-table">
                <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th className="is-num">Rentabilidad</th></tr></thead>
                <tbody>
                  {exceptions.ownReturns.map((item) => (
                    <tr key={`${item.clientId}|${item.iso}|${item.type}`}><td>{dateLabel(item.iso)}</td><td>{nameOf(item.clientId)}</td><td>{item.type}</td><td className="is-num">{pct(item.pct)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {exceptions.manualAdjustments.length > 0 ? (
          <>
            <h4>Ajustes manuales</h4>
            <div className="kp-table-wrap">
              <table className="kp-table">
                <thead><tr><th>Fecha</th><th>Cliente</th><th className="is-num">Beneficio</th><th className="is-num">Rentabilidad</th></tr></thead>
                <tbody>
                  {exceptions.manualAdjustments.map((item) => (
                    <tr key={`${item.clientId}|${item.iso}`}><td>{dateLabel(item.iso)}</td><td>{nameOf(item.clientId)}</td><td className="is-num">{item.profit !== undefined ? eur(item.profit) : '—'}</td><td className="is-num">{item.pct !== undefined ? pct(item.pct) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
};
