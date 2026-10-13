import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './StrataAtlasReportPage.css';

interface AtlasPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface StrataAtlasReportPageProps {
  report: ReportData;
  pendingCashMovements?: AtlasPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface AtlasPoint {
  key: string;
  label: string;
  shortLabel: string;
  year: string;
  balance: number;
  capital: number;
  benefit: number;
  monthlyProfit: number;
  monthlyReturn: number;
  openingBalance: number;
  increments: number;
  decrements: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type AtlasPeriod = 'all' | '12m' | string;

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

const sumMovements = (
  movements: Array<{ type: string; amount: number }>,
  type: 'increment' | 'decrement'
) => movements.filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

export const StrataAtlasReportPage: React.FC<StrataAtlasReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const pendingMovements = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumMovements(pendingMovements, 'increment');
  const pendingDecrements = sumMovements(pendingMovements, 'decrement');
  const publishedNetCapital = report.incrementos - report.decrementos;
  const visibleNetCapital = publishedNetCapital + pendingIncrements - pendingDecrements;
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleBenefit = report.beneficioTotal;

  const points = useMemo<AtlasPoint[]>(() => {
    const monthly = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(monthly[monthly.length - 1]?.month ?? '');
    const movements = report.movements ?? [];
    const movementNet = sumMovements(movements, 'increment') - sumMovements(movements, 'decrement');
    const openingCapital = publishedNetCapital - movementNet;
    const breakdowns = new Map(
      (report.contributionBreakdowns ?? []).map((breakdown) => [monthToKey(breakdown.month), breakdown])
    );

    return monthly.map((month) => {
      const key = monthToKey(month.month);
      const monthMovements = movements.filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(monthMovements, 'increment');
      const decrements = sumMovements(monthMovements, 'decrement');
      const cumulativeMovementNet = movements
        .filter((movement) => movement.iso.slice(0, 7) <= key)
        .reduce((sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount), 0);
      const capital = Math.max(0, openingCapital + cumulativeMovementNet);
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const monthlyProfit = Number.isFinite(month.profit) ? month.profit : 0;
      const monthlyReturn = key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
        ? report.rentabilidadUltimoMes
        : Number.isFinite(month.profitPct) ? month.profitPct : 0;

      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        year: key.slice(0, 4),
        balance,
        capital,
        benefit: balance - capital,
        monthlyProfit,
        monthlyReturn,
        openingBalance: balance - monthlyProfit - increments + decrements,
        increments,
        decrements,
        movements: monthMovements,
        breakdown: breakdowns.get(key)
      };
    });
  }, [publishedNetCapital, report]);

