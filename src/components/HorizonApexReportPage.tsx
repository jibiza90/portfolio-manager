import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './HorizonApexReportPage.css';

interface ApexPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface HorizonApexReportPageProps {
  report: ReportData;
  pendingCashMovements?: ApexPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onPeriodChange?: (startMonth: string, endMonth: string, isAll: boolean) => void;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface ApexMonth {
  key: string;
  label: string;
  shortLabel: string;
  opening: number;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = '3m' | '6m' | '12m' | 'all' | 'custom';

const monthNumbers: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8,
  septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthNumbers[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const value = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES');
};

const signedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactCurrency = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  movements.filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0);

const linePath = (points: Array<{ x: number; y: number }>) => points
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
  .join(' ');

export const HorizonApexReportPage: React.FC<HorizonApexReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumMovements(pending, 'increment');
  const pendingDecrements = sumMovements(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const netCapital = visibleContributed - visibleWithdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;
  const apexRatio = netCapital > 0 ? report.beneficioTotal / netCapital * 100 : 0;

  const months = useMemo<ApexMonth[]>(() => {
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const source = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(source[source.length - 1]?.month ?? '');
    return source.map((month) => {
      const key = monthToKey(month.month);
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(movements, 'increment');
      const decrements = sumMovements(movements, 'decrement');
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const profit = Number.isFinite(month.profit) ? month.profit : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        opening: balance - profit - increments + decrements,
        balance,
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(month.profitPct) ? month.profitPct : 0,
        increments,
        decrements,
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusKey, setFocusKey] = useState(latestKey);
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const visibleMonths = useMemo(() => {
    if (period === '3m') return months.slice(-3);
    if (period === '6m') return months.slice(-6);
    if (period === '12m') return months.slice(-12);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const activeKey = hoveredKey ?? focusKey;
  const activeMonth = visibleMonths.find((month) => month.key === activeKey) ?? visibleMonths[visibleMonths.length - 1];
  const activeIndex = activeMonth ? visibleMonths.findIndex((month) => month.key === activeMonth.key) : -1;
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodProfit = visibleMonths.reduce((sum, month) => sum + month.profit, 0);
  const periodTwr = (visibleMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1) * 100;
  const periodIncrements = visibleMonths.reduce((sum, month) => sum + month.increments, 0);
  const periodDecrements = visibleMonths.reduce((sum, month) => sum + month.decrements, 0);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusKey(latestKey);
    setHoveredKey(null);
    setOpenMonthKey(null);
  }, [latestKey, months, report.clientId, report.createdAt]);

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusKey)) {
      setFocusKey(visibleMonths[visibleMonths.length - 1].key);
      setOpenMonthKey(null);
    }
  }, [focusKey, visibleMonths]);

  useEffect(() => {
    if (!periodStart || !periodEnd) return;
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  const setPreset = (next: PeriodPreset) => {
    setPeriod(next);
    setHoveredKey(null);
    onAnalyticsEvent?.({ type: 'report_period_change', label: `Horizonte Apex ${next}` });
  };

  const focusMonth = useCallback((index: number) => {
    if (!visibleMonths.length) return;
    const safeIndex = Math.max(0, Math.min(visibleMonths.length - 1, index));
    setFocusKey(visibleMonths[safeIndex].key);
    setHoveredKey(null);
  }, [visibleMonths]);

  const handleChartPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!visibleMonths.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 1440;
    const ratio = Math.max(0, Math.min(1, (svgX - 72) / 1296));
    const index = visibleMonths.length === 1 ? 0 : Math.round(ratio * (visibleMonths.length - 1));
    setHoveredKey(visibleMonths[index].key);
  };

  const handleChartKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!visibleMonths.length) return;
    const current = Math.max(0, visibleMonths.findIndex((month) => month.key === focusKey));
    if (event.key === 'ArrowRight') { event.preventDefault(); focusMonth(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusMonth(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); focusMonth(0); }
    if (event.key === 'End') { event.preventDefault(); focusMonth(visibleMonths.length - 1); }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const key = visibleMonths[current]?.key;
      if (!key) return;
      setOpenMonthKey(key);
      window.setTimeout(() => rowRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
    }
    if (event.key === 'Escape') setOpenMonthKey(null);
  };

