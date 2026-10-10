import React, { useEffect, useMemo, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './ClientLedgerReportPage.css';

interface LedgerPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface ClientLedgerReportPageProps {
  report: ReportData;
  pendingCashMovements?: LedgerPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface LedgerMonth {
  key: string;
  label: string;
  compactLabel: string;
  profit: number;
  returnPct: number;
  balance: number;
  openingBalance: number;
  increments: number;
  decrements: number;
  netFlow: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = '3m' | '6m' | '12m' | 'all' | 'custom';

const monthLookup: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, compact = false) => {
  const [year, month] = key.split('-').map(Number);
  const value = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: compact ? 'short' : 'long',
    year: compact ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
};

const signedMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '-'}${formatCurrency(Math.abs(safe))}`;
};

const signedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 1000000) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(safe);
  }
  return `${new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(safe)} €`;
};

const movementTotal = (movements: ReportData['movements'], type: 'increment' | 'decrement') => (
  movements
    .filter((movement) => movement.type === type)
    .reduce((sum, movement) => sum + movement.amount, 0)
);

const makeSparkline = (months: LedgerMonth[], index: number) => {
  const windowMonths = months.slice(Math.max(0, index - 4), index + 1);
  const values = windowMonths.map((month) => month.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, pointIndex) => {
    const x = values.length === 1 ? 50 : (pointIndex / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 22;
    return `${x},${y}`;
  }).join(' ');
  const pointList = points.split(' ');
  return { points, end: pointList[pointList.length - 1]?.split(',').map(Number) ?? [50, 17] };
};

export const ClientLedgerReportPage: React.FC<ClientLedgerReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<LedgerMonth[]>(() => {
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const validStats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance) && (
        item.endBalance !== 0 || item.profit !== 0 || item.profitPct !== 0
      ))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = validStats.length ? monthToKey(validStats[validStats.length - 1].month) : '';

    return validStats.map((item) => {
      const key = monthToKey(item.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = movementTotal(movements, 'increment');
      const decrements = movementTotal(movements, 'decrement');
      const netFlow = increments - decrements;
      const balance = Number.isFinite(item.endBalance) ? item.endBalance : 0;
      const profit = Number.isFinite(item.profit) ? item.profit : 0;
      return {
        key,
        label: monthLabel(key),
        compactLabel: monthLabel(key, true),
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(item.profitPct) ? item.profitPct : 0,
        balance,
        openingBalance: balance - profit - netFlow,
        increments,
        decrements,
        netFlow,
        movements,
        breakdown: breakdownByMonth.get(key)
      };
    });
  }, [report]);

  const latestMonthKey = months[months.length - 1]?.key ?? '';
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestMonthKey);
  const [activeMonthKey, setActiveMonthKey] = useState(latestMonthKey);

  useEffect(() => {
    setPeriodPreset('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestMonthKey);
    setActiveMonthKey(latestMonthKey);
  }, [latestMonthKey, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (periodPreset === '3m') return months.slice(-3);
    if (periodPreset === '6m') return months.slice(-6);
    if (periodPreset === '12m') return months.slice(-12);
    if (periodPreset === 'custom') {
      const start = customStart <= customEnd ? customStart : customEnd;
      const end = customStart <= customEnd ? customEnd : customStart;
      return months.filter((month) => month.key >= start && month.key <= end);
    }
    return months;
  }, [customEnd, customStart, months, periodPreset]);

  useEffect(() => {
    if (!visibleMonths.length) return;
    if (!visibleMonths.some((month) => month.key === activeMonthKey)) {
      setActiveMonthKey(visibleMonths[visibleMonths.length - 1].key);
    }
  }, [activeMonthKey, visibleMonths]);

  const activeMonth = visibleMonths.find((month) => month.key === activeMonthKey)
    ?? visibleMonths[visibleMonths.length - 1]
    ?? months[months.length - 1];
  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const grossContributions = report.incrementos + pendingIncrements;
  const grossWithdrawals = report.decrementos + pendingDecrements;
  const netCapital = grossContributions - grossWithdrawals;
  const globalDifference = visibleBalance - netCapital - report.beneficioTotal;
  const totalReturn = netCapital !== 0 ? (report.beneficioTotal / netCapital) * 100 : 0;
  const averageReturn = visibleMonths.length
    ? visibleMonths.reduce((sum, month) => sum + month.returnPct, 0) / visibleMonths.length
    : 0;
  const maxBalance = Math.max(1, ...visibleMonths.map((month) => Math.abs(month.balance)));
  const activeDifference = activeMonth
    ? activeMonth.balance - activeMonth.openingBalance - activeMonth.netFlow - activeMonth.profit
    : 0;

  const selectMonth = (key: string, source = 'statement') => {
    setActiveMonthKey(key);
    onAnalyticsEvent?.({
      type: 'ledger_month_select',
      label: key,
      metadata: { source }
    });
  };

  const selectPeriod = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    onAnalyticsEvent?.({ type: 'ledger_period_change', label: preset });
  };

  const handleMonthKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(visibleMonths.length - 1, Math.max(0, index + direction));
    const nextMonth = visibleMonths[nextIndex];
    if (!nextMonth) return;
    selectMonth(nextMonth.key, 'keyboard');
    document.getElementById(`ledger-month-${nextMonth.key}`)?.focus();
  };

  const activeBreakdown = activeMonth?.breakdown;
  const activeContributions = activeBreakdown?.contributions ?? [];
  const activeWithdrawals = activeBreakdown?.withdrawals ?? [];
  const activeMovementCount = activeMonth?.movements.length ?? 0;
  const activeReturnBar = Math.min(100, Math.abs(activeMonth?.returnPct ?? 0) / Math.max(
    0.1,
    ...visibleMonths.map((month) => Math.abs(month.returnPct))
  ) * 100);
  const averageReturnBar = Math.min(100, Math.abs(averageReturn) / Math.max(
    0.1,
    ...visibleMonths.map((month) => Math.abs(month.returnPct))
  ) * 100);

  return (
    <div className="ledger-report" ref={rootRef} role="document">
      <header className="ledger-topbar">
        <div className="ledger-brand" aria-label="JIGSA Private Office">
          <span className="ledger-brand-mark" aria-hidden="true">J</span>
          <span><strong>JIGSA</strong><small>Private Office</small></span>
        </div>
        <div className="ledger-topbar-meta">
          <span>Cuenta</span>
          <strong>{report.clientCode}</strong>
          <i aria-hidden="true" />
          <span>Actualizado</span>
          <strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong>
        </div>
      </header>

      <section className="ledger-hero">
        <div className="ledger-hero-copy">
          <p className="ledger-eyebrow">Legajo patrimonial</p>
          <h1>Tu inversión, mes a mes.</h1>
          <p>Un extracto reconciliado para entender con precisión cómo se forma el valor de tu cartera.</p>
        </div>
        <div className="ledger-balance-seal">
          <span>Saldo actual</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          {pendingCashMovements.length ? <small>Incluye movimientos posteriores al último cierre</small> : <small>Último cierre publicado</small>}
        </div>
      </section>

      <section className="ledger-kpis" aria-label="Resumen ejecutivo">
        <div>
          <span>Capital neto aportado</span>
          <strong>{formatCurrency(netCapital)}</strong>
          <small>Aportaciones menos retiradas</small>
        </div>
        <div>
          <span>Beneficio acumulado</span>
          <strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong>
          <small>Resultado generado por la inversión</small>
        </div>
        <div>
          <span>TWR acumulado</span>
          <strong className={(report.twrYtd ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong>
          <small>Rendimiento de la estrategia</small>
        </div>
        <div>
          <span>Rentabilidad total</span>
          <strong className={totalReturn >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(totalReturn)}</strong>
          <small>Beneficio sobre el capital neto</small>
        </div>
      </section>

      <section className="ledger-global-equation" aria-label="Comprobación del saldo actual">
        <div>
          <span>Capital neto</span>
          <strong>{formatCurrency(netCapital)}</strong>
        </div>
        <b aria-hidden="true">+</b>
        <div>
          <span>Beneficio</span>
          <strong>{signedMoney(report.beneficioTotal)}</strong>
        </div>
        <b aria-hidden="true">=</b>
        <div className="is-total">
          <span>Saldo actual</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
        </div>
        <em className={Math.abs(globalDifference) <= 0.02 ? 'is-reconciled' : 'is-review'}>
          <span aria-hidden="true">{Math.abs(globalDifference) <= 0.02 ? '✓' : '≈'}</span>
          {Math.abs(globalDifference) <= 0.02 ? 'Saldo reconciliado' : `Ajuste de ${formatCurrency(globalDifference)}`}
        </em>
      </section>

      <section className="ledger-period" aria-label="Seleccionar periodo del extracto">
        <div>
          <p>Periodo del extracto</p>
          <span>{visibleMonths.length} {visibleMonths.length === 1 ? 'cierre' : 'cierres'} visibles</span>
        </div>
        <div className="ledger-period-presets">
          {([
            ['3m', '3 meses'],
            ['6m', '6 meses'],
            ['12m', '12 meses'],
            ['all', 'Todo']
          ] as Array<[PeriodPreset, string]>).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={periodPreset === value ? 'is-active' : ''}
              aria-pressed={periodPreset === value}
              onClick={() => selectPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ledger-period-custom">
          <label>
            <span>Desde</span>
            <select
              value={customStart}
              onChange={(event) => {
                setCustomStart(event.target.value);
                selectPeriod('custom');
              }}
            >
              {months.map((month) => <option key={`from-${month.key}`} value={month.key}>{month.compactLabel}</option>)}
            </select>
          </label>
          <label>
            <span>Hasta</span>
            <select
              value={customEnd}
              onChange={(event) => {
                setCustomEnd(event.target.value);
                selectPeriod('custom');
              }}
            >
              {months.map((month) => <option key={`to-${month.key}`} value={month.key}>{month.compactLabel}</option>)}
            </select>
          </label>
        </div>
      </section>

      {months.length ? (
        <section className="ledger-workspace">
          <div className="ledger-statement">
            <div className="ledger-section-heading">
              <div>
                <p>Extracto mensual</p>
                <h2>El historial que construye tu saldo</h2>
              </div>
              <span>Selecciona un mes para abrir su dossier</span>
            </div>
            <div className="ledger-statement-head" aria-hidden="true">
              <span>Mes</span>
              <span>Inicio</span>
              <span>Flujo</span>
              <span>Beneficio</span>
              <span>Cierre</span>
            </div>
            <div className="ledger-statement-rows">
              {visibleMonths.map((month, index) => {
                const sparkline = makeSparkline(visibleMonths, index);
                const isActive = month.key === activeMonth?.key;
                const hasIncrement = month.increments > 0;
                const hasDecrement = month.decrements > 0;
                return (
                  <button
                    type="button"
                    id={`ledger-month-${month.key}`}
                    key={month.key}
                    className={isActive ? 'is-active' : ''}
                    aria-expanded={isActive}
                    aria-label={`${month.label}: saldo final ${formatCurrency(month.balance)}`}
                    title={`${month.label} · TWR ${signedPercent(month.returnPct)}`}
                    onClick={() => selectMonth(month.key)}
                    onKeyDown={(event) => handleMonthKeyDown(event, index)}
                  >
                    <span className="ledger-month-cell">
                      <i>{month.compactLabel}</i>
                      <svg viewBox="0 0 100 32" aria-hidden="true">
                        <polyline points={sparkline.points} />
                        <circle cx={sparkline.end[0]} cy={sparkline.end[1]} r="2.8" />
                      </svg>
                      <small>
                        {hasIncrement ? <b className="is-in">+ Entrada</b> : null}
                        {hasDecrement ? <b className="is-out">− Salida</b> : null}
                        {!hasIncrement && !hasDecrement ? 'Sin movimientos' : null}
                      </small>
                    </span>
                    <span data-label="Inicio">{compactMoney(month.openingBalance)}</span>
                    <span data-label="Flujo" className={month.netFlow >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.netFlow)}</span>
                    <span data-label="Beneficio" className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>
                      <strong>{signedMoney(month.profit)}</strong>
                      <small>{signedPercent(month.returnPct)}</small>
                    </span>
                    <span data-label="Cierre"><strong>{compactMoney(month.balance)}</strong><i aria-hidden="true">›</i></span>
                    <span className="ledger-row-progress" style={{ '--ledger-progress': `${Math.max(4, Math.abs(month.balance) / maxBalance * 100)}%` } as React.CSSProperties} />
                  </button>
                );
              })}
            </div>
          </div>

          {activeMonth ? (
            <aside className="ledger-dossier" aria-live="polite" aria-label={`Dossier de ${activeMonth.label}`}>
              <div className="ledger-dossier-tab"><span>Dossier</span><strong>{activeMonth.compactLabel}</strong></div>
              <div className="ledger-dossier-title">
                <div>
                  <p>Cierre mensual seleccionado</p>
                  <h2>{activeMonth.label}</h2>
                </div>
                <span className={activeMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(activeMonth.returnPct)}</span>
              </div>

              <div className="ledger-month-equation">
                <div><span>Saldo inicial</span><strong>{formatCurrency(activeMonth.openingBalance)}</strong></div>
                {activeMonth.increments > 0 ? <div className="is-entry"><span>Aportaciones</span><strong>+{formatCurrency(activeMonth.increments)}</strong></div> : null}
                {activeMonth.decrements > 0 ? <div className="is-exit"><span>Retiradas</span><strong>−{formatCurrency(activeMonth.decrements)}</strong></div> : null}
                <div className={activeMonth.profit >= 0 ? 'is-profit' : 'is-exit'}><span>Beneficio</span><strong>{signedMoney(activeMonth.profit)}</strong></div>
                <div className="is-final"><span>Saldo final</span><strong>{formatCurrency(activeMonth.balance)}</strong></div>
              </div>

              <div className="ledger-reconciliation">
                <span className={Math.abs(activeDifference) <= 0.02 ? 'is-reconciled' : 'is-review'} aria-hidden="true">
                  {Math.abs(activeDifference) <= 0.02 ? '✓' : '≈'}
                </span>
                <div>
                  <strong>{Math.abs(activeDifference) <= 0.02 ? 'El cierre cuadra' : 'Cierre con ajuste'}</strong>
                  <small>
                    Inicio {activeMonth.netFlow >= 0 ? '+' : '−'} flujo {activeMonth.profit >= 0 ? '+' : '−'} beneficio = saldo final
                  </small>
                </div>
              </div>

              <div className="ledger-context-bars">
                <div className="ledger-subheading"><span>Lectura del rendimiento</span><small>Frente a la media visible</small></div>
                <div>
                  <span><i>Mes seleccionado</i><strong>{signedPercent(activeMonth.returnPct)}</strong></span>
                  <b><i className={activeMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'} style={{ width: `${activeReturnBar}%` }} /></b>
                </div>
                <div>
                  <span><i>Media del periodo</i><strong>{signedPercent(averageReturn)}</strong></span>
                  <b><i className={averageReturn >= 0 ? 'is-average-positive' : 'is-negative'} style={{ width: `${averageReturnBar}%` }} /></b>
                </div>
              </div>

              <div className="ledger-movement-register">
                <div className="ledger-subheading">
                  <span>Movimientos del mes</span>
                  <small>{activeMovementCount || 'Ningún'} {activeMovementCount === 1 ? 'movimiento' : 'movimientos'}</small>
                </div>
                {activeMonth.movements.length ? activeMonth.movements.map((movement, index) => {
                  const contribution = activeContributions.find((item) => item.iso === movement.iso && item.amount === movement.amount);
                  const withdrawal = activeWithdrawals.find((item) => item.iso === movement.iso && item.amount === movement.amount);
                  const movementReturn = contribution?.returnPct ?? withdrawal?.returnPct ?? movement.returnPct;
                  const movementProfit = contribution?.profit ?? withdrawal?.profit;
                  return (
                    <div className="ledger-movement-line" key={`${movement.iso}-${movement.type}-${index}`}>
                      <span className={movement.type === 'increment' ? 'is-entry' : 'is-exit'}>{movement.type === 'increment' ? '+' : '−'}</span>
                      <div><strong>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</strong><small>{shortDate(movement.iso)}</small></div>
                      <strong>{formatCurrency(movement.amount)}</strong>
                      <small>{movementReturn === undefined ? 'Sin rentabilidad específica' : `${signedPercent(movementReturn * 100)} · ${movementProfit === undefined ? 'resultado no desglosado' : signedMoney(movementProfit)}`}</small>
                    </div>
                  );
                }) : <p className="ledger-empty-movements">Este cierre no registra aportaciones ni retiradas.</p>}
              </div>

              {activeBreakdown ? (
                <details className="ledger-breakdown" onToggle={(event) => {
                  if (event.currentTarget.open) {
                    onAnalyticsEvent?.({ type: 'ledger_dossier_expand', label: activeMonth.key });
                  }
                }}>
                  <summary>Ver desglose de rentabilidad</summary>
                  <div>
                    <span>Posición mantenida durante el mes</span>
                    <strong>{formatCurrency(activeBreakdown.initialCapital)}</strong>
                    <em>{signedPercent(activeMonth.returnPct)}</em>
                  </div>
                  {activeContributions.map((contribution) => (
                    <div key={`contribution-${contribution.iso}-${contribution.amount}`}>
                      <span>Aportación incorporada el {shortDate(contribution.iso)}</span>
                      <strong>{formatCurrency(contribution.amount)}</strong>
                      <em>{signedPercent(contribution.returnPct * 100)}</em>
                    </div>
                  ))}
                  {activeWithdrawals.map((withdrawal) => (
                    <div key={`withdrawal-${withdrawal.iso}-${withdrawal.amount}`}>
                      <span>Posición retirada el {shortDate(withdrawal.iso)}</span>
                      <strong>{formatCurrency(withdrawal.amount)}</strong>
                      <em>{withdrawal.returnPct === undefined ? '—' : signedPercent(withdrawal.returnPct * 100)}</em>
                    </div>
                  ))}
                </details>
              ) : null}
            </aside>
          ) : null}
        </section>
      ) : (
        <section className="ledger-empty-state">
          <span aria-hidden="true">⌁</span>
          <h2>Aún no hay cierres publicados</h2>
          <p>El extracto mensual aparecerá cuando exista el primer cierre de la cartera.</p>
        </section>
      )}

      {pendingCashMovements.length ? (
        <section className="ledger-pending">
          <div>
            <span className="ledger-pending-dot" aria-hidden="true" />
            <div><p>Actualización de capital</p><strong>Movimientos posteriores al último cierre</strong></div>
          </div>
          <div className="ledger-pending-lines">
            {pendingCashMovements.map((movement, index) => (
              <div key={`${movement.iso}-${movement.type}-${index}`}>
                <span>{shortDate(movement.iso)}</span>
                <strong className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>
                  {movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}
                </strong>
                <small>Pendiente del próximo cierre de rentabilidad</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="ledger-footer">
        <div>
          <span>TWR</span>
          <p>Encadena el rendimiento de cada mes sin mezclarlo con aportaciones o retiradas.</p>
        </div>
        <div>
          <span>Rentabilidad total</span>
          <p>Relaciona el beneficio acumulado con el capital neto aportado.</p>
        </div>
        <small>JIGSA · Documento informativo de seguimiento patrimonial</small>
      </footer>
    </div>
  );
};