  const latestKey = points[points.length - 1]?.key ?? '';
  const years = useMemo(() => [...new Set(points.map((point) => point.year))], [points]);
  const [period, setPeriod] = useState<AtlasPeriod>('all');
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [showAudit, setShowAudit] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriod('all');
    setFocusedKey(latestKey);
    setIsMapExpanded(false);
    setShowAudit(true);
  }, [latestKey, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!isMapExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMapExpanded(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [isMapExpanded]);

  const visiblePoints = useMemo(() => {
    if (period === 'all') return points;
    if (period === '12m') return points.slice(-12);
    return points.filter((point) => point.year === period);
  }, [period, points]);

  useEffect(() => {
    if (!visiblePoints.length) return;
    if (!visiblePoints.some((point) => point.key === focusedKey)) {
      setFocusedKey(visiblePoints[visiblePoints.length - 1].key);
    }
  }, [focusedKey, visiblePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const frame = window.requestAnimationFrame(() => {
      map.scrollLeft = Math.max(0, map.scrollWidth - map.clientWidth);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [period, report.clientId, visiblePoints.length]);

  const focusedPoint = visiblePoints.find((point) => point.key === focusedKey)
    ?? visiblePoints[visiblePoints.length - 1]
    ?? points[points.length - 1];
  const focusedIndex = visiblePoints.findIndex((point) => point.key === focusedPoint?.key);
  const periodLabel = visiblePoints.length
    ? `${visiblePoints[0].shortLabel} — ${visiblePoints[visiblePoints.length - 1].shortLabel}`
    : 'Sin cierres publicados';
  const periodFlow = visiblePoints.reduce((sum, point) => sum + point.increments - point.decrements, 0);
  const solidityRatio = visibleBalance ? visibleNetCapital / visibleBalance * 100 : 0;
  const firstDate = [...(report.movements ?? []).map((movement) => movement.iso), ...(points[0] ? [`${points[0].key}-01`] : [])].sort()[0];
  const reconciled = Math.abs(visibleNetCapital + visibleBenefit - visibleBalance) <= 0.02;

  const chart = useMemo(() => {
    const width = 1320;
    const height = 570;
    const left = 92;
    const right = 1280;
    const top = 48;
    const bottom = 484;
    const maxValue = Math.max(1, visibleBalance, ...visiblePoints.flatMap((point) => [point.balance, point.capital])) * 1.12;
    const xFor = (index: number) => visiblePoints.length === 1
      ? (left + right) / 2
      : left + index / (visiblePoints.length - 1) * (right - left);
    const yFor = (value: number) => bottom - Math.max(0, value) / maxValue * (bottom - top);
    const mapped = visiblePoints.map((point, index) => ({
      point,
      x: xFor(index),
      summitY: yFor(point.balance),
      capitalY: yFor(point.capital)
    }));
    const summitPath = smoothPath(mapped.map((item) => ({ x: item.x, y: item.summitY })));
    const capitalPath = mapped.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.capitalY}`).join(' ');
    const bedrockArea = mapped.length
      ? `${capitalPath} L ${mapped[mapped.length - 1].x} ${bottom} L ${mapped[0].x} ${bottom} Z`
      : '';
    const mineralArea = mapped.length
      ? `${summitPath} ${[...mapped].reverse().map((item) => `L ${item.x} ${item.capitalY}`).join(' ')} Z`
      : '';
    const contourPaths = [0.22, 0.48, 0.74].map((ratio) => smoothPath(mapped.map((item) => ({
      x: item.x,
      y: bottom - (bottom - item.capitalY) * ratio
    }))));
    return { width, height, left, right, top, bottom, maxValue, mapped, summitPath, capitalPath, bedrockArea, mineralArea, contourPaths };
  }, [visibleBalance, visiblePoints]);

  const focusPoint = useCallback((key: string, source: string) => {
    setFocusedKey(key);
    onAnalyticsEvent?.({ type: 'atlas_borehole_focus', label: key, metadata: { source } });
  }, [onAnalyticsEvent]);

  const focusFromPointer = useCallback((clientX: number) => {
    const map = mapRef.current;
    if (!map || !visiblePoints.length) return;
    const rect = map.getBoundingClientRect();
    const contentX = map.scrollLeft + clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, contentX / Math.max(1, map.scrollWidth)));
    const index = Math.round(ratio * (visiblePoints.length - 1));
    const point = visiblePoints[index];
    if (point) focusPoint(point.key, 'scrub');
  }, [focusPoint, visiblePoints]);

  const stepFocus = (direction: -1 | 1) => {
    const point = visiblePoints[focusedIndex + direction];
    if (point) focusPoint(point.key, 'keyboard');
  };

  const focusedGeometry = chart.mapped.find((item) => item.point.key === focusedPoint?.key);
  const maxProfit = Math.max(1, ...visiblePoints.map((point) => Math.abs(point.monthlyProfit)));
  const coreCapitalRatio = focusedPoint?.balance
    ? Math.max(0, Math.min(100, focusedPoint.capital / focusedPoint.balance * 100))
    : 0;
  const equationDifference = focusedPoint
    ? focusedPoint.balance - focusedPoint.openingBalance - focusedPoint.increments + focusedPoint.decrements - focusedPoint.monthlyProfit
    : 0;

  return (
    <div className={`atlas-report ${isMapExpanded ? 'has-expanded-map' : ''}`} ref={rootRef} role="document">
      <header className="atlas-header">
        <div className="atlas-brand"><span className="atlas-brand-mark">SA</span><div><small>JIGSA CAPITAL · PRIVATE OFFICE</small><h1>The Strata Atlas</h1><p>Archivo geológico del capital</p></div></div>
        <div className="atlas-custody"><span>Cuenta patrimonial</span><strong>{report.clientCode}</strong><small>Custodia consolidada · EUR</small></div>
        <button type="button" className="atlas-download" onClick={() => { onAnalyticsEvent?.({ type: 'atlas_pdf_download', label: periodLabel }); void onDownload?.(); }}><span>↓</span><div><small>Documento oficial</small><strong>Descargar PDF</strong></div></button>
      </header>

      <section className="atlas-summit" aria-label="Cota superior del patrimonio">
        <div className="atlas-summit-copy"><span>Altitud patrimonial · Cima reconciliada</span><strong>{formatCurrency(visibleBalance)}{pendingMovements.length ? <sup>*</sup> : null}</strong><p>Formación construida desde {firstDate ? formatDate(firstDate) : 'el primer cierre publicado'}.</p></div>
        <div className="atlas-summit-composition" aria-label="Composición de la cima patrimonial">
          <article><small>Rocamadre neta</small><strong>{formatCurrency(visibleNetCapital)}</strong><i style={{ width: `${Math.max(4, Math.min(100, solidityRatio))}%` }} /></article>
          <article><small>Mineralización acumulada</small><strong className={visibleBenefit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(visibleBenefit)}</strong><i className="is-mineral" style={{ width: `${Math.max(4, Math.min(100, 100 - solidityRatio))}%` }} /></article>
          <article><small>Coeficiente de ascensión · TWR</small><strong className={(report.twrYtd ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong><em>Rendimiento puro de la estrategia</em></article>
        </div>
      </section>

      {pendingMovements.length ? <aside className="atlas-pending" role="status"><span className="atlas-pending-signal" /><div><strong>Capa en proceso de consolidación</strong><p>El saldo superior ya incorpora movimientos posteriores al último cierre.</p></div><div className="atlas-pending-list">{pendingMovements.map((movement, index) => <span key={`${movement.iso}-${index}`}><small>{formatDate(movement.iso)} · {movement.type === 'increment' ? 'Aportación' : 'Retirada'}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></span>)}</div></aside> : null}

      <nav className="atlas-period-bar" aria-label="Selector del corte temporal">
        <div><small>Corte temporal activo</small><strong>{periodLabel}</strong><span>Flujo neto del periodo {signedMoney(periodFlow)}</span></div>
        <div role="group" aria-label="Periodos disponibles">
          <button type="button" className={period === 'all' ? 'is-active' : ''} aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>Ciclo completo</button>
          <button type="button" className={period === '12m' ? 'is-active' : ''} aria-pressed={period === '12m'} onClick={() => setPeriod('12m')}>Últimos 12 meses</button>
          {years.map((year) => <button type="button" key={year} className={period === year ? 'is-active' : ''} aria-pressed={period === year} onClick={() => setPeriod(year)}>{year}</button>)}
        </div>
      </nav>

      <section className={`atlas-topography ${isMapExpanded ? 'is-expanded' : ''}`} aria-label="Corte estratigráfico patrimonial">
        <header className="atlas-section-heading"><div><small>Plano maestro · Estratigrafía financiera</small><h2>Corte patrimonial consolidado</h2><p>La roca representa el capital neto. La veta superior muestra exclusivamente el beneficio generado.</p></div><button type="button" className="atlas-expand" aria-pressed={isMapExpanded} onClick={() => setIsMapExpanded((value) => !value)}>{isMapExpanded ? '✕ Cerrar mapa' : '⛶ Ampliar mapa'}</button></header>
        {visiblePoints.length ? <>
          <div className="atlas-map-hud" aria-live="polite"><span><small>Sondeo activo</small><strong>{focusedPoint?.label}</strong></span><span><small>Cota de cierre</small><strong>{formatCurrency(focusedPoint?.balance ?? 0)}</strong></span><span><small>Roca capital</small><strong>{formatCurrency(focusedPoint?.capital ?? 0)}</strong></span><span><small>Veta beneficio</small><strong className={(focusedPoint?.benefit ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedPoint?.benefit ?? 0)}</strong></span></div>
          <div className="atlas-map" ref={mapRef} onPointerMove={(event) => { if (event.pointerType === 'mouse' || event.buttons === 1) focusFromPointer(event.clientX); }} onPointerDown={(event) => focusFromPointer(event.clientX)}>
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="atlas-map-svg" role="application" tabIndex={0} aria-label={`Mapa topográfico interactivo de ${periodLabel}. Usa las flechas para cambiar de mes.`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } }}>
              <defs>
                <linearGradient id="atlas-bedrock-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34465a" /><stop offset="0.45" stopColor="#202c39" /><stop offset="1" stopColor="#111820" /></linearGradient>
                <linearGradient id="atlas-mineral-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8f713b" /><stop offset="0.45" stopColor="#d2b066" /><stop offset="1" stopColor="#2a9d8f" /></linearGradient>
                <pattern id="atlas-rock-pattern" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M-2 4L4-2M0 12L12 0M8 14L14 8" stroke="rgba(255,255,255,.07)" strokeWidth="1" /></pattern>
                <pattern id="atlas-mineral-pattern" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="rgba(255,255,255,.22)" /><circle cx="10" cy="9" r=".8" fill="rgba(255,255,255,.13)" /></pattern>
                <pattern id="atlas-pending-pattern" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0" stroke="#e4c66f" strokeWidth="2" opacity=".7" /></pattern>
                <filter id="atlas-glow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#d2b066" floodOpacity=".6" /></filter>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => { const y = chart.bottom - ratio * (chart.bottom - chart.top); return <g className="atlas-gridline" key={ratio}><line x1={chart.left} x2={chart.right} y1={y} y2={y} /><text x={chart.left - 16} y={y + 4} textAnchor="end">{compactMoney(chart.maxValue * ratio)} €</text></g>; })}
              <path className="atlas-bedrock-area" d={chart.bedrockArea} fill="url(#atlas-bedrock-gradient)" />
              <path className="atlas-bedrock-texture" d={chart.bedrockArea} fill="url(#atlas-rock-pattern)" />
              {chart.contourPaths.map((path, index) => <path className="atlas-contour" d={path} key={index} />)}
              <path className="atlas-capital-ridge" d={chart.capitalPath} />
              <path className="atlas-mineral-area" d={chart.mineralArea} fill="url(#atlas-mineral-gradient)" />
              <path className="atlas-mineral-texture" d={chart.mineralArea} fill="url(#atlas-mineral-pattern)" />
              <path className="atlas-summit-line" d={chart.summitPath} filter="url(#atlas-glow)" />
              {chart.mapped.flatMap((item) => item.point.movements.map((movement, index) => { const offset = (index - (item.point.movements.length - 1) / 2) * 34; return <g className={`atlas-flow-marker ${movement.type === 'increment' ? 'is-increment' : 'is-decrement'}`} key={`${movement.iso}-${index}`} transform={`translate(${item.x + offset} ${item.capitalY})`} role="button" tabIndex={0} aria-label={`${movement.type === 'increment' ? 'Aportación' : 'Retirada'} de ${formatCurrency(movement.amount)} el ${formatDate(movement.iso)}`} onClick={() => focusPoint(item.point.key, 'movement')}><line y1="-5" y2="-48" /><path d={movement.type === 'increment' ? 'M -8 -36 L 0 -50 L 8 -36 Z' : 'M -8 -50 L 0 -36 L 8 -50 Z'} /><text y="-58" textAnchor="middle">{movement.type === 'increment' ? '+' : '−'}{compactMoney(movement.amount)} €</text></g>; }))}
              {focusedGeometry ? <g className="atlas-borehole" transform={`translate(${focusedGeometry.x} 0)`}><line y1={chart.top} y2={chart.bottom} /><circle cy={focusedGeometry.summitY} r="8" /><circle className="is-capital" cy={focusedGeometry.capitalY} r="6" /><text y={chart.top - 14} textAnchor="middle">SONDEO · {focusedGeometry.point.shortLabel}</text></g> : null}
              {pendingMovements.length && chart.mapped.length ? <g className="atlas-surface-pending"><rect x={chart.right - 46} y={chart.mapped[chart.mapped.length - 1].summitY - 17} width="46" height="17" fill="url(#atlas-pending-pattern)" /><text x={chart.right - 4} y={chart.mapped[chart.mapped.length - 1].summitY - 25} textAnchor="end">CAPA PENDIENTE {signedMoney(pendingIncrements - pendingDecrements)}</text></g> : null}
              {chart.mapped.map((item, index) => { const showLabel = visiblePoints.length <= 12 || index % Math.ceil(visiblePoints.length / 10) === 0 || index === visiblePoints.length - 1; return <g key={item.point.key}><g role="button" tabIndex={0} aria-label={`Sondear ${item.point.label}. Saldo ${formatCurrency(item.point.balance)}`} onClick={() => focusPoint(item.point.key, 'point')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusPoint(item.point.key, 'point-keyboard'); } }}><circle className={item.point.key === focusedPoint?.key ? 'atlas-point is-active' : 'atlas-point'} cx={item.x} cy={item.summitY} r={item.point.key === focusedPoint?.key ? 7 : 5} /></g>{showLabel ? <text className="atlas-month-label" x={item.x} y={chart.bottom + 32} textAnchor="middle">{item.point.shortLabel}</text> : null}</g>; })}
            </svg>
          </div>
          <div className="atlas-map-legend"><span><i className="is-rock" />Rocamadre · Capital neto</span><span><i className="is-mineral" />Veta mineral · Beneficio</span><span><i className="is-increment" />Inyección de capital</span><span><i className="is-decrement" />Extracción</span></div>
          {isMapExpanded ? <small className="atlas-expanded-hint">Desliza sobre el mapa · Flechas para cambiar de sondeo · ESC para salir</small> : null}
        </> : <div className="atlas-empty"><span>SA</span><h3>Cimiento listo para la primera sedimentación de cierre</h3><p>La topografía aparecerá con el primer cierre mensual publicado.</p></div>}
      </section>

      <section className="atlas-mass-grid" aria-label="Indicadores de masa y densidad patrimonial">
        <article><small>Masa de rocamadre</small><strong>{formatCurrency(visibleNetCapital)}</strong><p>Capital aportado menos capital retirado.</p></article>
        <article><small>Mineralización neta</small><strong className={visibleBenefit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(visibleBenefit)}</strong><p>Beneficio acumulado consolidado.</p></article>
        <article><small>TWR estratigráfico</small><strong className={(report.twrYtd ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent((report.twrYtd ?? 0) * 100)}</strong><p>Ascensión pura, aislando los flujos.</p></article>
        <article><small>Ratio de solidez</small><strong>{solidityRatio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</strong><p>Peso del capital neto sobre la cima actual.</p></article>
      </section>

      {focusedPoint ? <section className="atlas-inspector" aria-label="Testigo de sondeo del mes seleccionado">
        <header><div><small>Testigo de perforación · Composición molecular</small><h2>{focusedPoint.label}</h2><p>Lectura exacta de la formación patrimonial en el cierre seleccionado.</p></div><div className="atlas-inspector-nav"><button type="button" disabled={focusedIndex <= 0} onClick={() => stepFocus(-1)}>← Anterior</button><span>{focusedIndex + 1} / {visiblePoints.length}</span><button type="button" disabled={focusedIndex >= visiblePoints.length - 1} onClick={() => stepFocus(1)}>Siguiente →</button></div></header>
        <div className="atlas-inspector-body">
          <div className="atlas-core-sample" aria-label={`Testigo compuesto por ${coreCapitalRatio.toFixed(2)} por ciento de capital`}><div className="atlas-core-cap"><span>Cota</span><strong>{formatCurrency(focusedPoint.balance)}</strong></div><div className="atlas-core-mineral" style={{ flexBasis: `${Math.max(8, 100 - coreCapitalRatio)}%` }}><small>Beneficio consolidado</small><strong>{signedMoney(focusedPoint.benefit)}</strong></div><div className="atlas-core-rock" style={{ flexBasis: `${Math.max(18, coreCapitalRatio)}%` }}><small>Capital neto</small><strong>{formatCurrency(focusedPoint.capital)}</strong></div></div>
          <div className="atlas-inspector-data"><div className="atlas-cycle-equation"><span><small>Saldo inicial</small><strong>{formatCurrency(focusedPoint.openingBalance)}</strong></span><b>+</b><span><small>Aportaciones</small><strong>{focusedPoint.increments ? `+${formatCurrency(focusedPoint.increments)}` : '—'}</strong></span><b>−</b><span><small>Retiradas</small><strong>{focusedPoint.decrements ? formatCurrency(focusedPoint.decrements) : '—'}</strong></span><b>+</b><span><small>Mineralización del mes</small><strong className={focusedPoint.monthlyProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedPoint.monthlyProfit)}</strong></span><b>=</b><span className="is-final"><small>Cota final</small><strong>{formatCurrency(focusedPoint.balance)}</strong></span></div><div className="atlas-inspector-summary"><article><small>Rendimiento del ciclo</small><strong className={focusedPoint.monthlyReturn >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(focusedPoint.monthlyReturn)}</strong></article><article><small>Flujos registrados</small><strong>{focusedPoint.movements.length}</strong></article><article><small>Control de cierre</small><strong className={Math.abs(equationDifference) <= 0.02 ? 'is-positive' : 'is-negative'}>{Math.abs(equationDifference) <= 0.02 ? 'Exacto' : formatCurrency(equationDifference)}</strong></article></div>
            {focusedPoint.breakdown ? <div className="atlas-tranches"><span>Estratos intramensuales auditados</span><div><article><small>Posición inicial · ciclo completo</small><strong>{formatCurrency(focusedPoint.breakdown.initialCapital)}</strong><p>{signedPercent(focusedPoint.breakdown.initialReturnPct * 100)} · {signedMoney(focusedPoint.breakdown.initialProfit)}</p></article>{focusedPoint.breakdown.contributions.map((contribution, index) => <article key={`${contribution.iso}-${index}`}><small>Aportación incorporada · {formatDate(contribution.iso)}</small><strong>+{formatCurrency(contribution.amount)}</strong><p>{signedPercent(contribution.returnPct * 100)} · {signedMoney(contribution.profit)}</p></article>)}{(focusedPoint.breakdown.withdrawals ?? []).map((withdrawal, index) => <article key={`${withdrawal.iso}-${index}`}><small>Posición retirada · {formatDate(withdrawal.iso)}</small><strong>−{formatCurrency(withdrawal.amount)}</strong><p>{withdrawal.returnPct === undefined ? 'Sin rendimiento específico' : `${signedPercent(withdrawal.returnPct * 100)} · ${signedMoney(withdrawal.profit)}`}</p></article>)}</div></div> : <p className="atlas-no-tranches">Este cierre no contiene estratos intramensuales con rentabilidad específica.</p>}
          </div>
        </div>
      </section> : null}

      <section className="atlas-sedimentation" aria-label="Sedimentación mensual del beneficio">
        <header><div><small>Actividad superficial</small><h2>Sedimentación mensual</h2><p>Beneficio generado en euros durante cada ciclo de cierre.</p></div><strong>{visiblePoints.length} estratos</strong></header>
        <div className="atlas-profit-columns" style={{ gridTemplateColumns: `repeat(${visiblePoints.length}, minmax(62px, 1fr))` }}>{visiblePoints.map((point) => <button type="button" key={point.key} className={point.key === focusedPoint.key ? 'is-active' : ''} onClick={() => focusPoint(point.key, 'sedimentation')} aria-label={`${point.label}: ${signedMoney(point.monthlyProfit)}`}><span>{signedMoney(point.monthlyProfit)}</span><i className={point.monthlyProfit >= 0 ? 'is-positive' : 'is-negative'} style={{ height: `${Math.max(8, Math.abs(point.monthlyProfit) / maxProfit * 100)}%` }} /><small>{point.shortLabel}</small></button>)}</div>
      </section>

      <section className="atlas-ledger" aria-label="Matriz litográfica de conciliación">
        <header><div><small>Archivo técnico · Auditoría</small><h2>Matriz de sedimentación cronológica</h2><p>Cada fila demuestra cómo se forma la cota final del periodo.</p></div><button type="button" aria-expanded={showAudit} onClick={() => setShowAudit((value) => !value)}>{showAudit ? 'Ocultar matriz' : 'Mostrar matriz'}</button></header>
        {showAudit ? <div className="atlas-ledger-table" role="table"><div className="atlas-ledger-head" role="row"><span role="columnheader">Estrato</span><span role="columnheader">Saldo inicial</span><span role="columnheader">Inyecciones</span><span role="columnheader">Erosión</span><span role="columnheader">Mineralización</span><span role="columnheader">TWR</span><span role="columnheader">Cota final</span></div><div role="rowgroup">{[...visiblePoints].reverse().map((point) => <button type="button" role="row" key={point.key} className={`atlas-ledger-row ${point.key === focusedPoint.key ? 'is-active' : ''}`} onClick={() => focusPoint(point.key, 'ledger')}><span role="cell" data-label="Estrato"><strong>{point.label}</strong>{point.movements.length ? <small>{point.movements.length} evento{point.movements.length === 1 ? '' : 's'}</small> : null}</span><span role="cell" data-label="Saldo inicial">{formatCurrency(point.openingBalance)}</span><span role="cell" data-label="Inyecciones" className="is-increment">{point.increments ? `+${formatCurrency(point.increments)}` : '—'}</span><span role="cell" data-label="Erosión" className="is-decrement">{point.decrements ? `−${formatCurrency(point.decrements)}` : '—'}</span><span role="cell" data-label="Mineralización" className={point.monthlyProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(point.monthlyProfit)}</span><span role="cell" data-label="TWR" className={point.monthlyReturn >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(point.monthlyReturn)}</span><span role="cell" data-label="Cota final"><strong>{formatCurrency(point.balance)}</strong></span></button>)}</div></div> : null}
      </section>

      <section className="atlas-movement-register" aria-label="Registro geológico de movimientos"><header><div><small>Eventos de formación</small><h2>Registro de inyecciones y extracciones</h2></div><strong>{report.movements.length} eventos</strong></header><div>{[...(report.movements ?? [])].sort((left, right) => right.iso.localeCompare(left.iso)).map((movement, index) => <article key={`${movement.iso}-${index}`} className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}><time>{formatDate(movement.iso)}</time><span><small>{movement.type === 'increment' ? 'Inyección de rocamadre' : 'Extracción de posición'}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></span><i>{movement.returnPct === undefined ? 'Movimiento consolidado' : `Rendimiento específico ${signedPercent(movement.returnPct * 100)}`}</i></article>)}</div></section>

      <footer className="atlas-footer"><div><small>Ecuación litográfica de conciliación</small><p><span>Rocamadre neta <strong>{formatCurrency(visibleNetCapital)}</strong></span><b>+</b><span>Mineralización <strong className={visibleBenefit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(visibleBenefit)}</strong></span><b>=</b><span className="is-final">Cima patrimonial <strong>{formatCurrency(visibleBalance)}</strong></span></p><em className={reconciled ? 'is-reconciled' : 'is-review'}>{reconciled ? 'Formación reconciliada al céntimo' : 'Formación pendiente de revisión'}</em></div><p>El capital aportado y el beneficio generado permanecen identificados como capas independientes. El TWR mide la evolución de la estrategia aislando aportaciones y retiradas.</p></footer>
    </div>
  );
};
