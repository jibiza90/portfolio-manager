import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './CapitalRiverReportPage.css';

interface RiverPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface CapitalRiverReportPageProps {
  report: ReportData;
  pendingCashMovements?: RiverPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface RiverMonth {
  key: string;
  label: string;
  compactLabel: string;
  balance: number;
  openingBalance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  netFlow: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = '6m' | '12m' | 'all' | 'custom';

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

const monthLabel = (key: string, compact = false) => {
  const [year, month] = key.split('-').map(Number);
  const label = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: compact ? 'short' : 'long',
    year: compact ? '2-digit' : 'numeric'
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

const compactMoney = (value: number) => new Intl.NumberFormat('es-ES', {
  notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  maximumFractionDigits: 1
}).format(value);

const movementTotal = (movements: ReportData['movements'], type: 'increment' | 'decrement') => (
  movements
    .filter((movement) => movement.type === type)
    .reduce((sum, movement) => sum + movement.amount, 0)
);

const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

export const CapitalRiverReportPage: React.FC<CapitalRiverReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<RiverMonth[]>(() => {
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const stats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = stats.length ? monthToKey(stats[stats.length - 1].month) : '';

    return stats.map((item) => {
      const key = monthToKey(item.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = movementTotal(movements, 'increment');
      const decrements = movementTotal(movements, 'decrement');
      const profit = Number.isFinite(item.profit) ? item.profit : 0;
      const balance = Number.isFinite(item.endBalance) ? item.endBalance : 0;
      return {
        key,
        label: monthLabel(key),
        compactLabel: monthLabel(key, true),
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
        breakdown: breakdownByMonth.get(key)
      };
    });
  }, [report]);

  const latestMonthKey = months[months.length - 1]?.key ?? '';
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestMonthKey);
  const [selectedMonthKey, setSelectedMonthKey] = useState(latestMonthKey);
  const riverScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriodPreset('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestMonthKey);
    setSelectedMonthKey(latestMonthKey);
  }, [latestMonthKey, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
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
    if (!visibleMonths.some((month) => month.key === selectedMonthKey)) {
      setSelectedMonthKey(visibleMonths[visibleMonths.length - 1].key);
    }
    const frame = window.requestAnimationFrame(() => {
      const scroller = riverScrollRef.current;
      if (scroller) scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth - 30);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [periodPreset, customStart, customEnd, selectedMonthKey, visibleMonths]);

  const selectedMonth = visibleMonths.find((month) => month.key === selectedMonthKey)
    ?? visibleMonths[visibleMonths.length - 1];
  const selectedIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === selectedMonth?.key));
  const previousMonth = selectedIndex > 0 ? visibleMonths[selectedIndex - 1] : undefined;
  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const netCapital = report.incrementos + pendingIncrements - report.decrementos - pendingDecrements;
  const totalReturn = netCapital ? (report.beneficioTotal / netCapital) * 100 : 0;

  const chartWidth = Math.max(920, visibleMonths.length * 94 + (pendingCashMovements.length ? 150 : 70));
  const chartHeight = 390;
  const baseline = 292;
  const chartLeft = 58;
  const chartRight = chartWidth - (pendingCashMovements.length ? 130 : 58);
  const chartSpan = Math.max(1, chartRight - chartLeft);
  const maxBalance = Math.max(1, ...visibleMonths.map((month) => Math.max(0, month.balance)), visibleBalance);
  const points = visibleMonths.map((month, index) => ({
    x: visibleMonths.length === 1 ? chartLeft + chartSpan / 2 : chartLeft + (index / (visibleMonths.length - 1)) * chartSpan,
    y: baseline - Math.max(24, (Math.max(0, month.balance) / maxBalance) * 178)
  }));
  const riverLine = createSmoothPath(points);
  const riverArea = points.length
    ? `${riverLine} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
    : '';
  const selectedPoint = points[selectedIndex];
  const selectedDifference = selectedMonth
    ? selectedMonth.balance - selectedMonth.openingBalance - selectedMonth.netFlow - selectedMonth.profit
    : 0;
  const selectedBreakdown = selectedMonth?.breakdown;

  const selectMonth = (key: string, source: 'river' | 'keyboard' | 'arrow' = 'river') => {
    setSelectedMonthKey(key);
    onAnalyticsEvent?.({ type: 'river_segment_select', label: key, metadata: { source } });
  };

  const selectPeriod = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    onAnalyticsEvent?.({ type: 'river_period_change', label: preset });
  };

  const moveSelection = (direction: -1 | 1, source: 'keyboard' | 'arrow') => {
    if (!visibleMonths.length) return;
    const nextIndex = Math.min(visibleMonths.length - 1, Math.max(0, selectedIndex + direction));
    const next = visibleMonths[nextIndex];
    if (!next) return;
    selectMonth(next.key, source);
    document.getElementById(`river-month-${next.key}`)?.focus();
  };

  return (
    <div className="river-report" ref={rootRef} role="document">
      <header className="river-topbar">
        <div className="river-brand">
          <span className="river-brand-mark" aria-hidden="true">J</span>
          <span><strong>JIGSA</strong><small>Private Office</small></span>
        </div>
        <div className="river-account">
          <span>Cuenta privada</span>
          <strong>{report.clientCode}</strong>
          <i aria-hidden="true" />
          <span>Cierre seleccionado</span>
          <strong>{selectedMonth?.label ?? 'Sin cierres'}</strong>
        </div>
      </header>

      <section className="river-hero">
        <div className="river-hero-copy">
          <p className="river-eyebrow">El río del capital</p>
          <h1>Mira cómo tu capital ha fluido mes a mes.</h1>
          <p>Una lectura visual de lo que ya estaba invertido, lo que entró o salió y el resultado que generó la estrategia.</p>
        </div>
        <div className="river-current-balance">
          <span>Saldo actual</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small>{pendingCashMovements.length ? 'Incluye movimientos posteriores al último cierre' : 'Según el último cierre publicado'}</small>
        </div>
      </section>

      <section className="river-kpis" aria-label="Resumen del capital">
        <article>
          <span>Beneficio acumulado</span>
          <strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong>
          <small>Resultado generado desde el inicio</small>
        </article>
        <article>
          <span>TWR acumulado</span>
          <strong className={(report.twrYtd ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong>
          <small>Rendimiento de la estrategia</small>
        </article>
        <article>
          <span>Rentabilidad total</span>
          <strong className={totalReturn >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(totalReturn)}</strong>
          <small>Beneficio sobre el capital neto</small>
        </article>
        <article>
          <span>Capital neto</span>
          <strong>{formatCurrency(netCapital)}</strong>
          <small>Aportaciones menos retiradas</small>
        </article>
      </section>

      <section className="river-navigation" aria-label="Periodo del río patrimonial">
        <div>
          <p>Horizonte visible</p>
          <strong>{visibleMonths.length} {visibleMonths.length === 1 ? 'cierre mensual' : 'cierres mensuales'}</strong>
        </div>
        <div className="river-period-presets">
          {([['6m', '6 meses'], ['12m', '12 meses'], ['all', 'Todo']] as Array<[PeriodPreset, string]>).map(([value, label]) => (
            <button type="button" key={value} className={periodPreset === value ? 'is-active' : ''} aria-pressed={periodPreset === value} onClick={() => selectPeriod(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="river-custom-period">
          <label><span>Desde</span><select value={customStart} onChange={(event) => { setCustomStart(event.target.value); selectPeriod('custom'); }}>{months.map((month) => <option key={`river-from-${month.key}`} value={month.key}>{month.compactLabel}</option>)}</select></label>
          <label><span>Hasta</span><select value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); selectPeriod('custom'); }}>{months.map((month) => <option key={`river-to-${month.key}`} value={month.key}>{month.compactLabel}</option>)}</select></label>
        </div>
      </section>

      {visibleMonths.length ? (
        <>
          <section className="river-chart-section">
            <div className="river-section-title">
              <div><p>Río patrimonial</p><h2>El recorrido que forma tu saldo</h2></div>
              <div className="river-legend" aria-label="Leyenda del gráfico">
                <span><i className="is-in" /> Aportación</span>
                <span><i className="is-out" /> Retirada</span>
                <span><i className="is-water" /> Valor de cartera</span>
              </div>
            </div>
            <p className="river-chart-instruction">Selecciona cualquier mes para abrir su estación de medición.</p>
            <div className="river-chart-frame">
              <div className="river-scale" aria-hidden="true">
                <span>{compactMoney(maxBalance)} €</span>
                <span>{compactMoney(maxBalance / 2)} €</span>
                <span>0 €</span>
              </div>
              <div className="river-scroll" ref={riverScrollRef}>
                <div className="river-canvas" style={{ width: chartWidth }}>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label="Evolución mensual del valor de cartera representada como un río">
                    <defs>
                      <linearGradient id="river-water-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#55c6b2" stopOpacity="0.92" />
                        <stop offset="55%" stopColor="#277d8f" stopOpacity="0.78" />
                        <stop offset="100%" stopColor="#123f54" stopOpacity="0.92" />
                      </linearGradient>
                      <linearGradient id="river-water-line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6edac4" />
                        <stop offset="50%" stopColor="#8ce2d1" />
                        <stop offset="100%" stopColor="#d2b978" />
                      </linearGradient>
                      <filter id="river-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      <clipPath id="river-reveal"><rect className="river-reveal-mask" x="0" y="0" width={chartWidth} height={chartHeight} /></clipPath>
                    </defs>
                    <g className="river-grid" aria-hidden="true">
                      {[114, 203, baseline].map((y) => <line key={y} x1={chartLeft} y1={y} x2={chartRight} y2={y} />)}
                    </g>
                    <g clipPath="url(#river-reveal)">
                      <path className="river-water-shadow" d={riverArea} />
                      <path className="river-water-area" d={riverArea} />
                      <path className="river-water-edge" d={riverLine} />
                      {points.slice(1).map((point, index) => {
                        const month = visibleMonths[index + 1];
                        return (
                          <path
                            key={`river-color-${month.key}`}
                            className={`river-water-result ${month.profit > 0 ? 'is-positive' : month.profit < 0 ? 'is-negative' : 'is-neutral'}`}
                            d={createSmoothPath([points[index], point])}
                          />
                        );
                      })}
                    </g>
                    {points.map((point, index) => {
                      const month = visibleMonths[index];
                      const isSelected = month.key === selectedMonth?.key;
                      return (
                        <g key={`river-point-${month.key}`} className={`river-point ${isSelected ? 'is-selected' : ''}`}>
                          <line x1={point.x} y1={point.y} x2={point.x} y2={baseline + 22} />
                          <circle cx={point.x} cy={point.y} r={isSelected ? 8 : 5} />
                          {isSelected ? <circle className="river-point-pulse" cx={point.x} cy={point.y} r="16" /> : null}
                        </g>
                      );
                    })}
                    {pendingCashMovements.length && points.length ? (
                      <path className="river-pending-path" d={`M ${points[points.length - 1].x} ${points[points.length - 1].y} C ${points[points.length - 1].x + 42} ${points[points.length - 1].y}, ${chartRight + 32} ${baseline - (visibleBalance / maxBalance) * 178}, ${chartRight + 70} ${baseline - (visibleBalance / maxBalance) * 178}`} />
                    ) : null}
                  </svg>

                  {visibleMonths.map((month, index) => {
                    const point = points[index];
                    return (
                      <button
                        type="button"
                        id={`river-month-${month.key}`}
                        key={`river-hit-${month.key}`}
                        className={`river-month-hit ${month.key === selectedMonth?.key ? 'is-active' : ''}`}
                        style={{ left: point.x }}
                        aria-label={`${month.label}. Saldo ${formatCurrency(month.balance)}, beneficio ${signedMoney(month.profit)}, rentabilidad ${signedPercent(month.returnPct)}`}
                        aria-pressed={month.key === selectedMonth?.key}
                        onClick={() => selectMonth(month.key)}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(-1, 'keyboard'); }
                          if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(1, 'keyboard'); }
                        }}
                      >
                        <span className="river-month-tooltip"><b>{month.label}</b><em>Saldo {formatCurrency(month.balance)}</em><em>{signedMoney(month.profit)} · {signedPercent(month.returnPct)}</em></span>
                        <span className="river-month-label">{month.compactLabel}</span>
                      </button>
                    );
                  })}

                  {visibleMonths.flatMap((month, monthIndex) => month.movements.map((movement, movementIndex) => {
                    const point = points[monthIndex];
                    const isIncrement = movement.type === 'increment';
                    const day = Number(movement.iso.slice(8, 10)) || 15;
                    const offset = Math.max(-28, Math.min(28, ((day - 15) / 31) * 58 + movementIndex * 5));
                    const movementBreakdown = isIncrement
                      ? month.breakdown?.contributions.find((item) => item.iso === movement.iso && item.amount === movement.amount)
                      : month.breakdown?.withdrawals?.find((item) => item.iso === movement.iso && item.amount === movement.amount);
                    return (
                      <button
                        type="button"
                        key={`river-flow-${month.key}-${movement.type}-${movementIndex}`}
                        className={`river-flow ${isIncrement ? 'is-in' : 'is-out'}`}
                        style={{ left: point.x + offset, '--river-point-y': `${point.y}px` } as React.CSSProperties}
                        aria-label={`${isIncrement ? 'Aportación' : 'Retirada'} de ${formatCurrency(movement.amount)} el ${shortDate(movement.iso)}`}
                        onFocus={() => onAnalyticsEvent?.({ type: 'river_flow_hover', label: movement.iso, metadata: { type: movement.type, input: 'keyboard' } })}
                        onPointerEnter={() => onAnalyticsEvent?.({ type: 'river_flow_hover', label: movement.iso, metadata: { type: movement.type, input: 'pointer' } })}
                      >
                        <i aria-hidden="true" /><b aria-hidden="true">{isIncrement ? '↓' : '↓'}</b>
                        <span><strong>{isIncrement ? 'Aportación' : 'Retirada'}</strong><em>{shortDate(movement.iso)} · {formatCurrency(movement.amount)}</em>{movementBreakdown?.returnPct !== undefined ? <small>Rentabilidad aplicada {signedPercent(movementBreakdown.returnPct * 100)}</small> : null}</span>
                      </button>
                    );
                  }))}

                  {pendingCashMovements.map((movement, index) => (
                    <button
                      type="button"
                      key={`river-pending-${movement.iso}-${index}`}
                      className={`river-flow is-pending ${movement.type === 'increment' ? 'is-in' : 'is-out'}`}
                      style={{ left: chartRight + 70 + index * 16, '--river-point-y': `${baseline - (visibleBalance / maxBalance) * 178}px` } as React.CSSProperties}
                      aria-label={`${movement.type === 'increment' ? 'Aportación' : 'Retirada'} pendiente de ${formatCurrency(movement.amount)} el ${shortDate(movement.iso)}`}
                    >
                      <i aria-hidden="true" /><b aria-hidden="true">↓</b>
                      <span><strong>Pendiente</strong><em>{shortDate(movement.iso)} · {movement.type === 'increment' ? '+' : '-'}{formatCurrency(movement.amount)}</em><small>Se incorporará al próximo cierre</small></span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {selectedMonth ? (
            <section className="river-station" aria-live="polite">
              <div className="river-station-heading">
                <div>
                  <p>Estación de medición</p>
                  <h2>{selectedMonth.label}</h2>
                  <span>Lectura exacta del tramo seleccionado</span>
                </div>
                <div className="river-station-controls">
                  <button type="button" aria-label="Mes anterior" disabled={selectedIndex === 0} onClick={() => moveSelection(-1, 'arrow')}>←</button>
                  <button type="button" aria-label="Mes siguiente" disabled={selectedIndex >= visibleMonths.length - 1} onClick={() => moveSelection(1, 'arrow')}>→</button>
                </div>
              </div>

              <div className="river-station-grid">
                <div className="river-station-reading">
                  <div><span>Saldo inicial</span><strong>{formatCurrency(selectedMonth.openingBalance)}</strong></div>
                  <div><span>Saldo final</span><strong>{formatCurrency(selectedMonth.balance)}</strong></div>
                  <div><span>Beneficio del mes</span><strong className={selectedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(selectedMonth.profit)}</strong></div>
                  <div><span>Rentabilidad del mes</span><strong className={selectedMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(selectedMonth.returnPct)}</strong></div>
                  <div><span>Flujo neto</span><strong className={selectedMonth.netFlow >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(selectedMonth.netFlow)}</strong></div>
                  <div><span>Cambio frente al cierre anterior</span><strong>{previousMonth ? signedMoney(selectedMonth.balance - previousMonth.balance) : 'Primer cierre visible'}</strong></div>
                </div>

                <div className="river-month-equation">
                  <p>Comprobación del cierre</p>
                  <div>
                    <span><small>Saldo inicial</small><strong>{formatCurrency(selectedMonth.openingBalance)}</strong></span>
                    <b>+</b>
                    <span><small>Aportaciones</small><strong>{formatCurrency(selectedMonth.increments)}</strong></span>
                    <b>−</b>
                    <span><small>Retiradas</small><strong>{formatCurrency(selectedMonth.decrements)}</strong></span>
                    <b>+</b>
                    <span><small>Beneficio</small><strong>{signedMoney(selectedMonth.profit)}</strong></span>
                    <b>=</b>
                    <span className="is-final"><small>Saldo final</small><strong>{formatCurrency(selectedMonth.balance)}</strong></span>
                  </div>
                  <em className={Math.abs(selectedDifference) <= 0.02 ? 'is-reconciled' : 'is-review'}>{Math.abs(selectedDifference) <= 0.02 ? 'Cierre reconciliado' : `Ajuste de ${formatCurrency(selectedDifference)}`}</em>
                </div>
              </div>

              <div className="river-month-flows">
                <div className="river-flow-register">
                  <div className="river-subheading"><span>Movimientos del mes</span><small>{selectedMonth.movements.length || 'Ningún'} {selectedMonth.movements.length === 1 ? 'movimiento' : 'movimientos'}</small></div>
                  {selectedMonth.movements.length ? selectedMonth.movements.map((movement, index) => {
                    const isIncrement = movement.type === 'increment';
                    const detail = isIncrement
                      ? selectedBreakdown?.contributions.find((item) => item.iso === movement.iso && item.amount === movement.amount)
                      : selectedBreakdown?.withdrawals?.find((item) => item.iso === movement.iso && item.amount === movement.amount);
                    return (
                      <div className="river-flow-line" key={`${movement.iso}-${movement.type}-${index}`}>
                        <span className={isIncrement ? 'is-in' : 'is-out'}>{isIncrement ? '+' : '−'}</span>
                        <div><strong>{isIncrement ? 'Aportación incorporada' : 'Posición retirada'}</strong><small>{shortDate(movement.iso)}</small></div>
                        <strong>{formatCurrency(movement.amount)}</strong>
                        <small>{detail?.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(detail.returnPct * 100)} · ${signedMoney(detail.profit)}`}</small>
                      </div>
                    );
                  }) : <p className="river-no-flows">El tramo no registra aportaciones ni retiradas.</p>}
                </div>

                <aside className="river-twr-note">
                  <span aria-hidden="true">≈</span>
                  <div><p>Cómo leer el TWR</p><h3>La estrategia, separada de los flujos</h3><p>El TWR mide lo que genera la inversión sin confundirlo con el dinero que entra por aportaciones o sale por retiradas.</p></div>
                </aside>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="river-empty">
          <span aria-hidden="true">≈</span><h2>Aún no hay cierres publicados</h2><p>El río patrimonial aparecerá cuando exista el primer cierre mensual.</p>
        </section>
      )}

      <footer className="river-footer">
        <span>JIGSA · Seguimiento patrimonial</span>
        <small>El valor de cartera, los movimientos y la rentabilidad proceden de los cierres publicados.</small>
      </footer>
    </div>
  );
};
