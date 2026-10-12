import React, { useEffect, useMemo, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './WealthMosaicReportPage.css';

interface MosaicPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface WealthMosaicReportPageProps {
  report: ReportData;
  pendingCashMovements?: MosaicPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface MosaicMonth {
  key: string;
  label: string;
  shortLabel: string;
  year: string;
  balance: number;
  openingBalance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  netFlow: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
  sparkline: string;
}

type MosaicSort = 'date' | 'return' | 'profit' | 'flow';

const monthLookup: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8,
  septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  const label = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
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

const compactCurrency = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 100000) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0
    }).format(safe);
  }
  return `${new Intl.NumberFormat('es-ES', {
    notation: 'compact', maximumFractionDigits: 1
  }).format(safe)} €`;
};

const movementTotal = (movements: ReportData['movements'], type: 'increment' | 'decrement') => (
  movements
    .filter((movement) => movement.type === type)
    .reduce((sum, movement) => sum + movement.amount, 0)
);

const makeSparkline = (balances: number[]) => {
  if (!balances.length) return '';
  const windowValues = balances.slice(-6);
  const min = Math.min(...windowValues);
  const max = Math.max(...windowValues);
  const span = Math.max(1, max - min);
  return windowValues.map((value, index) => {
    const x = windowValues.length === 1 ? 50 : (index / (windowValues.length - 1)) * 100;
    const y = 34 - ((value - min) / span) * 27;
    return `${x},${y}`;
  }).join(' ');
};