  const chart = useMemo(() => {
    const width = 1440;
    const left = 72;
    const right = 72;
    const plotWidth = width - left - right;
    const maxBalance = Math.max(1, ...visibleMonths.map((month) => Math.max(0, month.balance)));
    const maxProfit = Math.max(1, ...visibleMonths.map((month) => Math.abs(month.profit)));
    const points = visibleMonths.map((month, index) => {
      const x = visibleMonths.length === 1 ? width / 2 : left + index * (plotWidth / (visibleMonths.length - 1));
      return {
        month,
        x,
        balanceY: 480 - Math.max(0, month.balance) / maxBalance * 190,
        profitY: 140 - month.profit / maxProfit * 85
      };
    });
    const balanceTop = linePath(points.map((point) => ({ x: point.x, y: point.balanceY })));
    const balanceArea = points.length
      ? `M ${points[0].x} 480 ${points.map((point) => `L ${point.x} ${point.balanceY}`).join(' ')} L ${points[points.length - 1].x} 480 Z`
      : '';
    const profitLine = linePath(points.map((point) => ({ x: point.x, y: point.profitY })));
    const profitArea = points.length
      ? `M ${points[0].x} 140 ${points.map((point) => `L ${point.x} ${point.profitY}`).join(' ')} L ${points[points.length - 1].x} 140 Z`
      : '';
    return { width, left, right, plotWidth, maxBalance, maxProfit, points, balanceTop, balanceArea, profitLine, profitArea };
  }, [visibleMonths]);

  const firstMonth = visibleMonths[0];
  const lastMonth = visibleMonths[visibleMonths.length - 1];
  const activePoint = activeIndex >= 0 ? chart.points[activeIndex] : undefined;
  const chartLabelStep = Math.max(1, Math.ceil(visibleMonths.length / 10));
  const reconciled = firstMonth && lastMonth
    ? firstMonth.opening + periodIncrements - periodDecrements + periodProfit
    : 0;
  const discrepancy = lastMonth ? lastMonth.balance - reconciled : 0;
  const reconciliationOk = Math.abs(discrepancy) < 0.01;

