import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './ChronosOrbitReportPage.css';

interface ChronosPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface ChronosOrbitReportPageProps {
  report: ReportData;
  pendingCashMovements?: ChronosPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface ChronosMonth {
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
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

interface OrbitCoordinate extends ChronosMonth {
  x: number;
  y: number;
  angle: number;
  radius: number;
  index: number;
}

type ChronosPeriod = '12m' | 'all' | string;

const CENTER = 380;
const BASE_RADIUS = 128;
const MONTH_RADIAL_STEP = 11.5;

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

const signedMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '−'}${formatCurrency(Math.abs(safe))}`;
};

const signedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '−'}${Math.abs(safe).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const sumByType = (
  movements: Array<{ type: string; amount: number }>,
  type: 'increment' | 'decrement'
) => movements.filter((movement) => movement.type === type)
  .reduce((sum, movement) => sum + movement.amount, 0);

const polarPoint = (radius: number, degrees: number) => {
  const radians = degrees * Math.PI / 180;
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius
  };
};

const smoothPath = (points: OrbitCoordinate[]) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    const midY = (previous.y + point.y) / 2;
    return `${path} Q ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}${index === points.length - 1 ? ` T ${point.x.toFixed(2)} ${point.y.toFixed(2)}` : ''}`;
  }, '');
};

export const ChronosOrbitReportPage: React.FC<ChronosOrbitReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const pendingMovements = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumByType(pendingMovements, 'increment');
  const pendingDecrements = sumByType(pendingMovements, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleCapital = report.incrementos + pendingIncrements - report.decrementos - pendingDecrements;

  const months = useMemo<ChronosMonth[]>(() => {
    const stats = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = stats.length ? monthToKey(stats[stats.length - 1].month) : '';
    const breakdowns = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );

    return stats.map((month) => {
      const key = monthToKey(month.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumByType(movements, 'increment');
      const decrements = sumByType(movements, 'decrement');
      const profit = Number.isFinite(month.profit) ? month.profit : 0;
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        year: key.slice(0, 4),
        balance,
        openingBalance: balance - profit - increments + decrements,
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(month.profitPct) ? month.profitPct : 0,
        increments,
        decrements,
        movements,
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const years = useMemo(() => [...new Set(months.map((month) => month.year))], [months]);
  const [period, setPeriod] = useState<ChronosPeriod>('all');
  const [activeMonthKey, setActiveMonthKey] = useState(latestKey);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isTableView, setIsTableView] = useState(false);
  const dragState = useRef<{ angle: number; index: number } | null>(null);

  useEffect(() => {
    setPeriod('all');
    setActiveMonthKey(latestKey);
    setZoomLevel(1);
    setIsTableView(false);
  }, [latestKey, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (period === 'all') return months;
    if (period === '12m') return months.slice(-12);
    return months.filter((month) => month.year === period);
  }, [months, period]);

  useEffect(() => {
    if (!visibleMonths.length) return;
    if (!visibleMonths.some((month) => month.key === activeMonthKey)) {
      setActiveMonthKey(visibleMonths[visibleMonths.length - 1].key);
    }
  }, [activeMonthKey, visibleMonths]);

  const activeIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === activeMonthKey));
  const activeMonth = visibleMonths[activeIndex] ?? visibleMonths[visibleMonths.length - 1];
  const activeAngle = visibleMonths.length ? -90 + activeIndex * 30 : -90;
  const orbitRotation = -90 - activeAngle;
  const maxBalance = Math.max(1, ...visibleMonths.map((month) => month.balance));
  const minBalance = Math.min(...visibleMonths.map((month) => month.balance));
  const balanceSpan = Math.max(1, maxBalance - minBalance);

  const coordinates = useMemo<OrbitCoordinate[]>(() => visibleMonths.map((month, index) => {
    const angle = -90 + index * 30;
    const balanceLift = (month.balance - minBalance) / balanceSpan * 28;
    const radius = BASE_RADIUS + index * MONTH_RADIAL_STEP + balanceLift;
    return { ...month, ...polarPoint(radius, angle), radius, angle, index };
  }), [balanceSpan, minBalance, visibleMonths]);
  const orbitPath = smoothPath(coordinates);

  const setFocusedMonth = useCallback((key: string, source: string) => {
    setActiveMonthKey(key);
    onAnalyticsEvent?.({
      type: 'chronos_month_focus',
      label: key,
      metadata: { source }
    });
  }, [onAnalyticsEvent]);

  const stepMonth = useCallback((direction: number) => {
    if (!visibleMonths.length) return;
    const currentIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === activeMonthKey));
    const nextIndex = Math.min(visibleMonths.length - 1, Math.max(0, currentIndex + direction));
    setFocusedMonth(visibleMonths[nextIndex].key, 'step');
  }, [activeMonthKey, setFocusedMonth, visibleMonths]);

  const pointerAngle = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    return Math.atan2(y, x) * 180 / Math.PI;
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { angle: pointerAngle(event), index: activeIndex };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState.current || !visibleMonths.length) return;
    const delta = pointerAngle(event) - dragState.current.angle;
    const nextIndex = Math.min(
      visibleMonths.length - 1,
      Math.max(0, dragState.current.index - Math.round(delta / 30))
    );
    if (visibleMonths[nextIndex].key !== activeMonthKey) setFocusedMonth(visibleMonths[nextIndex].key, 'dial');
  };

  const stopPointerDrag = () => {
    dragState.current = null;
  };

  const onOrbitKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepMonth(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stepMonth(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setZoomLevel((value) => Math.min(1.25, value + 0.05)); }
    if (event.key === 'ArrowDown') { event.preventDefault(); setZoomLevel((value) => Math.max(0.8, value - 0.05)); }
  };

  const capitalNet = report.incrementos - report.decrementos;
  const expansionRatio = capitalNet ? report.beneficioTotal / capitalNet * 100 : 0;
  const twrValue = Number.isFinite(report.twrYtd) ? (report.twrYtd ?? 0) * 100 : 0;
  const reconciled = Math.abs(visibleCapital + report.beneficioTotal - visibleBalance) <= 0.02;
  const activeDifference = activeMonth
    ? activeMonth.openingBalance + activeMonth.increments - activeMonth.decrements + activeMonth.profit - activeMonth.balance
    : 0;
  const activeBreakdown = activeMonth?.breakdown;
  const allPublishedMovements = report.movements ?? [];
  const totalEvents = allPublishedMovements.length + pendingMovements.length;

  return (
    <article className="chronos-report" ref={rootRef}>
      <header className="chronos-header">
        <div className="chronos-brand">
          <span className="chronos-brand-mark" aria-hidden="true"><i /><b>CO</b></span>
          <div><small>Temporal Wealth Platform</small><strong>Chronos Orbit</strong></div>
        </div>
        <div className="chronos-header-copy">
          <span>El tiempo de tu patrimonio, medido ciclo a ciclo</span>
          <small>{report.clientCode} · EUR · {reconciled ? 'Conciliado' : 'En revisión'}</small>
        </div>
        <button type="button" className="chronos-download" onClick={() => { onAnalyticsEvent?.({ type: 'chronos_pdf_download', label: 'PDF Chronos Orbit' }); void onDownload?.(); }}>
          <span aria-hidden="true">⇩</span> Descargar PDF
        </button>
      </header>

      <section className="chronos-command-deck" aria-label="Control temporal del informe">
        <div className="chronos-period-copy"><small>Horizonte orbital</small><strong>{visibleMonths[0]?.shortLabel ?? 'Sin datos'} — {visibleMonths[visibleMonths.length - 1]?.shortLabel ?? 'Sin datos'}</strong></div>
        <div className="chronos-periods" role="group" aria-label="Seleccionar horizonte temporal">
          <button type="button" className={period === '12m' ? 'is-active' : ''} onClick={() => setPeriod('12m')}>Últimos 12 meses</button>
          {years.map((year) => <button type="button" key={year} className={period === year ? 'is-active' : ''} onClick={() => setPeriod(year)}>Año {year}</button>)}
          <button type="button" className={period === 'all' ? 'is-active' : ''} onClick={() => setPeriod('all')}>Todo el horizonte</button>
        </div>
        <button type="button" className="chronos-table-toggle" aria-pressed={isTableView} onClick={() => { setIsTableView((value) => !value); onAnalyticsEvent?.({ type: 'chronos_view_toggle', label: isTableView ? 'Vista orbital' : 'Vista tabular' }); }}>
          {isTableView ? 'Volver a la órbita' : 'Ver formato tabular'}
        </button>
      </section>

      <section className="chronos-hero" aria-label="Cámara temporal del patrimonio">
        <div className="chronos-orbit-panel">
          <div className="chronos-panel-heading">
            <div><small>Cámara temporal</small><h2>Órbita patrimonial</h2><p>Cada estación representa un cierre mensual. La distancia recorrida muestra cuánto tiempo lleva madurando el patrimonio.</p></div>
            <div className="chronos-zoom" role="group" aria-label="Zoom orbital"><button type="button" onClick={() => setZoomLevel((value) => Math.max(0.8, value - 0.05))} aria-label="Alejar órbita">−</button><span>{Math.round(zoomLevel * 100)}%</span><button type="button" onClick={() => setZoomLevel((value) => Math.min(1.25, value + 0.05))} aria-label="Acercar órbita">+</button></div>
          </div>

          {isTableView ? (
            <div className="chronos-linear-table" role="table" aria-label="Histórico mensual tradicional">
              <div className="chronos-linear-row is-head" role="row"><span>Mes</span><span>Saldo</span><span>Beneficio</span><span>TWR</span><span>Flujos</span></div>
              {[...visibleMonths].reverse().map((month) => <button type="button" role="row" key={month.key} className={`chronos-linear-row ${month.key === activeMonth?.key ? 'is-active' : ''}`} onClick={() => { setFocusedMonth(month.key, 'table'); setIsTableView(false); }}><span>{month.label}</span><span>{formatCurrency(month.balance)}</span><span className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.profit)}</span><span className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(month.returnPct)}</span><span>{month.increments ? `+${formatCurrency(month.increments)}` : month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</span></button>)}
            </div>
          ) : (
            <div className="chronos-orbit-stage">
              <svg className="chronos-orbit-svg" viewBox="0 0 760 760" role="application" aria-label="Órbita patrimonial interactiva. Usa las flechas izquierda y derecha para cambiar de mes, y arriba o abajo para controlar el zoom." tabIndex={0} onKeyDown={onOrbitKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopPointerDrag} onPointerCancel={stopPointerDrag}>
                <defs>
                  <radialGradient id="chronos-core-gradient"><stop offset="0" stopColor="#e2b714" stopOpacity="0.34" /><stop offset="0.52" stopColor="#e2b714" stopOpacity="0.08" /><stop offset="1" stopColor="#06080b" stopOpacity="0" /></radialGradient>
                  <linearGradient id="chronos-line-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#50657e" /><stop offset="0.55" stopColor="#00f5d4" /><stop offset="1" stopColor="#e2b714" /></linearGradient>
                  <filter id="chronos-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  <marker id="chronos-in-arrow" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#00f5d4" /></marker>
                  <marker id="chronos-out-arrow" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#f72585" /></marker>
                </defs>
                <g className="chronos-grid" transform={`scale(${zoomLevel})`} style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}>
                  {[89, 144, 199, 254, 309].map((radius, index) => <circle key={radius} cx={CENTER} cy={CENTER} r={radius} className={index % 2 ? 'is-major' : ''} />)}
                  {Array.from({ length: 12 }, (_, index) => {
                    const outer = polarPoint(322, -90 + index * 30);
                    const inner = polarPoint(82, -90 + index * 30);
                    return <line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
                  })}
                </g>
                <g className="chronos-orbit-system" transform={`rotate(${orbitRotation} ${CENTER} ${CENTER}) scale(${zoomLevel})`} style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}>
                  <path className="chronos-orbit-shadow" d={orbitPath} />
                  <path className="chronos-orbit-line" d={orbitPath} />
                  {coordinates.map((point) => {
                    const hasIncrement = point.increments > 0;
                    const hasDecrement = point.decrements > 0;
                    const vectorStart = polarPoint(point.radius + 58, point.angle);
                    const vectorEnd = polarPoint(point.radius + 14, point.angle);
                    const outEnd = polarPoint(point.radius + 63, point.angle);
                    const focused = point.key === activeMonth?.key;
                    return <g key={point.key} className={`chronos-station ${focused ? 'is-active' : ''}`} role="button" tabIndex={0} aria-label={`${point.label}. Saldo ${formatCurrency(point.balance)}. Rentabilidad ${signedPercent(point.returnPct)}.`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setFocusedMonth(point.key, 'orbit')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocusedMonth(point.key, 'orbit-keyboard'); } }}>
                      {hasIncrement ? <line className="chronos-vector is-injection" x1={vectorStart.x} y1={vectorStart.y} x2={vectorEnd.x} y2={vectorEnd.y} markerEnd="url(#chronos-in-arrow)" /> : null}
                      {hasDecrement ? <line className="chronos-vector is-extraction" x1={point.x} y1={point.y} x2={outEnd.x} y2={outEnd.y} markerEnd="url(#chronos-out-arrow)" /> : null}
                      <circle className="chronos-station-halo" cx={point.x} cy={point.y} r={focused ? 17 : point.movements.length ? 11 : 7} />
                      <circle className={`chronos-station-node ${point.returnPct < 0 ? 'is-negative' : ''}`} cx={point.x} cy={point.y} r={focused ? 7.5 : 4.5} />
                      <g transform={`rotate(${-orbitRotation} ${point.x} ${point.y})`}><text className="chronos-station-label" x={point.x} y={point.y - 18} textAnchor="middle">{point.shortLabel}</text>{point.movements.length ? <text className="chronos-station-event" x={point.x} y={point.y + 24} textAnchor="middle">{hasIncrement ? `+${Math.round(point.increments / 1000)}k` : `−${Math.round(point.decrements / 1000)}k`}</text> : null}</g>
                    </g>;
                  })}
                </g>
                <g className="chronos-core" aria-hidden="true"><circle cx={CENTER} cy={CENTER} r="112" fill="url(#chronos-core-gradient)" /><circle cx={CENTER} cy={CENTER} r="72" /><text x={CENTER} y={CENTER - 26} textAnchor="middle">SALDO ACTUAL</text><text className="chronos-core-balance" x={CENTER} y={CENTER + 6} textAnchor="middle">{formatCurrency(visibleBalance)}</text><text className="chronos-core-meta" x={CENTER} y={CENTER + 37} textAnchor="middle">TWR {signedPercent(twrValue)}</text></g>
                {pendingMovements.length ? <g className="chronos-pending-orbit" aria-hidden="true"><circle cx={CENTER} cy={CENTER} r="331" /><text x={CENTER} y="34" textAnchor="middle">ÓRBITA PROVISIONAL · {signedMoney(pendingIncrements - pendingDecrements)}</text></g> : null}
              </svg>
              <div className="chronos-orbit-legend"><span><i className="is-route" /> Trayectoria patrimonial</span><span><i className="is-injection" /> Aportación</span><span><i className="is-extraction" /> Retirada</span><span><i className="is-pending" /> Movimiento posterior al cierre</span></div>
              <div className="chronos-dial-controls"><button type="button" onClick={() => stepMonth(-1)} disabled={activeIndex <= 0}>← Mes anterior</button><span><small>Estación activa</small><strong>{activeMonth?.label ?? 'Sin datos'}</strong></span><button type="button" onClick={() => stepMonth(1)} disabled={activeIndex >= visibleMonths.length - 1}>Mes siguiente →</button></div>
            </div>
          )}
        </div>

        <aside className="chronos-telemetry" aria-label="Telemetría patrimonial">
          <div className="chronos-core-card"><small>Núcleo de masa patrimonial</small><strong>{formatCurrency(visibleBalance)}</strong><p>Valor actual de la cartera, incluidos los movimientos de capital posteriores al último cierre publicado.</p><div><span>Beneficio acumulado <b className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</b></span><span>Capital neto <b>{formatCurrency(visibleCapital)}</b></span></div></div>
          <div className="chronos-kpi-grid">
            <article><small>Velocidad pura · TWR</small><strong className={twrValue >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(twrValue)}</strong><p>Rendimiento de la estrategia aislando aportaciones y retiradas.</p></article>
            <article><small>Expansión sobre capital neto</small><strong className={expansionRatio >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(expansionRatio)}</strong><p>Beneficio acumulado frente al capital neto aportado.</p></article>
            <article><small>Último ciclo mensual</small><strong className={report.rentabilidadUltimoMes >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(report.rentabilidadUltimoMes)}</strong><p>{signedMoney(report.beneficioUltimoMes)} generados en {months[months.length - 1]?.label ?? 'el último cierre'}.</p></article>
            <article><small>Eventos de capital</small><strong>{totalEvents}</strong><p>{allPublishedMovements.length} publicados{pendingMovements.length ? ` · ${pendingMovements.length} posteriores al cierre` : ''}.</p></article>
          </div>
          <section className="chronos-method-box"><header><span aria-hidden="true">◎</span><strong>Cómo leer la órbita</strong></header><p>El centro muestra la posición actual. Cada estación es un cierre mensual; los vectores turquesa incorporan capital y los magenta representan retiradas. El TWR mide únicamente el comportamiento de la inversión.</p></section>
        </aside>
      </section>

      {activeMonth ? <section className="chronos-probe" aria-live="polite">
        <header><div><small>Sonda temporal activa</small><h2>{activeMonth.label}</h2><p>Conciliación exacta del ciclo seleccionado.</p></div><span className={Math.abs(activeDifference) <= 0.02 ? 'is-ok' : 'is-review'}>{Math.abs(activeDifference) <= 0.02 ? 'Ciclo conciliado' : `Diferencia ${formatCurrency(activeDifference)}`}</span></header>
        <div className="chronos-probe-equation"><article><small>Saldo inicial</small><strong>{formatCurrency(activeMonth.openingBalance)}</strong></article><b>+</b><article><small>Aportaciones</small><strong className="is-injection">{activeMonth.increments ? `+${formatCurrency(activeMonth.increments)}` : '—'}</strong></article><b>−</b><article><small>Retiradas</small><strong className="is-extraction">{activeMonth.decrements ? `−${formatCurrency(activeMonth.decrements)}` : '—'}</strong></article><b>+</b><article><small>Beneficio del ciclo</small><strong className={activeMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(activeMonth.profit)}</strong></article><b>=</b><article className="is-final"><small>Saldo al cierre</small><strong>{formatCurrency(activeMonth.balance)}</strong></article></div>
        <div className="chronos-probe-data"><article><small>Rentabilidad mensual</small><strong className={activeMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(activeMonth.returnPct)}</strong><p>Rentabilidad aplicada al capital que permaneció invertido durante el ciclo.</p></article><article><small>Variación patrimonial</small><strong>{signedMoney(activeMonth.balance - activeMonth.openingBalance)}</strong><p>Incluye movimientos de capital y resultado de inversión.</p></article><article><small>Movimientos del ciclo</small><strong>{activeMonth.movements.length}</strong><p>{activeMonth.movements.length ? 'Consulta cada evento en el registro inferior.' : 'El ciclo refleja únicamente evolución de mercado.'}</p></article></div>
        {activeBreakdown ? <div className="chronos-tranches"><h3>Órbitas de capital dentro del mes</h3><div><article><span>Posición inicial del ciclo</span><strong>{formatCurrency(activeBreakdown.initialCapital)}</strong><small>{signedPercent(activeBreakdown.initialReturnPct * 100)} · {signedMoney(activeBreakdown.initialProfit)}</small></article>{activeBreakdown.contributions.map((item, index) => <article key={`${item.iso}-${index}`}><span>Aportación incorporada el {formatDate(item.iso)}</span><strong>+{formatCurrency(item.amount)}</strong><small>{signedPercent(item.returnPct * 100)} · {signedMoney(item.profit)}</small></article>)}{(activeBreakdown.withdrawals ?? []).map((item, index) => <article key={`${item.iso}-${index}`}><span>Posición retirada el {formatDate(item.iso)}</span><strong>−{formatCurrency(item.amount)}</strong><small>{item.returnPct === undefined ? 'Rentabilidad incluida en el ciclo' : `${signedPercent(item.returnPct * 100)} · ${signedMoney(item.profit)}`}</small></article>)}<article className="is-total"><span>Beneficio explicado</span><strong>{signedMoney(activeBreakdown.totalProfit)}</strong><small>Resultado agregado de todos los tramos</small></article></div></div> : null}
      </section> : null}

      <section className="chronos-flow-chronicle">
        <header><div><small>Registro de eventos orbitales</small><h2>Aportaciones y retiradas</h2><p>Movimientos de capital que modifican el valor de la cartera, separados del rendimiento.</p></div><strong>{totalEvents} eventos</strong></header>
        <div className="chronos-flow-grid">{allPublishedMovements.map((movement, index) => <article key={`${movement.iso}-${index}`} className={movement.type === 'increment' ? 'is-injection' : 'is-extraction'}><time>{formatDate(movement.iso)}</time><div><small>{movement.type === 'increment' ? 'Aportación de capital' : 'Retirada de capital'}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>Saldo tras el movimiento: {formatCurrency(movement.balance)}</span></div><i>{movement.type === 'increment' ? '↘' : '↗'}</i></article>)}{pendingMovements.map((movement, index) => <article key={`pending-${movement.iso}-${index}`} className="is-pending"><time>{formatDate(movement.iso)}</time><div><small>{movement.type === 'increment' ? 'Aportación posterior al cierre' : 'Retirada posterior al cierre'}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>Se incorporará al rendimiento cuando se publique el próximo cierre.</span></div><i>◌</i></article>)}</div>
      </section>

      <footer className="chronos-audit-footer">
        <div><small>Conciliación patrimonial</small><span><b>Capital neto</b><strong>{formatCurrency(visibleCapital)}</strong></span><em>+</em><span><b>Beneficio acumulado</b><strong>{signedMoney(report.beneficioTotal)}</strong></span><em>=</em><span className="is-final"><b>Valor actual de cartera</b><strong>{formatCurrency(visibleBalance)}</strong></span><mark>{reconciled ? 'Cuadre exacto al céntimo' : 'Revisar conciliación'}</mark></div>
        <p>Metodología basada en TWR y conciliación de flujos de capital registrados. Los movimientos posteriores al cierre actualizan el valor visible, pero no generan rentabilidad hasta su publicación.</p>
      </footer>
    </article>
  );
};
