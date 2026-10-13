import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './PulseReportPage.css';

interface PulsePendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface PulseReportPageProps {
  report: ReportData;
  pendingCashMovements?: PulsePendingMovement[];
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

interface PulseMonth {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  opening: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = '6m' | '12m' | 'all' | 'custom';
type FullscreenView = 'balance' | 'return' | 'both';

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
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES');
};

const signedMoney = (value: number) => {
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

const compactMoney = (value: number) => `${new Intl.NumberFormat('es-ES', {
  notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  maximumFractionDigits: 0
}).format(value)} €`;

const sumMovements = (
  movements: Array<{ type: string; amount: number }>,
  type: 'increment' | 'decrement'
) => movements.filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const Gauge: React.FC<{ label: string; value: number; scale: number }> = ({ label, value, scale }) => {
  const pathLength = 236;
  const ratio = Math.min(1, Math.abs(value) / Math.max(scale, 1));
  return (
    <article className={`pulse-gauge ${value < 0 ? 'is-negative' : ''}`}>
      <svg viewBox="0 0 190 112" aria-hidden="true">
        <path className="pulse-gauge-track" d="M 20 96 A 75 75 0 0 1 170 96" pathLength={pathLength} />
        <path className="pulse-gauge-value" d="M 20 96 A 75 75 0 0 1 170 96" pathLength={pathLength} strokeDasharray={`${pathLength * ratio} ${pathLength}`} />
        {[0, 1, 2, 3, 4, 5, 6].map((tick) => {
          const angle = Math.PI - tick / 6 * Math.PI;
          const x1 = 95 + Math.cos(angle) * 68;
          const y1 = 96 - Math.sin(angle) * 68;
          const x2 = 95 + Math.cos(angle) * 75;
          const y2 = 96 - Math.sin(angle) * 75;
          return <line key={tick} className="pulse-gauge-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>
      <div><small>{label}</small><strong>{signedPercent(value)}</strong><span>−{scale}% · 0 · +{scale}%</span></div>
    </article>
  );
};

export const PulseReportPage: React.FC<PulseReportPageProps> = ({
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

  const months = useMemo<PulseMonth[]>(() => {
    const breakdowns = new Map(
      (report.contributionBreakdowns ?? []).map((breakdown) => [monthToKey(breakdown.month), breakdown])
    );
    const available = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(available[available.length - 1]?.month ?? '');
    return available.map((month) => {
      const key = monthToKey(month.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(movements, 'increment');
      const decrements = sumMovements(movements, 'decrement');
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const profit = Number.isFinite(month.profit) ? month.profit : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        balance,
        opening: balance - profit - increments + decrements,
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
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<FullscreenView>('balance');
  const monitorScrollRef = useRef<HTMLDivElement>(null);
  const barogramScrollRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setIsFullscreen(false);
    setFullscreenView('balance');
  }, [latestKey, months, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey)
    ?? visibleMonths[visibleMonths.length - 1];
  const focusedIndex = visibleMonths.findIndex((month) => month.key === focusedMonth?.key);
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodLabel = visibleMonths.length
    ? `${visibleMonths[0].shortLabel} — ${visibleMonths[visibleMonths.length - 1].shortLabel}`
    : 'Sin cierres registrados';

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusedKey)) {
      setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
    }
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      [monitorScrollRef.current, barogramScrollRef.current, tapeRef.current].forEach((element) => {
        if (element) element.scrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [period, visibleMonths.length]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [isFullscreen]);

  const focusMonth = useCallback((key: string, source: string) => {
    setFocusedKey(key);
    onAnalyticsEvent?.({ type: 'pulse_month_focus', label: key, metadata: { source } });
  }, [onAnalyticsEvent]);

  const stepFocus = (direction: -1 | 1) => {
    const month = visibleMonths[focusedIndex + direction];
    if (month) focusMonth(month.key, 'keyboard');
  };

  const graph = useMemo(() => {
    const width = Math.max(820, visibleMonths.length * 76);
    const left = 58;
    const right = width - 28;
    const seismoBaseline = 82;
    const maxReturn = Math.max(1, ...visibleMonths.map((month) => Math.abs(month.returnPct)));
    const chartTop = 28;
    const chartBottom = 238;
    const maxBalance = Math.max(1, ...visibleMonths.map((month) => month.balance)) * 1.08;
    const x = (index: number) => visibleMonths.length === 1
      ? (left + right) / 2
      : left + index / (visibleMonths.length - 1) * (right - left);
    const balanceY = (value: number) => chartBottom - Math.max(0, value) / maxBalance * (chartBottom - chartTop);
    const points = visibleMonths.map((month, index) => ({
      month,
      x: x(index),
      balanceY: balanceY(month.balance),
      returnY: seismoBaseline - month.returnPct / maxReturn * 58
    }));
    const balanceLine = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.balanceY}`).join(' ');
    const balanceArea = points.length
      ? `${balanceLine} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`
      : '';
    return { width, left, right, chartTop, chartBottom, maxBalance, seismoBaseline, points, balanceLine, balanceArea };
  }, [visibleMonths]);

  const focusedGraphPoint = graph.points.find((point) => point.month.key === focusedMonth?.key);
  const focusedMovementCount = focusedMonth?.movements.length ?? 0;
  const monthNarrative = focusedMonth
    ? `En ${focusedMonth.label}, la cartera ${focusedMonth.profit >= 0 ? 'generó' : 'registró'} ${formatCurrency(Math.abs(focusedMonth.profit))} ${focusedMonth.profit >= 0 ? 'de beneficio' : 'de resultado negativo'}, con una rentabilidad TWR de ${signedPercent(focusedMonth.returnPct)}${focusedMovementCount ? ` y ${focusedMovementCount} movimiento${focusedMovementCount === 1 ? '' : 's'} de capital` : ''}.`
    : 'La lectura mensual aparecerá tras el primer cierre publicado.';

  const gaugeScale = Math.max(8, Math.ceil(Math.abs(report.rentabilidadUltimoMes)), Math.ceil(Math.abs((report.twrYtd ?? 0) * 100)));
  const allMovements = useMemo(() => [
    ...(report.movements ?? []).map((movement) => ({ ...movement, pending: false })),
    ...pending.map((movement) => ({ ...movement, balance: 0, returnPct: undefined, pending: true }))
  ].sort((left, right) => right.iso.localeCompare(left.iso)), [pending, report.movements]);
  const reconciliation = focusedMonth
    ? focusedMonth.opening + focusedMonth.increments - focusedMonth.decrements + focusedMonth.profit
    : 0;

  const renderSeismographGraphic = (attachScrollRef = false) => (
    <div className="pulse-monitor-scroll" ref={attachScrollRef ? monitorScrollRef : undefined}>
      <svg className="pulse-seismograph-graphic" viewBox={`0 0 ${graph.width} 164`} style={{ minWidth: `${graph.width}px` }} role="application" tabIndex={0} aria-label={`Sismógrafo de rentabilidad de ${periodLabel}`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } }}>
        <line className="pulse-seismo-baseline" x1={graph.left} x2={graph.right} y1={graph.seismoBaseline} y2={graph.seismoBaseline} />
        {focusedGraphPoint ? <line className="pulse-scan-line" x1={focusedGraphPoint.x} x2={focusedGraphPoint.x} y1="16" y2="132" /> : null}
        {graph.points.map((point) => <g key={point.month.key} className={`pulse-spike${point.month.returnPct < 0 ? ' is-negative' : ''}${point.month.key === focusedMonth?.key ? ' is-active' : ''}`} role="button" tabIndex={0} onClick={() => focusMonth(point.month.key, 'seismograph')}><line x1={point.x} x2={point.x} y1={graph.seismoBaseline} y2={point.returnY} /><circle cx={point.x} cy={point.returnY} r="4" /><text x={point.x} y={point.returnY + (point.month.returnPct >= 0 ? -10 : 16)} textAnchor="middle">{signedPercent(point.month.returnPct)}</text><text className="pulse-axis-month" x={point.x} y="147" textAnchor="middle">{point.month.shortLabel}</text></g>)}
      </svg>
    </div>
  );

  const renderBarogramGraphic = (attachScrollRef = false) => (
    <div className="pulse-monitor-scroll" ref={attachScrollRef ? barogramScrollRef : undefined}>
      <svg className="pulse-barogram" viewBox={`0 0 ${graph.width} 286`} style={{ minWidth: `${graph.width}px` }} role="application" tabIndex={0} aria-label={`Evolución del saldo de ${periodLabel}`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } }}>
        <defs><linearGradient id="pulse-balance-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4cc9f0" stopOpacity=".28" /><stop offset="1" stopColor="#4cc9f0" stopOpacity="0" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map((ratio) => { const y = graph.chartBottom - ratio * (graph.chartBottom - graph.chartTop); return <g className="pulse-bar-grid" key={ratio}><line x1={graph.left} x2={graph.right} y1={y} y2={y} /><text x={graph.left - 9} y={y + 4} textAnchor="end">{compactMoney(graph.maxBalance * ratio)}</text></g>; })}
        <path className="pulse-balance-area" d={graph.balanceArea} />
        <path className="pulse-balance-line" d={graph.balanceLine} />
        {focusedGraphPoint ? <line className="pulse-scan-line" x1={focusedGraphPoint.x} x2={focusedGraphPoint.x} y1={graph.chartTop} y2={graph.chartBottom} /> : null}
        {graph.points.flatMap((point) => point.month.movements.map((movement, index) => { const offset = (index - (point.month.movements.length - 1) / 2) * 18; return <g key={`${movement.iso}-${index}`} className={`pulse-flow is-${movement.type}`} transform={`translate(${point.x + offset} ${point.balanceY})`}><line y1="-6" y2="-30" /><path d={movement.type === 'increment' ? 'M -5 -25 L 0 -34 L 5 -25 Z' : 'M -5 -34 L 0 -25 L 5 -34 Z'} /></g>; }))}
        {graph.points.map((point) => <g key={point.month.key} className={point.month.key === focusedMonth?.key ? 'pulse-balance-point is-active' : 'pulse-balance-point'} role="button" tabIndex={0} onClick={() => focusMonth(point.month.key, 'barogram')}><circle cx={point.x} cy={point.balanceY} r={point.month.key === focusedMonth?.key ? 6 : 4} /><text x={point.x} y={point.balanceY + (graph.points.indexOf(point) % 2 ? 21 : -12)} textAnchor="middle">{compactMoney(point.month.balance)}</text><text className="pulse-axis-month" x={point.x} y="267" textAnchor="middle">{point.month.shortLabel}</text></g>)}
      </svg>
    </div>
  );

  return (
    <div className={`pulse-report ${isFullscreen ? 'has-fullscreen' : ''}`} ref={rootRef} role="document">
      <header className="pulse-header">
        <div className="pulse-wordmark"><span className="pulse-record-dot" /><div><small>JIGSA CAPITAL · REGISTRO PATRIMONIAL</small><h1>PULSO</h1><p>Sismógrafo privado de capital</p></div></div>
        <div className="pulse-header-actions"><span><small>TRANSMISIÓN</small><strong>EN DIRECTO · {report.clientCode}</strong></span><button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'pulse_pdf_download', label: periodLabel }); void onDownload?.(); }}>DESCARGAR PDF <b>↓</b></button></div>
      </header>

      {pending.length ? <section className="pulse-pending" role="status"><div><span className="pulse-pending-light" /><p><small>ACTUALIZACIÓN DE CAPITAL</small><strong>Movimientos posteriores al último cierre publicado</strong></p></div><div>{pending.map((movement, index) => <span key={`${movement.iso}-${index}`}><small>{formatDate(movement.iso)}</small><strong className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></span>)}</div></section> : null}

      <main className="pulse-console">
        <aside className="pulse-instruments" aria-label="Instrumentos principales">
          <article className="pulse-odometer"><small>SALDO ACTUAL</small><strong>{formatCurrency(visibleBalance)}</strong><span>Último cierre {monthLabel(latestKey)}{pending.length ? ' + capital actualizado' : ''}</span></article>
          <Gauge label={`TWR ${monthLabel(latestKey)}`} value={report.rentabilidadUltimoMes} scale={gaugeScale} />
          <Gauge label="TWR ACUMULADO" value={(report.twrYtd ?? 0) * 100} scale={Math.max(gaugeScale, 25)} />
          <div className="pulse-status-grid"><span><small>BENEFICIO ACUMULADO</small><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong></span><span><small>BENEFICIO ÚLTIMO MES</small><strong className={report.beneficioUltimoMes >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioUltimoMes)}</strong></span></div>
        </aside>

        <section className="pulse-monitor" aria-label="Monitor patrimonial">
          <div className="pulse-monitor-title"><div><span className="pulse-live-signal" />SEÑAL FINANCIERA</div><strong>{periodLabel}</strong></div>
          <p className="pulse-auto-summary" aria-live="polite">{monthNarrative}</p>
          {visibleMonths.length ? <>
            <div className="pulse-seismograph">
              <header><span>TWR MENSUAL</span><strong>{focusedMonth?.label} ? {signedPercent(focusedMonth?.returnPct ?? 0)}</strong></header>
              {renderSeismographGraphic(true)}
            </div>
            <section className={`pulse-barogram-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
              <header>
                <div><span>BAROGRAMA DE SALDO</span><strong>{focusedMonth?.label} ? {formatCurrency(focusedMonth?.balance ?? 0)}</strong></div>
                <div className="pulse-barogram-actions">
                  {isFullscreen ? (
                    <div className="pulse-fullscreen-switch" role="group" aria-label="Vista del gr?fico ampliado">
                      {([['balance', 'SALDO'], ['return', 'TWR'], ['both', 'AMBOS']] as Array<[FullscreenView, string]>).map(([value, label]) => (
                        <button type="button" key={value} className={fullscreenView === value ? 'is-active' : ''} aria-pressed={fullscreenView === value} onClick={() => setFullscreenView(value)}>{label}</button>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => { setIsFullscreen((value) => !value); onAnalyticsEvent?.({ type: 'chart_expand_request', label: 'PULSO barograma' }); }}>{isFullscreen ? 'CERRAR ?' : 'AMPLIAR ?'}</button>
                </div>
              </header>
              {isFullscreen ? (
                <div className={`pulse-fullscreen-graphs ${fullscreenView === 'both' ? 'is-both' : ''}`}>
                  {fullscreenView === 'return' || fullscreenView === 'both' ? (
                    <div className="pulse-fullscreen-chart is-return">
                      <div className="pulse-fullscreen-chart-label"><span>TWR mensual</span><strong>{focusedMonth?.label} ? {signedPercent(focusedMonth?.returnPct ?? 0)}</strong></div>
                      {renderSeismographGraphic(false)}
                    </div>
                  ) : null}
                  {fullscreenView === 'balance' || fullscreenView === 'both' ? (
                    <div className="pulse-fullscreen-chart is-balance">
                      <div className="pulse-fullscreen-chart-label"><span>Saldo de cierre</span><strong>{focusedMonth?.label} ? {formatCurrency(focusedMonth?.balance ?? 0)}</strong></div>
                      {renderBarogramGraphic(true)}
                    </div>
                  ) : null}
                </div>
              ) : renderBarogramGraphic(true)}
              {isFullscreen ? <p className="pulse-fullscreen-hint">Flechas para recorrer el registro ? ESC para salir</p> : null}
            </section>
          </> : <div className="pulse-no-signal"><span>NO SIGNAL</span><strong>Esperando el primer cierre mensual</strong></div>}
        </section>

        <aside className="pulse-control-bank" aria-label="Control de periodo y resumen">
          <header><small>CONTROL DE LECTURA</small><strong>PERIODO</strong></header>
          <div className="pulse-period-dial" role="group" aria-label="Seleccionar periodo">{([['6m', '6M'], ['12m', '12M'], ['all', 'TODO'], ['custom', 'RANGO']] as Array<[PeriodPreset, string]>).map(([value, label]) => <button type="button" key={value} className={period === value ? 'is-active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
          {period === 'custom' ? <div className="pulse-custom-period"><label>DESDE<select value={customStart} onChange={(event) => { const value = event.target.value; setCustomStart(value); if (value > customEnd) setCustomEnd(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.shortLabel}</option>)}</select></label><label>HASTA<select value={customEnd} onChange={(event) => { const value = event.target.value; setCustomEnd(value); if (value < customStart) setCustomStart(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.shortLabel}</option>)}</select></label></div> : null}
          <div className="pulse-readouts"><span><small>CAPITAL APORTADO</small><strong>{formatCurrency(visibleContributed)}</strong></span><span><small>CAPITAL RETIRADO</small><strong>{formatCurrency(visibleWithdrawn)}</strong></span><span><small>RENTABILIDAD TOTAL</small><strong className={report.rentabilidad >= 0 ? 'is-positive' : 'is-negative'}>{report.rentabilidadDisponible === false ? 'N/D' : signedPercent(report.rentabilidad)}</strong></span><span><small>CIERRES EN PANTALLA</small><strong>{String(visibleMonths.length).padStart(2, '0')}</strong></span><span><small>ESTADO DE REGISTRO</small><strong className="is-positive">VERIFICADO</strong></span></div>
        </aside>
      </main>

      <section className="pulse-tape-section"><header><div><small>CINTA CRONOLÓGICA</small><h2>Lectura mes a mes</h2></div><p>Selecciona un cierre para inspeccionar su composición.</p></header><div className="pulse-tape" ref={tapeRef}>{visibleMonths.map((month) => <button type="button" key={month.key} className={month.key === focusedMonth?.key ? 'is-active' : ''} aria-pressed={month.key === focusedMonth?.key} onClick={() => focusMonth(month.key, 'month-tape')}><small>{month.shortLabel}</small><strong>{formatCurrency(month.balance)}</strong><span className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(month.returnPct)}</span>{month.movements.length ? <i>{month.movements.length} MOV.</i> : null}</button>)}</div></section>

      {focusedMonth ? <section className="pulse-receipt" aria-live="polite"><header><div><small>RECIBO DE CIERRE · {focusedMonth.key}</small><h2>{focusedMonth.label}</h2></div><strong className={Math.abs(reconciliation - focusedMonth.balance) <= .02 ? 'is-positive' : 'is-negative'}>{Math.abs(reconciliation - focusedMonth.balance) <= .02 ? 'CONCILIADO ✓' : 'REVISAR'}</strong></header><div className="pulse-equation"><span><small>SALDO INICIAL</small><strong>{formatCurrency(focusedMonth.opening)}</strong></span><b>+</b><span><small>APORTACIONES</small><strong className="is-contribution">{focusedMonth.increments ? `+${formatCurrency(focusedMonth.increments)}` : '—'}</strong></span><b>−</b><span><small>RETIRADAS</small><strong className="is-withdrawal">{focusedMonth.decrements ? formatCurrency(focusedMonth.decrements) : '—'}</strong></span><b>+</b><span><small>BENEFICIO</small><strong className={focusedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedMonth.profit)}</strong></span><b>=</b><span className="is-final"><small>SALDO FINAL</small><strong>{formatCurrency(focusedMonth.balance)}</strong></span></div>{focusedMonth.breakdown ? <div className="pulse-tranches"><article><small>POSICIÓN INICIAL DEL MES</small><strong>{formatCurrency(focusedMonth.breakdown.initialCapital)}</strong><p>{signedPercent(focusedMonth.breakdown.initialReturnPct * 100)} · {signedMoney(focusedMonth.breakdown.initialProfit)}</p></article>{focusedMonth.breakdown.contributions.map((contribution, index) => <article className="is-contribution" key={`${contribution.iso}-${index}`}><small>APORTACIÓN · {formatDate(contribution.iso)}</small><strong>+{formatCurrency(contribution.amount)}</strong><p>{signedPercent(contribution.returnPct * 100)} · {signedMoney(contribution.profit)}</p></article>)}{(focusedMonth.breakdown.withdrawals ?? []).map((withdrawal, index) => <article className="is-withdrawal" key={`${withdrawal.iso}-${index}`}><small>RETIRADA · {formatDate(withdrawal.iso)}</small><strong>−{formatCurrency(withdrawal.amount)}</strong><p>{withdrawal.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(withdrawal.returnPct * 100)} · ${signedMoney(withdrawal.profit)}`}</p></article>)}</div> : focusedMonth.movements.length ? <div className="pulse-tranches">{focusedMonth.movements.map((movement, index) => <article className={movement.type === 'increment' ? 'is-contribution' : 'is-withdrawal'} key={`${movement.iso}-${index}`}><small>{movement.type === 'increment' ? 'APORTACIÓN' : 'RETIRADA'} · {formatDate(movement.iso)}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><p>Movimiento consolidado</p></article>)}</div> : null}</section> : null}

      <section className="pulse-ledger"><header><div><small>LIBRO DE MOVIMIENTOS</small><h2>Entradas y salidas de capital</h2></div><strong>{allMovements.length} REGISTROS</strong></header><div className="pulse-ledger-table" role="table"><div className="pulse-ledger-head" role="row"><span>FECHA</span><span>OPERACIÓN</span><span>IMPORTE</span><span>RENTABILIDAD ESPECÍFICA</span><span>ESTADO</span></div><div role="rowgroup">{allMovements.map((movement, index) => <div className="pulse-ledger-row" role="row" key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><span><i className={`is-${movement.type}`} />{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-contribution' : 'is-withdrawal'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{movement.returnPct === undefined ? '—' : signedPercent(movement.returnPct * 100)}</span><span className={movement.pending ? 'is-pending' : 'is-recorded'}>{movement.pending ? 'PRÓXIMO CIERRE' : 'REGISTRADO'}</span></div>)}</div></div></section>

      <footer className="pulse-footer"><div><span className="pulse-record-dot" /><strong>REGISTRO ACTIVO</strong><small>Última captura: {monthLabel(latestKey)}</small></div><p>El TWR registra el rendimiento de la estrategia sin confundirlo con las entradas o salidas de capital. Diseño: <strong>GLM 5.3MAX</strong>.</p></footer>
    </div>
  );
};