export const WealthMosaicReportPage: React.FC<WealthMosaicReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<MosaicMonth[]>(() => {
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const stats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = stats.length ? monthToKey(stats[stats.length - 1].month) : '';
    const balances: number[] = [];

    return stats.map((item) => {
      const key = monthToKey(item.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = movementTotal(movements, 'increment');
      const decrements = movementTotal(movements, 'decrement');
      const balance = Number.isFinite(item.endBalance) ? item.endBalance : 0;
      const profit = Number.isFinite(item.profit) ? item.profit : 0;
      balances.push(balance);
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        year: key.slice(0, 4),
        balance,
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(item.profitPct) ? item.profitPct : 0,
        increments,
        decrements,
        netFlow: increments - decrements,
        openingBalance: balance - profit - increments + decrements,
        movements,
        breakdown: breakdownByMonth.get(key),
        sparkline: makeSparkline(balances)
      };
    });
  }, [report]);

  const latestMonthKey = months[months.length - 1]?.key ?? '';
  const years = useMemo(() => [...new Set(months.map((month) => month.year))].sort().reverse(), [months]);
  const [sortBy, setSortBy] = useState<MosaicSort>('date');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonthKey, setSelectedMonthKey] = useState(latestMonthKey);

  useEffect(() => {
    setSortBy('date');
    setSelectedYear('all');
    setSelectedMonthKey(latestMonthKey);
  }, [latestMonthKey, report.clientId, report.createdAt]);

  const filteredMonths = useMemo(() => (
    selectedYear === 'all' ? months : months.filter((month) => month.year === selectedYear)
  ), [months, selectedYear]);

  const periodMonths = useMemo(
    () => [...filteredMonths].sort((left, right) => left.key.localeCompare(right.key)),
    [filteredMonths]
  );

  const orderedMonths = useMemo(() => {
    const ordered = [...filteredMonths];
    if (sortBy === 'date') return ordered.sort((left, right) => right.key.localeCompare(left.key));
    if (sortBy === 'return') return ordered.sort((left, right) => right.returnPct - left.returnPct || right.key.localeCompare(left.key));
    if (sortBy === 'profit') return ordered.sort((left, right) => right.profit - left.profit || right.key.localeCompare(left.key));
    return ordered.sort((left, right) => Math.abs(right.netFlow) - Math.abs(left.netFlow) || right.key.localeCompare(left.key));
  }, [filteredMonths, sortBy]);

  useEffect(() => {
    if (!orderedMonths.length) return;
    if (!orderedMonths.some((month) => month.key === selectedMonthKey)) {
      setSelectedMonthKey(orderedMonths[0].key);
    }
  }, [orderedMonths, selectedMonthKey]);

  const selectedMonth = months.find((month) => month.key === selectedMonthKey)
    ?? orderedMonths[0]
    ?? months[months.length - 1];
  const selectedIndex = orderedMonths.findIndex((month) => month.key === selectedMonth?.key);
  const selectedPeriodIndex = periodMonths.findIndex((month) => month.key === selectedMonth?.key);
  const selectedBreakdown = selectedMonth?.breakdown;
  const pendingIncrements = pendingCashMovements.filter((movement) => movement.type === 'increment').reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements.filter((movement) => movement.type === 'decrement').reduce((sum, movement) => sum + movement.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const netCapital = report.incrementos + pendingIncrements - report.decrementos - pendingDecrements;
  const totalReturn = netCapital ? (report.beneficioTotal / netCapital) * 100 : 0;
  const maxBalance = Math.max(1, ...months.map((month) => Math.abs(month.balance)));
  const maxReturn = Math.max(0.01, ...months.map((month) => Math.abs(month.returnPct)));
  const maxPeriodReturn = Math.max(0.01, ...periodMonths.map((month) => Math.abs(month.returnPct)));
  const periodBenefit = periodMonths.reduce((sum, month) => sum + month.profit, 0);
  const periodNetFlow = periodMonths.reduce((sum, month) => sum + month.netFlow, 0);
  const periodTwr = periodMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1;
  const periodLabel = periodMonths.length
    ? `${periodMonths[0].shortLabel} — ${periodMonths[periodMonths.length - 1].shortLabel}`
    : 'Sin cierres';
  const selectedDifference = selectedMonth
    ? selectedMonth.balance - selectedMonth.openingBalance - selectedMonth.netFlow - selectedMonth.profit
    : 0;
  const bestReturnMonth = periodMonths.reduce<MosaicMonth | undefined>((best, month) => !best || month.returnPct > best.returnPct ? month : best, undefined);
  const highestProfitMonth = periodMonths.reduce<MosaicMonth | undefined>((best, month) => !best || month.profit > best.profit ? month : best, undefined);
  const highestFlowMonth = periodMonths.reduce<MosaicMonth | undefined>((best, month) => !best || Math.abs(month.netFlow) > Math.abs(best.netFlow) ? month : best, undefined);
  const pendingMonthKey = pendingCashMovements[0]?.iso.slice(0, 7) ?? '';
  const pendingVisible = pendingCashMovements.length > 0 && (selectedYear === 'all' || pendingMonthKey.startsWith(selectedYear));

  const selectMonth = (key: string, source: 'card' | 'keyboard' = 'card') => {
    setSelectedMonthKey(key);
    onAnalyticsEvent?.({ type: 'mosaic_card_select', label: key, metadata: { source } });
  };

  const changeSort = (value: MosaicSort) => {
    setSortBy(value);
    onAnalyticsEvent?.({ type: 'mosaic_sort_change', label: value });
  };

  const changeYear = (value: string) => {
    setSelectedYear(value);
    onAnalyticsEvent?.({ type: 'mosaic_year_change', label: value });
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = Math.min(orderedMonths.length - 1, Math.max(0, index + direction));
    const next = orderedMonths[nextIndex];
    if (!next) return;
    selectMonth(next.key, 'keyboard');
    document.getElementById(`mosaic-month-${next.key}`)?.focus();
  };

  const stepSelectedMonth = (direction: -1 | 1) => {
    if (selectedPeriodIndex < 0) return;
    const next = periodMonths[selectedPeriodIndex + direction];
    if (!next) return;
    selectMonth(next.key, 'keyboard');
    onAnalyticsEvent?.({ type: 'mosaic_detail_navigate', label: next.key, metadata: { direction } });
  };

  return (
    <div className="mosaic-report" ref={rootRef} role="document">
      <header className="mosaic-topbar">
        <div className="mosaic-brand"><span aria-hidden="true">J</span><div><strong>JIGSA</strong><small>Private Office</small></div></div>
        <div className="mosaic-meta"><span>Cuenta</span><strong>{report.clientCode}</strong><i aria-hidden="true" /><span>Actualizado</span><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></div>
      </header>

      <section className="mosaic-hero">
        <div className="mosaic-hero-copy">
          <p>El mosaico patrimonial</p>
          <h1>Cada mes es una pieza.<br />Juntas forman tu patrimonio.</h1>
          <span>Explora los cierres mensuales, reordénalos y abre únicamente el detalle que quieras comprender.</span>
        </div>
        <div className="mosaic-balance-card">
          <span>Saldo actual</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small>{pendingCashMovements.length ? 'Incluye movimientos posteriores al último cierre' : 'Último cierre publicado'}</small>
          <i aria-hidden="true" />
        </div>
      </section>

      <section className="mosaic-summary" aria-label="Resumen patrimonial">
        <article><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong><small>Resultado generado desde el inicio</small></article>
        <article><span>TWR acumulado</span><strong className={(report.twrYtd ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong><small>Rendimiento de la estrategia</small></article>
        <article><span>Rentabilidad total</span><strong className={totalReturn >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(totalReturn)}</strong><small>Beneficio sobre el capital neto</small></article>
        <article><span>Capital neto</span><strong>{formatCurrency(netCapital)}</strong><small>Aportaciones menos retiradas</small></article>
      </section>

      <section className="mosaic-controls" aria-label="Organizar el mosaico">
        <div><p>Organiza la vista</p><span>{orderedMonths.length} {orderedMonths.length === 1 ? 'pieza visible' : 'piezas visibles'}</span></div>
        <div className="mosaic-sort-controls" role="group" aria-label="Ordenar meses">
          {([['date', 'Fecha'], ['return', 'Rentabilidad'], ['profit', 'Beneficio'], ['flow', 'Flujo']] as Array<[MosaicSort, string]>).map(([value, label]) => (
            <button type="button" key={value} className={sortBy === value ? 'is-active' : ''} aria-pressed={sortBy === value} onClick={() => changeSort(value)}>{label}</button>
          ))}
        </div>
        <label className="mosaic-year-filter"><span>Periodo</span><select value={selectedYear} onChange={(event) => changeYear(event.target.value)}><option value="all">Todo el histórico</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      </section>

      {orderedMonths.length ? (
        <>
          <section className="mosaic-period-lens" aria-label="Lectura del periodo visible">
            <div className="mosaic-period-lens-heading">
              <div><p>Firma del periodo</p><h2>{periodLabel}</h2></div>
              <span>La secuencia conserva el orden cronológico aunque reorganices las piezas.</span>
            </div>
            <div className="mosaic-period-lens-body">
              <div className="mosaic-return-signature" role="group" aria-label="Rentabilidad mensual del periodo">
                {periodMonths.map((month) => {
                  const magnitude = Math.max(8, Math.abs(month.returnPct) / maxPeriodReturn * 42);
                  const isSelected = month.key === selectedMonth?.key;
                  return (
                    <button
                      type="button"
                      key={month.key}
                      className={`${month.returnPct >= 0 ? 'is-positive' : 'is-negative'} ${isSelected ? 'is-selected' : ''}`}
                      aria-label={`${month.label}: ${signedPercent(month.returnPct)}`}
                      aria-pressed={isSelected}
                      onClick={() => selectMonth(month.key)}
                    >
                      <i style={{ height: `${magnitude}%` }} />
                      <span>{month.shortLabel.replace(' ', ' ')}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mosaic-period-metrics">
                <article><span>TWR enlazado</span><strong className={periodTwr >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(periodTwr * 100)}</strong><small>Rentabilidad de los cierres visibles</small></article>
                <article><span>Beneficio generado</span><strong className={periodBenefit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(periodBenefit)}</strong><small>Suma del resultado mensual</small></article>
                <article><span>Flujo neto</span><strong className={periodNetFlow >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(periodNetFlow)}</strong><small>Aportaciones menos retiradas</small></article>
              </div>
            </div>
          </section>

          <section className="mosaic-gallery" aria-label="Mosaico de cierres mensuales">
            {orderedMonths.map((month, index) => {
              const isLatest = month.key === latestMonthKey;
              const hasMovements = month.movements.length > 0;
              const isSelected = month.key === selectedMonth?.key;
              return (
                <button
                  type="button"
                  id={`mosaic-month-${month.key}`}
                  key={month.key}
                  className={`mosaic-card ${isLatest ? 'is-featured' : ''} ${hasMovements ? 'has-flow' : ''} ${isSelected ? 'is-selected' : ''}`}
                  style={{ '--mosaic-order': index } as React.CSSProperties}
                  aria-label={`${month.label}, rentabilidad ${signedPercent(month.returnPct)}, beneficio ${signedMoney(month.profit)}, saldo ${formatCurrency(month.balance)}`}
                  aria-pressed={isSelected}
                  onClick={() => selectMonth(month.key)}
                  onKeyDown={(event) => handleCardKeyDown(event, index)}
                >
                  <span className="mosaic-card-top"><i>{isLatest ? 'Último cierre' : month.year}</i><b aria-hidden="true">↗</b></span>
                  <span className="mosaic-card-month">{month.label}</span>
                  <strong className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(month.returnPct)}</strong>
                  <span className="mosaic-card-balance"><small>Saldo</small><b>{compactCurrency(month.balance)}</b></span>
                  <svg viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polyline points={month.sparkline} /><circle cx="100" cy={month.sparkline.split(' ').slice(-1)[0]?.split(',')[1] ?? 20} r="2.8" /></svg>
                  {hasMovements ? <span className="mosaic-flow-badges">{month.increments > 0 ? <i className="is-in">+ {compactCurrency(month.increments)}</i> : null}{month.decrements > 0 ? <i className="is-out">− {compactCurrency(month.decrements)}</i> : null}</span> : <span className="mosaic-no-flow">Sin movimientos de capital</span>}
                  <span className="mosaic-card-profit">{signedMoney(month.profit)} de beneficio</span>
                </button>
              );
            })}

            {pendingVisible ? (
              <article className="mosaic-card is-pending" aria-label="Movimientos pendientes del próximo cierre">
                <span className="mosaic-card-top"><i>Pendiente</i><b aria-hidden="true">···</b></span>
                <span className="mosaic-card-month">{monthLabel(pendingMonthKey || latestMonthKey)}</span>
                <strong>Próximo cierre</strong>
                <span className="mosaic-card-balance"><small>Saldo con movimientos</small><b>{compactCurrency(visibleBalance)}</b></span>
                <div className="mosaic-pending-lines">{pendingCashMovements.map((movement, index) => <span key={`${movement.iso}-${movement.type}-${index}`}><i>{shortDate(movement.iso)}</i><b className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</b></span>)}</div>
              </article>
            ) : null}
          </section>

          {selectedMonth ? (
            <section className="mosaic-detail" aria-live="polite">
              <div className="mosaic-detail-heading">
                <div><p>Pieza seleccionada</p><h2>{selectedMonth.label}</h2><span>Detalle exacto del cierre mensual</span></div>
                <div className="mosaic-detail-actions">
                  <div><span>Rentabilidad del mes</span><strong className={selectedMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(selectedMonth.returnPct)}</strong></div>
                  <nav aria-label="Cambiar pieza seleccionada">
                    <button type="button" disabled={selectedPeriodIndex <= 0} onClick={() => stepSelectedMonth(-1)} aria-label="Ver mes anterior">←</button>
                    <span>{selectedPeriodIndex + 1} / {periodMonths.length}</span>
                    <button type="button" disabled={selectedPeriodIndex < 0 || selectedPeriodIndex >= periodMonths.length - 1} onClick={() => stepSelectedMonth(1)} aria-label="Ver mes siguiente">→</button>
                  </nav>
                </div>
              </div>

              <div className="mosaic-detail-body">
                <div className="mosaic-ledger">
                  <div><span>Saldo inicial</span><strong>{formatCurrency(selectedMonth.openingBalance)}</strong></div>
                  <b aria-hidden="true">+</b>
                  <div><span>Aportaciones</span><strong>{formatCurrency(selectedMonth.increments)}</strong></div>
                  <b aria-hidden="true">−</b>
                  <div><span>Retiradas</span><strong>{formatCurrency(selectedMonth.decrements)}</strong></div>
                  <b aria-hidden="true">+</b>
                  <div><span>Beneficio</span><strong className={selectedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(selectedMonth.profit)}</strong></div>
                  <b aria-hidden="true">=</b>
                  <div className="is-final"><span>Saldo final</span><strong>{formatCurrency(selectedMonth.balance)}</strong></div>
                  <em className={Math.abs(selectedDifference) <= 0.02 ? 'is-reconciled' : 'is-review'}>{Math.abs(selectedDifference) <= 0.02 ? 'Cierre reconciliado' : `Ajuste de ${formatCurrency(selectedDifference)}`}</em>
                </div>

                <div className="mosaic-comparison">
                  <p>Escala del mes</p>
                  <div><span><i>Rentabilidad</i><strong>{signedPercent(selectedMonth.returnPct)}</strong></span><b><i className={selectedMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'} style={{ width: `${Math.max(3, Math.abs(selectedMonth.returnPct) / maxReturn * 100)}%` }} /></b></div>
                  <div><span><i>Saldo de cierre</i><strong>{formatCurrency(selectedMonth.balance)}</strong></span><b><i className="is-balance" style={{ width: `${Math.max(3, Math.abs(selectedMonth.balance) / maxBalance * 100)}%` }} /></b></div>
                </div>
              </div>

              <div className="mosaic-detail-lower">
                <div className="mosaic-movements">
                  <div className="mosaic-subheading"><span>Movimientos del mes</span><small>{selectedMonth.movements.length || 'Ningún'} {selectedMonth.movements.length === 1 ? 'movimiento' : 'movimientos'}</small></div>
                  {selectedMonth.movements.length ? selectedMonth.movements.map((movement, index) => {
                    const isIncrement = movement.type === 'increment';
                    const detail = isIncrement
                      ? selectedBreakdown?.contributions.find((item) => item.iso === movement.iso && item.amount === movement.amount)
                      : selectedBreakdown?.withdrawals?.find((item) => item.iso === movement.iso && item.amount === movement.amount);
                    return <div className="mosaic-movement-line" key={`${movement.iso}-${movement.type}-${index}`}><span className={isIncrement ? 'is-in' : 'is-out'}>{isIncrement ? '+' : '−'}</span><div><strong>{isIncrement ? 'Aportación incorporada' : 'Posición retirada'}</strong><small>{shortDate(movement.iso)}</small></div><strong>{formatCurrency(movement.amount)}</strong><small>{detail?.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(detail.returnPct * 100)} · ${signedMoney(detail.profit)}`}</small></div>;
                  }) : <p className="mosaic-empty-movements">Esta pieza no registra aportaciones ni retiradas.</p>}
                </div>

                <aside className="mosaic-month-reading">
                  <span>Lectura del mes</span>
                  <strong>{selectedMonth.netFlow === 0 ? 'El cambio procede de la inversión.' : 'El cierre combina inversión y movimientos de capital.'}</strong>
                  <p>{selectedMonth.netFlow === 0 ? `La cartera generó ${signedMoney(selectedMonth.profit)} sin entradas ni salidas.` : `El flujo neto fue ${signedMoney(selectedMonth.netFlow)} y el beneficio generado fue ${signedMoney(selectedMonth.profit)}.`}</p>
                </aside>
              </div>
            </section>
          ) : null}

          <section className="mosaic-highlights">
            <div className="mosaic-section-heading"><p>Piezas destacadas</p><h2>Tres lecturas del periodo visible</h2></div>
            <div>
              <article><span>Mayor rentabilidad</span><strong>{bestReturnMonth?.label ?? '—'}</strong><b>{bestReturnMonth ? signedPercent(bestReturnMonth.returnPct) : '—'}</b><small>El cierre con mejor rendimiento mensual</small></article>
              <article><span>Mayor beneficio</span><strong>{highestProfitMonth?.label ?? '—'}</strong><b>{highestProfitMonth ? signedMoney(highestProfitMonth.profit) : '—'}</b><small>El mes con más resultado en euros</small></article>
              <article><span>Mayor movimiento de capital</span><strong>{highestFlowMonth?.label ?? '—'}</strong><b>{highestFlowMonth ? signedMoney(highestFlowMonth.netFlow) : '—'}</b><small>Entrada o salida neta más relevante</small></article>
            </div>
          </section>

          <section className="mosaic-twr-note">
            <span aria-hidden="true">TWR</span>
            <div><h2>La rentabilidad no se confunde con el dinero que entra o sale.</h2><p>El TWR enlaza el rendimiento de cada periodo aislando las aportaciones y retiradas. Por eso cada pieza distingue claramente el beneficio de los movimientos de capital.</p></div>
          </section>
        </>
      ) : (
        <section className="mosaic-empty"><span aria-hidden="true">□</span><h2>Aún no hay cierres publicados</h2><p>El mosaico se construirá automáticamente con el primer cierre mensual.</p></section>
      )}

      <footer className="mosaic-footer"><span>JIGSA · Seguimiento patrimonial</span><small>Vista interactiva construida exclusivamente con los cierres publicados de la cuenta.</small></footer>
    </div>
  );
};