  return (
    <div className="apex-report" ref={rootRef}>
      <header className="apex-visor-bar">
        <div className="apex-brand-lockup">
          <span className="apex-reticle" aria-hidden="true"><i /><i /></span>
          <div>
            <small>Sistema de telemetría patrimonial // Terminal Apex</small>
            <strong>Horizonte Apex</strong>
          </div>
        </div>
        <div className="apex-visor-meta">
          <span className="apex-live"><i /> Conexión verificada</span>
          <span>Cuenta <b>{report.clientCode}</b></span>
          <span>Cierre <b>{lastMonth?.label ?? 'Sin datos'}</b></span>
        </div>
        <button className="apex-download" type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download_click', label: 'Horizonte Apex PDF' }); void onDownload?.(); }}>
          <span>Descargar PDF oficial</span>
          <small>Documento consolidado</small>
        </button>
      </header>

      <section className="apex-monolith" aria-label="Resumen patrimonial">
        <div className="apex-summit">
          <span>Saldo total disponible</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small>Posición consolidada {pending.length ? '+ capital posterior al cierre' : 'al último cierre publicado'}</small>
        </div>
        <div className="apex-primary-vectors">
          <article>
            <span>Beneficio acumulado global</span>
            <strong className={tone(report.beneficioTotal)}>{signedCurrency(report.beneficioTotal)}</strong>
            <small>Resultado histórico neto</small>
          </article>
          <article>
            <span>Rentabilidad TWR acumulada</span>
            <strong className={tone(twrPct)}>{signedPercent(twrPct)}</strong>
            <small>Gestión sin efecto de flujos</small>
          </article>
          <article>
            <span>Rentabilidad simple cartera</span>
            <strong className={report.rentabilidadDisponible === false ? 'is-neutral' : tone(report.rentabilidad)}>
              {report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}
            </strong>
            <small>Beneficio / capital neto</small>
          </article>
        </div>
        <div className="apex-ratio" aria-label="Apex Ratio">
          <span>Apex ratio</span>
          <strong>{signedPercent(apexRatio)}</strong>
          <div><i style={{ width: `${Math.min(100, Math.max(0, Math.abs(apexRatio)))}%` }} /></div>
          <small>Beneficio generado sobre masa neta gestionada</small>
        </div>
      </section>

      <section className="apex-capital-rack" aria-label="Composición financiera actual">
        <header>
          <span>Arquitectura de la posición</span>
          <strong>Composición financiera actual</strong>
        </header>
        <article><span>Capital aportado</span><strong className="is-inflow">{formatCurrency(visibleContributed)}</strong></article>
        <article><span>Capital retirado</span><strong className="is-outflow">{formatCurrency(visibleWithdrawn)}</strong></article>
        <article><span>Capital neto</span><strong>{formatCurrency(netCapital)}</strong></article>
        <article><span>Beneficio · {lastMonth?.shortLabel ?? 'último cierre'}</span><strong className={tone(report.beneficioUltimoMes)}>{signedCurrency(report.beneficioUltimoMes)}</strong></article>
        <article><span>Rentabilidad · {lastMonth?.shortLabel ?? 'último cierre'}</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong></article>
      </section>

      {pending.length ? (
        <section className="apex-vector-strip" aria-label="Movimientos posteriores al último cierre">
          <div>
            <span>Vector de capital en tránsito</span>
            <strong>Movimientos posteriores al último cierre oficial</strong>
            <small>El saldo ya los incorpora. Su resultado se integrará en el siguiente cierre publicado.</small>
          </div>
          <div className="apex-pending-list">
            {pending.map((movement, index) => (
              <article key={`${movement.iso}-${movement.type}-${index}`}>
                <time>{formatDate(movement.iso)}</time>
                <span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span>
                <strong className={movement.type === 'increment' ? 'is-inflow' : 'is-outflow'}>
                  {movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}
                </strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="apex-control-deck" aria-label="Controles del periodo">
        <div>
          <span>Ventana de análisis</span>
          <strong>{periodStart && periodEnd ? `${monthLabel(periodStart, true)} — ${monthLabel(periodEnd, true)}` : 'Sin cierres'}</strong>
        </div>
        <div className="apex-periods">
          {([['3m', '3 meses'], ['6m', '6 meses'], ['12m', '1 año'], ['all', 'Histórico completo'], ['custom', 'Rango específico']] as Array<[PeriodPreset, string]>).map(([value, label]) => (
            <button type="button" className={period === value ? 'is-active' : ''} aria-pressed={period === value} onClick={() => setPreset(value)} key={value}>{label}</button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="apex-custom-period">
            <label>Desde<select value={customStart} onChange={(event) => { const value = event.target.value; setCustomStart(value); if (value > customEnd) setCustomEnd(value); }}>{months.map((month) => <option value={month.key} key={month.key}>{month.label}</option>)}</select></label>
            <label>Hasta<select value={customEnd} onChange={(event) => { const value = event.target.value; setCustomEnd(value); if (value < customStart) setCustomStart(value); }}>{months.map((month) => <option value={month.key} key={month.key}>{month.label}</option>)}</select></label>
          </div>
        ) : null}
      </section>

      <section className="apex-viewport-shell">
        <header>
          <div>
            <span>Dual-stream horizon / DS-01</span>
            <h2>Topografía cuantitativa del patrimonio</h2>
            <p>Resultado puro y masa de capital conviven en escalas independientes para preservar la lectura real.</p>
          </div>
          {activeMonth ? (
            <aside className="apex-focus-hud" aria-live="polite">
              <span>Lectura óptica · {String(activeIndex + 1).padStart(2, '0')}/{String(visibleMonths.length).padStart(2, '0')}</span>
              <strong>{activeMonth.label}</strong>
              <div><small>Saldo de cierre</small><b>{formatCurrency(activeMonth.balance)}</b></div>
              <div><small>Beneficio</small><b className={tone(activeMonth.profit)}>{signedCurrency(activeMonth.profit)}</b></div>
              <div><small>Rentabilidad</small><b className={tone(activeMonth.returnPct)}>{signedPercent(activeMonth.returnPct)}</b></div>
            </aside>
          ) : null}
          <div className="apex-chart-legend" aria-label="Leyenda del gráfico">
            <span><i className="is-profit" /> Beneficio mensual</span>
            <span><i className="is-balance" /> Saldo de cierre</span>
            <span><i className="is-inflow" /> Aportación</span>
            <span><i className="is-outflow" /> Retirada</span>
          </div>
        </header>
        <div className="apex-viewport">
          {visibleMonths.length ? (
            <svg
              className="apex-canvas"
              viewBox="0 0 1440 540"
              role="region"
              tabIndex={0}
              aria-label="Cámara gráfica Horizonte Apex"
              onPointerMove={handleChartPointer}
              onPointerLeave={() => setHoveredKey(null)}
              onClick={() => activeMonth && setFocusKey(activeMonth.key)}
              onKeyDown={handleChartKeyDown}
            >
              <desc>Gráfico interactivo de evolución patrimonial desde {firstMonth?.label} hasta {lastMonth?.label}. Saldo final {formatCurrency(lastMonth?.balance ?? 0)} y beneficio del periodo {formatCurrency(periodProfit)}.</desc>
              <defs>
                <linearGradient id="apexProfitFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00F0FF" stopOpacity=".25" /><stop offset="1" stopColor="#00F0FF" stopOpacity="0" /></linearGradient>
                <linearGradient id="apexBalanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9BA8BB" stopOpacity=".2" /><stop offset="1" stopColor="#9BA8BB" stopOpacity=".025" /></linearGradient>
                <filter id="apexGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              {[55, 97.5, 140, 182.5, 225, 290, 337.5, 385, 432.5, 480].map((y) => <line key={y} x1="72" x2="1368" y1={y} y2={y} className={y === 140 || y === 480 ? 'apex-grid-major' : 'apex-grid-line'} />)}
              <text x="72" y="28" className="apex-axis-title">VECTOR DE RESULTADO</text>
              <text x="1368" y="28" textAnchor="end" className="apex-axis-value">±{compactCurrency(chart.maxProfit)}</text>
              <text x="72" y="268" className="apex-axis-title">MASA DE CAPITAL</text>
              <text x="1368" y="268" textAnchor="end" className="apex-axis-value">{compactCurrency(chart.maxBalance)}</text>
              <path d={chart.profitArea} fill="url(#apexProfitFill)" />
              <path d={chart.balanceArea} fill="url(#apexBalanceFill)" />
              <path d={chart.balanceTop} className="apex-balance-line" />
              <path d={chart.profitLine} className="apex-profit-line" filter="url(#apexGlow)" />
              {chart.points.map((point, index) => {
                const selected = point.month.key === activeMonth?.key;
                return (
                  <g className={`apex-month-vector${selected ? ' is-active' : ''}`} key={point.month.key}>
                    <line x1={point.x} x2={point.x} y1="48" y2="498" className="apex-month-guide" />
                    <circle cx={point.x} cy={point.profitY} r={selected ? 7 : 4} className={`apex-profit-node ${tone(point.month.profit)}`} />
                    <circle cx={point.x} cy={point.balanceY} r={selected ? 7 : 4} className="apex-balance-node" />
                    {point.month.increments > 0 ? <><line x1={point.x} x2={point.x} y1={point.balanceY + 8} y2={point.balanceY + 39} className="apex-flow-in" /><path d={`M ${point.x} ${point.balanceY + 34} l 5 5 l -5 5 l -5 -5 Z`} className="apex-flow-in-marker" /></> : null}
                    {point.month.decrements > 0 ? <><line x1={point.x + 9} x2={point.x + 9} y1={point.balanceY + 8} y2={point.balanceY + 39} className="apex-flow-out" /><path d={`M ${point.x + 4} ${point.balanceY + 34} l 10 0 l -5 8 Z`} className="apex-flow-out-marker" /></> : null}
                    {(index % chartLabelStep === 0 || index === visibleMonths.length - 1 || selected) ? <text x={point.x} y="522" textAnchor="middle" className="apex-month-label">{point.month.shortLabel}</text> : null}
                  </g>
                );
              })}
              {activePoint ? <line x1={activePoint.x} x2={activePoint.x} y1="38" y2="500" className="apex-crosshair" /> : null}
            </svg>
          ) : <div className="apex-empty">Aún no existen cierres mensuales para representar.</div>}
        </div>
      </section>

      {activeMonth ? (
        <section className="apex-tactical-dock" aria-live="polite">
          <div className="apex-focus-period"><span>Periodo enfocado</span><strong>{activeMonth.label}</strong><small>{activeIndex + 1} / {visibleMonths.length}</small></div>
          <div className="apex-dock-metrics">
            <article><span>Saldo inicial</span><strong>{formatCurrency(activeMonth.opening)}</strong></article>
            <article><span>Aportaciones</span><strong className="is-inflow">{activeMonth.increments ? `+${formatCurrency(activeMonth.increments)}` : '—'}</strong></article>
            <article><span>Retiradas</span><strong className="is-outflow">{activeMonth.decrements ? `−${formatCurrency(activeMonth.decrements)}` : '—'}</strong></article>
            <article><span>Beneficio</span><strong className={tone(activeMonth.profit)}>{signedCurrency(activeMonth.profit)}</strong></article>
            <article><span>Rentabilidad pura</span><strong className={tone(activeMonth.returnPct)}>{signedPercent(activeMonth.returnPct)}</strong></article>
            <article><span>Saldo final</span><strong>{formatCurrency(activeMonth.balance)}</strong></article>
          </div>
          <div className="apex-dock-nav"><button type="button" onClick={() => focusMonth(activeIndex - 1)} disabled={activeIndex <= 0} aria-label="Mes anterior">←</button><button type="button" onClick={() => focusMonth(activeIndex + 1)} disabled={activeIndex >= visibleMonths.length - 1} aria-label="Mes siguiente">→</button></div>
        </section>
      ) : null}

      <section className="apex-audit-matrix">
        <header>
          <div><span>Matriz cronológica / AM-02</span><h2>Inspección de cierres y tramos</h2></div>
          <div><small>Beneficio del periodo</small><strong className={tone(periodProfit)}>{signedCurrency(periodProfit)}</strong><small>TWR compuesto</small><strong className={tone(periodTwr)}>{signedPercent(periodTwr)}</strong></div>
        </header>
        <div className="apex-table" role="table" aria-label="Matriz de inspección cronológica">
          <div className="apex-row apex-row-head" role="row"><span>Periodo auditado</span><span>Saldo inicial</span><span>Aportaciones</span><span>Retiradas</span><span>Beneficio neto</span><span>Rentabilidad</span><span>Saldo de cierre</span><span>Detalle</span></div>
          {visibleMonths.map((month) => {
            const hasDetail = Boolean(month.breakdown || month.increments || month.decrements);
            const isOpen = openMonthKey === month.key;
            return (
              <React.Fragment key={month.key}>
                <div
                  className={`apex-row${month.key === focusKey ? ' is-selected' : ''}`}
                  role="row"
                  ref={(node) => { if (node) rowRefs.current.set(month.key, node); else rowRefs.current.delete(month.key); }}
                  onClick={() => { setFocusKey(month.key); if (hasDetail) setOpenMonthKey(isOpen ? null : month.key); }}
                >
                  <span data-label="Periodo"><b>{month.label}</b></span>
                  <span data-label="Saldo inicial">{formatCurrency(month.opening)}</span>
                  <span data-label="Aportaciones" className="is-inflow">{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</span>
                  <span data-label="Retiradas" className="is-outflow">{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</span>
                  <span data-label="Beneficio" className={tone(month.profit)}>{signedCurrency(month.profit)}</span>
                  <span data-label="Rentabilidad" className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</span>
                  <span data-label="Saldo de cierre"><b>{formatCurrency(month.balance)}</b></span>
                  <span data-label="Detalle"><button type="button" disabled={!hasDetail} aria-expanded={isOpen} aria-label={`${isOpen ? 'Cerrar' : 'Abrir'} detalle de ${month.label}`}>{hasDetail ? (isOpen ? '−' : '+') : '·'}</button></span>
                </div>
                {isOpen ? (
                  <div className="apex-tranche" role="row">
                    <div className="apex-tranche-intro"><span>Conciliación intrames</span><strong>{month.label}</strong><small>Distribución exacta del beneficio entre posición inicial y flujos registrados.</small></div>
                    <div className="apex-tranche-lines">
                      <article><span>Posición inicial del mes</span><b>{formatCurrency(month.breakdown?.initialCapital ?? month.opening)}</b><b>{signedPercent(month.breakdown ? month.breakdown.initialReturnPct * 100 : month.returnPct)}</b><strong>{signedCurrency(month.breakdown?.initialProfit ?? month.profit)}</strong></article>
                      {(month.breakdown?.contributions ?? []).map((item) => <article key={`in-${item.iso}-${item.amount}`}><span>Aportación · {formatDate(item.iso)}</span><b>{formatCurrency(item.amount)}</b><b>{signedPercent(item.returnPct * 100)}</b><strong>{signedCurrency(item.profit)}</strong></article>)}
                      {(month.breakdown?.withdrawals ?? []).map((item) => <article key={`out-${item.iso}-${item.amount}`}><span>Retirada · {formatDate(item.iso)}</span><b>{formatCurrency(item.amount)}</b><b>{signedPercent((item.returnPct ?? 0) * 100)}</b><strong>{signedCurrency(item.profit)}</strong></article>)}
                      {!month.breakdown && month.increments > 0 ? <article><span>Aportaciones registradas en el mes</span><b>{formatCurrency(month.increments)}</b><b>—</b><strong>Incluidas en cierre</strong></article> : null}
                      {!month.breakdown && month.decrements > 0 ? <article><span>Retiradas registradas en el mes</span><b>{formatCurrency(month.decrements)}</b><b>—</b><strong>Incluidas en cierre</strong></article> : null}
                    </div>
                    <div className="apex-tranche-seal">Conciliación del cierre · Base + flujos + rendimiento = {formatCurrency(month.balance)}</div>
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <footer className={`apex-crypt-seal${reconciliationOk ? ' is-verified' : ' is-review'}`}>
        <div className="apex-seal-mark" aria-hidden="true"><span>A</span><i /></div>
        <div><span>Cuadre matemático de cartera</span><strong>Saldo inicial + aportaciones − retiradas + beneficio = saldo final</strong><small>{firstMonth ? `${formatCurrency(firstMonth.opening)} + ${formatCurrency(periodIncrements)} − ${formatCurrency(periodDecrements)} + ${formatCurrency(periodProfit)} = ${formatCurrency(reconciled)}` : 'Sin cierres suficientes para conciliar.'}</small></div>
        <div><span>Discrepancia</span><strong>{formatCurrency(Math.abs(discrepancy))}</strong><small>{reconciliationOk ? 'Conciliación verificada' : 'Revisión documental requerida'}</small></div>
      </footer>

      <p className="apex-authorship">Diseño conceptual: Gemini 3.8 Flash · Implementación fiel HORIZONTE APEX</p>
    </div>
  );
};
