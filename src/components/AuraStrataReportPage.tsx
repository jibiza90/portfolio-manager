import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './AuraStrataReportPage.css';

interface StrataPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AuraStrataReportPageProps {
  report: ReportData;
  pendingCashMovements?: StrataPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface StrataPoint {
  key: string;
  label: string;
  shortLabel: string;
  endBalance: number;
  bedrockCapital: number;
  mineralProfit: number;
  profitMonth: number;
  returnPctMonth: number;
  openingBalance: number;
  increments: number;
  decrements: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = 'last3' | 'last6' | 'last12' | 'ytd' | 'all' | 'custom';

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

const labelForMonth = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  const result = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${result.charAt(0).toUpperCase()}${result.slice(1)}`;
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

const compactMoney = (value: number) => new Intl.NumberFormat('es-ES', {
  notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  maximumFractionDigits: Math.abs(value) >= 100000 ? 1 : 0
}).format(value);

const sumByType = (movements: ReportData['movements'], type: 'increment' | 'decrement') => (
  movements
    .filter((movement) => movement.type === type)
    .reduce((sum, movement) => sum + movement.amount, 0)
);

export const AuraStrataReportPage: React.FC<AuraStrataReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const safePendingMovements = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);

  const pendingIncrements = sumByType(safePendingMovements as ReportData['movements'], 'increment');
  const pendingDecrements = sumByType(safePendingMovements as ReportData['movements'], 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleIncrements = report.incrementos + pendingIncrements;
  const visibleDecrements = report.decrementos + pendingDecrements;
  const visibleNetCapital = visibleIncrements - visibleDecrements;
  const publishedNetCapital = report.incrementos - report.decrementos;
  const reconciled = Math.abs(visibleNetCapital + report.beneficioTotal - visibleBalance) <= 0.02;

  const points = useMemo<StrataPoint[]>(() => {
    const stats = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = stats.length ? monthToKey(stats[stats.length - 1].month) : '';
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const allMovements = report.movements ?? [];
    const totalMovementNet = sumByType(allMovements, 'increment') - sumByType(allMovements, 'decrement');
    const unitemizedOpeningCapital = publishedNetCapital - totalMovementNet;

    return stats.map((month) => {
      const key = monthToKey(month.month);
      const movements = allMovements.filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumByType(movements, 'increment');
      const decrements = sumByType(movements, 'decrement');
      const cumulativeMovementNet = allMovements
        .filter((movement) => movement.iso.slice(0, 7) <= key)
        .reduce((sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount), 0);
      const bedrockCapital = Math.max(0, unitemizedOpeningCapital + cumulativeMovementNet);
      const endBalance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const profitMonth = Number.isFinite(month.profit) ? month.profit : 0;
      const returnPctMonth = key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
        ? report.rentabilidadUltimoMes
        : Number.isFinite(month.profitPct) ? month.profitPct : 0;

      return {
        key,
        label: labelForMonth(key),
        shortLabel: labelForMonth(key, true),
        endBalance,
        bedrockCapital,
        mineralProfit: endBalance - bedrockCapital,
        profitMonth,
        returnPctMonth,
        openingBalance: endBalance - profitMonth - increments + decrements,
        increments,
        decrements,
        movements,
        breakdown: breakdownByMonth.get(key)
      };
    });
  }, [publishedNetCapital, report]);

  const latestKey = points[points.length - 1]?.key ?? '';
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [periodStartMonth, setPeriodStartMonth] = useState(points[0]?.key ?? '');
  const [periodEndMonth, setPeriodEndMonth] = useState(latestKey);
  const [focusedMonthKey, setFocusedMonthKey] = useState(latestKey);
  const [expandedBreakdownMonths, setExpandedBreakdownMonths] = useState<Record<string, boolean>>(
    latestKey ? { [latestKey]: true } : {}
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriodPreset('all');
    setPeriodStartMonth(points[0]?.key ?? '');
    setPeriodEndMonth(latestKey);
    setFocusedMonthKey(latestKey);
    setExpandedBreakdownMonths(latestKey ? { [latestKey]: true } : {});
  }, [latestKey, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!isFullScreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullScreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullScreen]);

  const effectivePoints = useMemo(() => {
    if (periodPreset === 'all') return points;
    if (periodPreset === 'last3') return points.slice(-3);
    if (periodPreset === 'last6') return points.slice(-6);
    if (periodPreset === 'last12') return points.slice(-12);
    if (periodPreset === 'ytd') return points.filter((point) => point.key.startsWith(latestKey.slice(0, 4)));
    return points.filter((point) => point.key >= periodStartMonth && point.key <= periodEndMonth);
  }, [latestKey, periodEndMonth, periodPreset, periodStartMonth, points]);

  useEffect(() => {
    if (!effectivePoints.length) return;
    if (!effectivePoints.some((point) => point.key === focusedMonthKey)) {
      setFocusedMonthKey(effectivePoints[effectivePoints.length - 1].key);
    }
  }, [effectivePoints, focusedMonthKey]);

  const focusedPoint = effectivePoints.find((point) => point.key === focusedMonthKey)
    ?? effectivePoints[effectivePoints.length - 1]
    ?? points[points.length - 1];
  const focusedIndex = effectivePoints.findIndex((point) => point.key === focusedPoint?.key);
  const periodTwr = effectivePoints.reduce((factor, point) => factor * (1 + point.returnPctMonth / 100), 1) - 1;
  const periodFlow = effectivePoints.reduce((sum, point) => sum + point.increments - point.decrements, 0);
  const periodRange = effectivePoints.length
    ? `${effectivePoints[0].shortLabel} — ${effectivePoints[effectivePoints.length - 1].shortLabel}`
    : 'Sin cierres publicados';

  const chart = useMemo(() => {
    const width = 1240;
    const height = 420;
    const left = 34;
    const right = 1210;
    const top = 24;
    const bottom = 386;
    const maxValue = Math.max(1, ...effectivePoints.flatMap((point) => [point.endBalance, point.bedrockCapital])) * 1.12;
    const xFor = (index: number) => effectivePoints.length === 1
      ? (left + right) / 2
      : left + index / (effectivePoints.length - 1) * (right - left);
    const yFor = (value: number) => bottom - Math.max(0, value) / maxValue * (bottom - top);
    const mapped = effectivePoints.map((point, index) => ({
      point,
      x: xFor(index),
      summitY: yFor(point.endBalance),
      bedrockY: yFor(point.bedrockCapital)
    }));
    const bedrockStrokePath = mapped.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.bedrockY}`).join(' ');
    const summitStrokePath = mapped.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.summitY}`).join(' ');
    const bedrockPath = mapped.length
      ? `${bedrockStrokePath} L ${mapped[mapped.length - 1].x} ${bottom} L ${mapped[0].x} ${bottom} Z`
      : '';
    const mineralPath = mapped.length
      ? `${summitStrokePath} ${[...mapped].reverse().map((item) => `L ${item.x} ${item.bedrockY}`).join(' ')} Z`
      : '';
    return { width, height, left, right, top, bottom, maxValue, mapped, bedrockStrokePath, summitStrokePath, bedrockPath, mineralPath };
  }, [effectivePoints]);

  const focusMonth = useCallback((key: string, source: string, openBreakdown = false) => {
    setFocusedMonthKey(key);
    if (openBreakdown) setExpandedBreakdownMonths((current) => ({ ...current, [key]: true }));
    onAnalyticsEvent?.({ type: 'strata_month_focus', label: key, metadata: { source } });
  }, [onAnalyticsEvent]);

  const focusFromClientX = useCallback((clientX: number) => {
    const container = svgContainerRef.current;
    if (!container || !effectivePoints.length) return;
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
    const index = Math.round(ratio * (effectivePoints.length - 1));
    const point = effectivePoints[index];
    if (point) focusMonth(point.key, 'scrub');
  }, [effectivePoints, focusMonth]);

  const changePeriod = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    onAnalyticsEvent?.({ type: 'strata_period_change', label: preset });
  };

  const toggleBreakdown = (key: string) => {
    setExpandedBreakdownMonths((current) => ({ ...current, [key]: !current[key] }));
    setFocusedMonthKey(key);
    onAnalyticsEvent?.({ type: 'strata_breakdown_toggle', label: key });
  };

  const stepMonth = (direction: -1 | 1) => {
    const point = effectivePoints[focusedIndex + direction];
    if (point) focusMonth(point.key, 'stepper', true);
  };

  const chartKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepMonth(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepMonth(1);
    } else if ((event.key === 'Enter' || event.key === ' ') && focusedPoint) {
      event.preventDefault();
      toggleBreakdown(focusedPoint.key);
    }
  };

  const focusedGeometry = chart.mapped.find((item) => item.point.key === focusedPoint?.key);
  const maxHistReturn = Math.max(0.01, ...effectivePoints.map((point) => Math.abs(point.returnPctMonth)));
  const firstRegisteredIso = [...report.movements.map((movement) => movement.iso), ...(points[0] ? [`${points[0].key}-01`] : [])].sort()[0];

  return (
    <div className="strata-page" ref={rootRef} role="document">
      <header className="strata-header">
        <div className="strata-header-brand">
          <span className="strata-kicker">PORTFOLIO MANAGER · PRIVATE OFFICE</span>
          <h1 className="strata-title">Informe Patrimonial y Rendimiento</h1>
          <time className="strata-date">{new Date(report.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
        </div>
        <div className="strata-header-actions">
          <div className="strata-client-badge"><span className="strata-client-dot" /><span>{report.clientCode}</span><small>EUR</small></div>
          <button type="button" className="strata-btn-download" onClick={() => { onAnalyticsEvent?.({ type: 'strata_pdf_download', label: periodRange }); void onDownload?.(); }} aria-label="Descargar informe oficial en PDF vectorial">
            <svg className="strata-icon-pdf" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" /></svg>
            <span>Descargar PDF</span>
          </button>
        </div>
      </header>

      <section className="strata-executive-grid" aria-label="Resumen ejecutivo del patrimonio">
        <article className="strata-monolith-card is-primary" tabIndex={0}>
          <header className="strata-card-head"><span className="strata-card-label">Saldo total disponible</span><span className={reconciled ? 'strata-card-status is-ok' : 'strata-card-status is-review'}>{reconciled ? 'Verificado y reconciliado' : 'Revisión de cuadre'}</span></header>
          <strong className="strata-monumental-number">{formatCurrency(visibleBalance)}{safePendingMovements.length ? <sup>*</sup> : null}</strong>
          <footer className="strata-card-foot"><span>Capital neto: {formatCurrency(visibleNetCapital)}</span><span className="strata-separator">•</span><span className="strata-text-gold">Plusvalía: {signedMoney(report.beneficioTotal)}</span></footer>
        </article>
        <article className="strata-monolith-card" tabIndex={0}>
          <header className="strata-card-head"><span className="strata-card-label">Rentabilidad {points[points.length - 1]?.label ?? 'último cierre'}</span><span className="strata-card-tag">TWR mes cerrado</span></header>
          <strong className={`strata-monumental-number ${report.rentabilidadUltimoMes >= 0 ? 'is-pos' : 'is-neg'}`}>{signedPercent(report.rentabilidadUltimoMes)}</strong>
          <footer className="strata-card-foot"><span className="strata-subtext">Rendimiento puro de la estrategia sin sesgo por depósitos</span></footer>
        </article>
        <article className="strata-monolith-card" tabIndex={0}>
          <header className="strata-card-head"><span className="strata-card-label">Beneficio {points[points.length - 1]?.label ?? 'último cierre'}</span><span className="strata-card-tag">Plusvalía en EUR</span></header>
          <strong className={`strata-monumental-number ${report.beneficioUltimoMes >= 0 ? 'is-pos' : 'is-neg'}`}>{signedMoney(report.beneficioUltimoMes)}</strong>
          <footer className="strata-card-foot"><span className="strata-subtext">Ganancia monetaria neta devengada en el periodo</span></footer>
        </article>
      </section>

      {safePendingMovements.length ? (
        <aside className="strata-pending-banner" role="status" aria-live="polite">
          <div className="strata-pending-lead"><span className="strata-pulse-beacon" aria-hidden="true" /><div><strong>Actualización de capital en curso</strong><p>Movimientos posteriores al último cierre oficial. El saldo actual ya los contempla.</p></div></div>
          <div className="strata-pending-chips">{safePendingMovements.map((movement, index) => <div className="strata-pending-chip" key={`${movement.iso}-${index}`}><span>{formatDate(movement.iso)}</span><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-pos' : 'is-neg'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></div>)}</div>
          <div className="strata-pending-foot">Su rendimiento se fijará en la próxima publicación oficial.</div>
        </aside>
      ) : null}

      <section className="strata-metrics-strip" aria-label="Atribución acumulada de capital y rendimiento">
        <div className="strata-kpi-pill"><span className="strata-kpi-label">Beneficio acumulado</span><strong className={`strata-kpi-val ${report.beneficioTotal >= 0 ? 'is-pos' : 'is-neg'}`}>{signedMoney(report.beneficioTotal)}</strong><small>Desde {firstRegisteredIso ? formatDate(firstRegisteredIso) : 'el inicio'}</small></div>
        <div className="strata-kpi-pill"><span className="strata-kpi-label">TWR acumulado</span><strong className={`strata-kpi-val ${(report.twrYtd ?? 0) >= 0 ? 'is-pos' : 'is-neg'}`}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong><small>Rendimiento puro</small></div>
        <div className="strata-kpi-pill"><span className="strata-kpi-label">Capital total aportado</span><strong className="strata-kpi-val">{formatCurrency(visibleIncrements)}</strong><small>Total histórico</small></div>
        <div className="strata-kpi-pill"><span className="strata-kpi-label">Capital total retirado</span><strong className="strata-kpi-val">{formatCurrency(visibleDecrements)}</strong><small>Total histórico</small></div>
        <div className="strata-kpi-pill"><span className="strata-kpi-label">Rentabilidad total s/ neto</span><strong className={`strata-kpi-val ${report.rentabilidad >= 0 ? 'is-pos' : 'is-neg'}`}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}</strong><small>Beneficio sobre capital neto</small></div>
      </section>

      <section className="strata-didactic-box">
        <div className="strata-didactic-head"><svg className="strata-info-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg><strong>Distinción metodológica fundamental: TWR frente a rentabilidad total</strong><button type="button" aria-expanded={showMethodology} onClick={() => setShowMethodology((value) => !value)}>{showMethodology ? 'Cerrar ejemplo' : '¿Por qué son diferentes?'}</button></div>
        <div className="strata-didactic-cols"><div><span className="strata-didactic-tag">TWR (Time-Weighted Return)</span><p>Aísla de forma matemática el impacto de las entradas y salidas de capital. Mide exclusivamente el comportamiento de la estrategia de inversión.</p></div><div><span className="strata-didactic-tag">Rentabilidad total</span><p>Divide el beneficio absoluto generado entre el capital neto desembolsado. Refleja el retorno monetario sobre el capital aportado.</p></div></div>
        {showMethodology ? <div className="strata-method-example"><strong>Ejemplo numérico</strong><span>Una aportación eleva el saldo, pero no genera rentabilidad por sí misma. El TWR conserva el rendimiento de la estrategia; la rentabilidad total relaciona el beneficio con todo el capital neto.</span></div> : null}
      </section>

      <nav className="strata-toolbar" aria-label="Control temporal de análisis">
        <div className="strata-toolbar-range"><span>Horizonte temporal</span><strong>{periodRange}</strong><small>TWR enlazado {signedPercent(periodTwr * 100)} · Flujo neto {signedMoney(periodFlow)}</small></div>
        <div className="strata-preset-group" role="group" aria-label="Periodos preconfigurados">{([['last3', '3 meses'], ['last6', '6 meses'], ['last12', '12 meses'], ['ytd', 'YTD'], ['all', 'Todo el histórico'], ['custom', 'Personalizado']] as Array<[PeriodPreset, string]>).map(([value, label]) => <button type="button" key={value} className={periodPreset === value ? 'is-active' : ''} aria-pressed={periodPreset === value} onClick={() => changePeriod(value)}>{label}</button>)}</div>
        {periodPreset === 'custom' ? <div className="strata-custom-dates"><label><span>Desde</span><select value={periodStartMonth} onChange={(event) => { const value = event.target.value; setPeriodStartMonth(value); if (value > periodEndMonth) setPeriodEndMonth(value); }}>{points.map((point) => <option value={point.key} key={point.key}>{point.label}</option>)}</select></label><label><span>Hasta</span><select value={periodEndMonth} onChange={(event) => { const value = event.target.value; setPeriodEndMonth(value); if (value < periodStartMonth) setPeriodStartMonth(value); }}>{points.map((point) => <option value={point.key} key={point.key}>{point.label}</option>)}</select></label></div> : null}
      </nav>

      <section className={`strata-canvas-container ${isFullScreen ? 'is-fullscreen' : ''}`} aria-label="Visualización gráfica estratificada de capital y beneficio">
        <div className="strata-canvas-heading"><div><span>Cordillera patrimonial estratificada</span><h2>Rocamadre de capital y veta mineral de beneficio</h2><p>La frontera entre ambas capas separa el capital neto aportado del resultado generado.</p></div><button type="button" className="strata-btn-fullscreen" onClick={() => { setIsFullScreen((value) => !value); onAnalyticsEvent?.({ type: 'strata_fullscreen_toggle', label: isFullScreen ? 'close' : 'open' }); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg><span>{isFullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</span></button></div>
        {focusedPoint ? <div className="strata-hud" aria-live="polite"><div className="strata-hud-chip"><span>Mes enfocado</span><strong>{focusedPoint.label}</strong></div><div className="strata-hud-chip"><span>Rocamadre · Capital neto</span><strong>{formatCurrency(focusedPoint.bedrockCapital)}</strong></div><div className="strata-hud-chip"><span>Veta mineral · Beneficio</span><strong className="strata-text-gold">{signedMoney(focusedPoint.mineralProfit)}</strong></div><div className="strata-hud-chip"><span>Cima · Saldo total</span><strong>{formatCurrency(focusedPoint.endBalance)}</strong></div><div className="strata-hud-chip"><span>TWR del mes</span><strong className={focusedPoint.returnPctMonth >= 0 ? 'is-pos' : 'is-neg'}>{signedPercent(focusedPoint.returnPctMonth)}</strong></div></div> : null}
        {effectivePoints.length ? <>
          <div className="strata-svg-wrapper" ref={svgContainerRef}>
            <svg className="strata-svg" viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label={`Evolución estratificada de ${periodRange}`} tabIndex={0} onKeyDown={chartKeyDown} onMouseMove={(event) => focusFromClientX(event.clientX)} onTouchMove={(event) => { const touch = event.touches[0]; if (touch) focusFromClientX(touch.clientX); }}>
              <defs>
                <pattern id="strata-bedrock-pattern" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="rgba(255,255,255,0.07)" strokeWidth="1" /></pattern>
                <pattern id="strata-mineral-pattern" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.16)" /></pattern>
                <pattern id="strata-pending-pattern" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0,8 L8,0" stroke="rgba(255,209,102,0.7)" strokeWidth="2" /></pattern>
                <linearGradient id="strata-bedrock-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#222d3b" /><stop offset="100%" stopColor="#18202a" /></linearGradient>
                <linearGradient id="strata-mineral-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(229,192,110,0.85)" /><stop offset="100%" stopColor="rgba(27,124,75,0.9)" /></linearGradient>
                <filter id="strata-summit-shadow" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(0,245,212,0.25)" /></filter>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => { const y = chart.bottom - ratio * (chart.bottom - chart.top); return <g key={ratio} className="strata-grid-line"><line x1={chart.left} y1={y} x2={chart.right} y2={y} /><text x={chart.left + 8} y={y - 7}>{compactMoney(chart.maxValue * ratio)} €</text></g>; })}
              <path className="strata-bedrock-layer" d={chart.bedrockPath} fill="url(#strata-bedrock-grad)" />
              <path className="strata-bedrock-texture" d={chart.bedrockPath} fill="url(#strata-bedrock-pattern)" />
              <path className="strata-bedrock-ridge" d={chart.bedrockStrokePath} />
              <path className="strata-mineral-layer" d={chart.mineralPath} fill="url(#strata-mineral-grad)" />
              <path className="strata-mineral-texture" d={chart.mineralPath} fill="url(#strata-mineral-pattern)" />
              <path className="strata-summit-line" d={chart.summitStrokePath} filter="url(#strata-summit-shadow)" />
              {chart.mapped.filter((item) => item.point.endBalance < item.point.bedrockCapital).map((item) => <line key={`drawdown-${item.point.key}`} className="strata-drawdown" x1={item.x} x2={item.x} y1={item.summitY} y2={item.bedrockY} />)}
              {chart.mapped.flatMap((item) => item.point.movements.map((movement, index) => <g key={`${movement.iso}-${index}`} className={`strata-beacon-group ${movement.type === 'increment' ? 'is-increment' : 'is-decrement'}`} transform={`translate(${item.x}, ${item.bedrockY})`} role="button" tabIndex={0} aria-label={`${movement.type === 'increment' ? 'Aportación' : 'Retirada'} ${formatCurrency(movement.amount)} el ${formatDate(movement.iso)}`} onClick={() => focusMonth(item.point.key, 'beacon', true)}><line y1="0" y2={-Math.max(24, Math.abs(item.bedrockY - item.summitY))} /><circle r="5" /><text y={-Math.max(32, Math.abs(item.bedrockY - item.summitY) + 8)} textAnchor="middle">{movement.type === 'increment' ? '▲ +' : '▼ −'}{compactMoney(movement.amount)} €</text></g>))}
              {focusedGeometry ? <g className="strata-laser-needle" transform={`translate(${focusedGeometry.x}, 0)`}><line y1={chart.top} y2={chart.bottom} /><circle cy={focusedGeometry.summitY} r="7" /><circle className="is-bedrock" cy={focusedGeometry.bedrockY} r="5" /></g> : null}
              {safePendingMovements.length && chart.mapped.length ? <g className="strata-pending-layer"><rect x={chart.right - 26} y={chart.mapped[chart.mapped.length - 1].summitY - 12} width="26" height="12" fill="url(#strata-pending-pattern)" /><text x={chart.right - 8} y={chart.mapped[chart.mapped.length - 1].summitY - 20} textAnchor="end">Capital en consolidación</text></g> : null}
              {chart.mapped.map((item, index) => { const show = effectivePoints.length <= 12 || index % Math.ceil(effectivePoints.length / 10) === 0 || index === effectivePoints.length - 1; return show ? <text className="strata-axis-month" key={item.point.key} x={item.x} y={chart.bottom + 24} textAnchor="middle">{item.point.shortLabel}</text> : null; })}
            </svg>
          </div>
          <div className="strata-layer-legend"><span><i className="is-bedrock" />Rocamadre · Capital neto aportado</span><span><i className="is-mineral" />Veta mineral · Beneficio acumulado</span><span><i className="is-increment" />Aportación</span><span><i className="is-decrement" />Retirada</span></div>
          <div className="strata-histogram-strip"><span className="strata-strip-title">Oscilación mensual TWR</span><div className="strata-histogram-bars">{effectivePoints.map((point) => <button type="button" key={point.key} className={`strata-hist-col ${point.key === focusedPoint?.key ? 'is-focused' : ''}`} onClick={() => focusMonth(point.key, 'histogram', true)} aria-label={`${point.label}: rentabilidad ${signedPercent(point.returnPctMonth)}, beneficio ${signedMoney(point.profitMonth)}`}><span className={`strata-hist-tag ${point.returnPctMonth >= 0 ? 'is-pos' : 'is-neg'}`}>{signedPercent(point.returnPctMonth)}</span><span className="strata-hist-track"><i className={point.returnPctMonth >= 0 ? 'is-pos' : 'is-neg'} style={{ height: `${Math.min(50, Math.max(4, Math.abs(point.returnPctMonth) / maxHistReturn * 50))}%`, [point.returnPctMonth >= 0 ? 'bottom' : 'top']: '50%' }} /></span><span className="strata-hist-label">{point.shortLabel}</span></button>)}</div></div>
          {effectivePoints.length > 24 ? <div className="strata-minimap" aria-label="Minimapa temporal">{effectivePoints.map((point) => <button type="button" key={point.key} aria-label={`Enfocar ${point.label}`} className={point.key === focusedPoint?.key ? 'is-active' : ''} onClick={() => focusMonth(point.key, 'minimap')}><i style={{ height: `${Math.max(10, point.endBalance / Math.max(...effectivePoints.map((item) => item.endBalance), 1) * 100)}%` }} /></button>)}</div> : null}
          {isFullScreen ? <small className="strata-fullscreen-hint">ESC para salir · Flechas para cambiar de mes · Enter para auditar tramos</small> : null}
        </> : <div className="strata-empty-state"><span>AS</span><h3>Su cartera se encuentra en custodia inicial</h3><p>El primer estrato de inversión se consolidará con el próximo cierre mensual.</p></div>}
      </section>

      {effectivePoints.length ? <section className="strata-audit-section" aria-label="Mesa de auditoría mensual y conciliación contable">
        <div className="strata-audit-heading"><div><span>Matriz de auditoría</span><h2>Mesa Maestra de Conciliación y Auditoría de Tramos</h2><p>Cierre mes a mes con desglose exacto de aportaciones y retiradas dentro del ciclo.</p></div><div className="strata-audit-controls"><button type="button" disabled={focusedIndex <= 0} onClick={() => stepMonth(-1)}>◀ Mes anterior</button><span>{focusedPoint?.label}</span><button type="button" disabled={focusedIndex < 0 || focusedIndex >= effectivePoints.length - 1} onClick={() => stepMonth(1)}>Mes siguiente ▶</button></div></div>
        <div className="strata-table" role="table" aria-label="Conciliación mensual Aura Strata">
          <div className="strata-table-head" role="row"><span role="columnheader">Periodo</span><span role="columnheader">Saldo inicial</span><span role="columnheader">Aportaciones (+)</span><span role="columnheader">Retiradas (−)</span><span role="columnheader">Beneficio en EUR</span><span role="columnheader">TWR mes</span><span role="columnheader">Saldo cierre</span><span role="columnheader">Auditoría</span></div>
          <div role="rowgroup">{[...effectivePoints].reverse().map((point) => { const expanded = !!expandedBreakdownMonths[point.key]; const focused = point.key === focusedPoint?.key; const difference = point.endBalance - point.openingBalance - point.increments + point.decrements - point.profitMonth; return <React.Fragment key={point.key}><div className={`strata-table-row ${focused ? 'is-focused' : ''}`} role="row" onClick={() => focusMonth(point.key, 'table')}><span role="cell" data-label="Periodo"><strong>{point.label}</strong>{point.movements.length ? <small>Con movimientos</small> : null}</span><span role="cell" data-label="Saldo inicial">{formatCurrency(point.openingBalance)}</span><span role="cell" data-label="Aportaciones" className="strata-text-increment">{point.increments ? `+${formatCurrency(point.increments)}` : '—'}</span><span role="cell" data-label="Retiradas" className="strata-text-decrement">{point.decrements ? `−${formatCurrency(point.decrements)}` : '—'}</span><span role="cell" data-label="Beneficio" className={point.profitMonth >= 0 ? 'is-pos' : 'is-neg'}>{signedMoney(point.profitMonth)}</span><span role="cell" data-label="TWR mes" className={point.returnPctMonth >= 0 ? 'is-pos' : 'is-neg'}>{signedPercent(point.returnPctMonth)}</span><span role="cell" data-label="Saldo cierre"><strong>{formatCurrency(point.endBalance)}</strong></span><span role="cell" data-label="Auditoría">{point.breakdown ? <button type="button" className={`strata-btn-tramos ${expanded ? 'is-open' : ''}`} onClick={(event) => { event.stopPropagation(); toggleBreakdown(point.key); }} aria-expanded={expanded} aria-label={`Auditar tramos de ${point.label}`}>{expanded ? 'Ocultar' : 'Ver tramos'}</button> : <i>—</i>}</span></div>{expanded && point.breakdown ? <div className="strata-table-detail" role="row"><div role="cell" aria-label={`Conciliación de tramos de ${point.label}`}><header><span>Conciliación de tramos · {point.label}</span><strong>Beneficio total explicado: {signedMoney(point.breakdown.totalProfit)}</strong></header><div className="strata-month-equation"><span><small>Saldo inicial</small><strong>{formatCurrency(point.openingBalance)}</strong></span><b>+</b><span><small>Aportaciones</small><strong>{formatCurrency(point.increments)}</strong></span><b>−</b><span><small>Retiradas</small><strong>{formatCurrency(point.decrements)}</strong></span><b>+</b><span><small>Beneficio</small><strong>{signedMoney(point.profitMonth)}</strong></span><b>=</b><span className="is-final"><small>Saldo final</small><strong>{formatCurrency(point.endBalance)}</strong></span><em className={Math.abs(difference) <= 0.02 ? 'is-ok' : 'is-review'}>{Math.abs(difference) <= 0.02 ? 'Conciliación exacta' : `Ajuste ${formatCurrency(difference)}`}</em></div><div className="strata-breakdown-grid"><article><span>Posición inicial mantenida durante todo el mes</span><strong>{formatCurrency(point.breakdown.initialCapital)}</strong><small>{signedPercent(point.breakdown.initialReturnPct * 100)} · {signedMoney(point.breakdown.initialProfit)}</small></article>{point.breakdown.contributions.map((item, index) => <article key={`${item.iso}-${index}`}><span>Aportación incorporada el {formatDate(item.iso)}</span><strong>+{formatCurrency(item.amount)}</strong><small>{signedPercent(item.returnPct * 100)} · {signedMoney(item.profit)}</small></article>)}{(point.breakdown.withdrawals ?? []).map((item, index) => <article key={`${item.iso}-${index}`}><span>Posición extraída el {formatDate(item.iso)}</span><strong>−{formatCurrency(item.amount)}</strong><small>{item.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(item.returnPct * 100)} · ${signedMoney(item.profit)}`}</small></article>)}<article className="is-total"><span>Beneficio explicado</span><strong>{signedMoney(point.breakdown.totalProfit)}</strong><small>Resultado conciliado de todos los tramos</small></article></div></div></div> : null}</React.Fragment>; })}</div>
        </div>
      </section> : null}

      <section className="strata-movements-section" aria-label="Registro de movimientos de caja"><div className="strata-section-lead"><div><span>Tesorería</span><h3>Registro Oficial de Tesorería</h3><p>Inyecciones y extracciones incluidas dentro del horizonte temporal seleccionado.</p></div><strong>{report.movements.filter((movement) => effectivePoints.some((point) => movement.iso.startsWith(point.key))).length} movimientos</strong></div><div className="strata-movements-grid">{report.movements.filter((movement) => effectivePoints.some((point) => movement.iso.startsWith(point.key))).sort((left, right) => right.iso.localeCompare(left.iso)).map((movement, index) => <article key={`${movement.iso}-${index}`} className="strata-movement-item"><div className="strata-mov-date">{formatDate(movement.iso)}</div><div className="strata-mov-concept"><strong>{movement.type === 'increment' ? 'Aportación de capital' : 'Retirada de capital'}</strong><span>{movement.balance ? `Saldo tras movimiento: ${formatCurrency(movement.balance)}` : 'Movimiento registrado'}</span></div><div className={`strata-mov-amount ${movement.type === 'increment' ? 'is-pos' : 'is-neg'}`}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</div></article>)}</div>{!report.movements.some((movement) => effectivePoints.some((point) => movement.iso.startsWith(point.key))) ? <p className="strata-no-movements">Sin movimientos de tesorería dentro del periodo.</p> : null}</section>

      <footer className="strata-footer"><div className="strata-formula-banner"><span className="strata-formula-title">Conciliación contable verificada</span><div className="strata-formula-equation"><span>Capital neto aportado <strong>{formatCurrency(visibleNetCapital)}</strong></span><b>+</b><span>Beneficio total acumulado <strong className="strata-text-gold">{signedMoney(report.beneficioTotal)}</strong></span><b>=</b><span className="is-final">Saldo final en custodia <strong>{formatCurrency(visibleBalance)}</strong></span></div><i className={reconciled ? 'is-ok' : 'is-review'}>{reconciled ? 'Cuadre exacto al céntimo' : 'Revisar conciliación'}</i></div><div className="strata-footer-meta"><p>Metodología de rentabilidad basada en TWR y conciliación de flujos de capital registrados.</p><span>Identificador: {report.clientId} · Sellado temporal: {new Date(report.createdAt).toLocaleString('es-ES')}</span></div></footer>
    </div>
  );
};
