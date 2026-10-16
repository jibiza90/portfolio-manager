import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './LumenReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface LumenReportPageProps {
  report: ReportData;
  pendingCashMovements?: PendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface LumenMonth {
  key: string;
  label: string;
  shortLabel: string;
  opening: number;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  isPending?: boolean;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

interface LumenPoint extends LumenMonth {
  x: number;
  y: number;
}

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
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const dateLabel = (iso: string) => {
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

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M €`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);

const niceCeiling = (value: number) => {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
};

const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

const monthEndDay = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

export const LumenReportPage: React.FC<LumenReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const gradientId = useId().replace(/:/g, '');
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const monthRailRef = useRef<HTMLDivElement | null>(null);
  const monthButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const storyStartedAt = useRef(Date.now());
  const pointerStart = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [cinema, setCinema] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => movement.amount > 0 && Number.isFinite(movement.amount))
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const pendingNet = pendingIncrements - pendingDecrements;
  const visibleBalance = report.saldo + pendingNet;
  const publishedNetCapital = report.incrementos - report.decrementos;
  const visibleNetCapital = publishedNetCapital + pendingNet;
  const twrPct = Number(report.twrYtd ?? 0) * 100;

  const months = useMemo<LumenMonth[]>(() => {
    const balanceByMonth = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdownByMonth = new Map((report.contributionBreakdowns ?? [])
      .map((row) => [monthToKey(row.month), row]));
    const publishedRows = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const published = publishedRows.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balanceByMonth.get(row.key) ?? Number(row.endBalance || 0);
      const previousBalance = index > 0
        ? balanceByMonth.get(publishedRows[index - 1].key) ?? Number(publishedRows[index - 1].endBalance || 0)
        : undefined;
      const breakdown = breakdownByMonth.get(row.key);
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        opening: breakdown?.openingCapital ?? breakdown?.initialCapital ?? previousBalance ?? balance - increments + decrements - Number(row.profit || 0),
        balance,
        profit: Number(row.profit || 0),
        returnPct: index === publishedRows.length - 1 ? Number(report.rentabilidadUltimoMes || 0) : Number(row.profitPct || 0),
        increments,
        decrements,
        breakdown
      };
    });

    if (!pending.length) return published;
    return [...published, {
      key: `pending-${pending[pending.length - 1].iso}`,
      label: 'Capital posterior al cierre',
      shortLabel: 'Ahora',
      opening: report.saldo,
      balance: visibleBalance,
      profit: 0,
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      isPending: true
    }];
  }, [pending, pendingDecrements, pendingIncrements, report, visibleBalance]);

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(months.length > 1);
    setLedgerOpen(false);
    storyStartedAt.current = Date.now();
  }, [months.length, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!playing || months.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= months.length - 1) {
          setPlaying(false);
          onAnalyticsEvent?.({
            type: 'report_lumen_story_complete',
            label: 'LUMEN recorrido completo',
            durationMs: Date.now() - storyStartedAt.current
          });
          return current;
        }
        return current + 1;
      });
    }, activeIndex === 0 ? 1800 : 2400);
    return () => window.clearTimeout(timer);
  }, [activeIndex, months.length, onAnalyticsEvent, playing]);

  useEffect(() => {
    const active = months[activeIndex];
    const rail = monthRailRef.current;
    const button = active ? monthButtonRefs.current[active.key] : null;
    if (!rail || !button) return;
    const target = Math.max(0, Math.min(
      rail.scrollWidth - rail.clientWidth,
      button.offsetLeft + button.offsetWidth / 2 - rail.clientWidth / 2
    ));
    rail.scrollTo({ left: target, behavior: 'smooth' });
  }, [activeIndex, months]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cinema) setCinema(false);
      if (event.key === 'ArrowLeft') {
        setPlaying(false);
        setActiveIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === 'ArrowRight') {
        setPlaying(false);
        setActiveIndex((current) => Math.min(months.length - 1, current + 1));
      }
      if (event.key === ' ' && cinema) {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cinema, months.length]);

  const chart = useMemo(() => {
    const width = Math.max(1720, 160 + Math.max(1, months.length - 1) * 132);
    const height = 760;
    const left = 128;
    const right = 90;
    const top = 82;
    const baseline = 594;
    const plotWidth = width - left - right;
    const ceiling = niceCeiling(Math.max(1, ...months.map((month) => Math.max(0, month.balance))) * 1.05);
    const points: LumenPoint[] = months.map((month, index) => ({
      ...month,
      x: months.length === 1 ? left + plotWidth / 2 : left + index / (months.length - 1) * plotWidth,
      y: baseline - Math.max(0, month.balance) / ceiling * (baseline - top)
    }));
    const path = smoothPath(points);
    const area = points.length
      ? `${path} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : '';
    const echoPath = smoothPath(points.map((point) => ({ x: point.x + 24, y: point.y + 24 })));
    const ticks = Array.from({ length: 5 }, (_, index) => ({
      value: ceiling * index / 4,
      y: baseline - (baseline - top) * index / 4
    }));
    return { width, height, left, right, top, baseline, ceiling, points, path, area, echoPath, ticks };
  }, [months]);

  const active = months[activeIndex] ?? months[months.length - 1];
  const activePoint = chart.points[activeIndex] ?? chart.points[chart.points.length - 1];
  const progress = months.length > 1 ? activeIndex / (months.length - 1) * 100 : 100;
  const maxAbsReturn = Math.max(1, ...months.filter((month) => !month.isPending).map((month) => Math.abs(month.returnPct)));
  const activeFlow = (active?.increments ?? 0) - (active?.decrements ?? 0);
  const activeBreakdown = active?.breakdown;

  useEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport || !activePoint || viewport.scrollWidth <= viewport.clientWidth + 2) return;
    const scale = viewport.scrollWidth / chart.width;
    const target = Math.max(0, Math.min(
      viewport.scrollWidth - viewport.clientWidth,
      activePoint.x * scale - viewport.clientWidth * 0.5
    ));
    viewport.scrollTo({ left: target, behavior: 'smooth' });
  }, [activePoint, chart.width]);

  const selectMonth = (index: number, source: string) => {
    setPlaying(false);
    setActiveIndex(index);
    onAnalyticsEvent?.({ type: 'report_lumen_month', label: `LUMEN ${source} ${months[index]?.label ?? index}` });
  };

  const replay = () => {
    storyStartedAt.current = Date.now();
    setActiveIndex(0);
    setPlaying(true);
    onAnalyticsEvent?.({ type: 'report_lumen_replay', label: 'LUMEN reproducir recorrido' });
  };

  const narrative = useMemo(() => {
    if (!active) return 'Todavía no hay cierres publicados.';
    if (active.isPending) {
      const actions = [
        active.increments > 0 ? `se han incorporado ${formatCurrency(active.increments)}` : '',
        active.decrements > 0 ? `se han retirado ${formatCurrency(active.decrements)}` : ''
      ].filter(Boolean).join(' y ');
      return `Después del último cierre ${actions}. El movimiento ya forma parte de la posición visible y su rendimiento se integrará en el próximo cierre publicado.`;
    }
    if (active.breakdown) {
      const movements = active.breakdown.contributions.length + (active.breakdown.withdrawals?.length ?? 0);
      return `${active.label} se calcula en ${movements + 1} tramos de capital. Cada importe conserva únicamente la rentabilidad correspondiente al tiempo que permaneció invertido.`;
    }
    if (active.profit >= 0) {
      return `${active.label} generó ${signedMoney(active.profit)} con una rentabilidad de ${signedPercent(active.returnPct)}. La posición cerró en ${formatCurrency(active.balance)}.`;
    }
    return `${active.label} registró ${signedMoney(active.profit)} con una rentabilidad de ${signedPercent(active.returnPct)}. La posición cerró en ${formatCurrency(active.balance)}.`;
  }, [active]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    pointerStart.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) < 50) return;
    setPlaying(false);
    setActiveIndex((current) => delta < 0
      ? Math.min(months.length - 1, current + 1)
      : Math.max(0, current - 1));
  };

  const currentDate = new Date(report.createdAt || Date.now()).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const latestPublished = [...months].reverse().find((month) => !month.isPending);
  const capitalShare = visibleBalance > 0 ? Math.max(0, Math.min(100, visibleNetCapital / visibleBalance * 100)) : 0;
  const resultShare = Math.max(0, 100 - capitalShare);

  return (
    <article className={`lumen-root${cinema ? ' is-cinema' : ''}`} ref={rootRef}>
      <div className="lumen-atmosphere" aria-hidden="true"><i /><i /><i /></div>

      <header className="lumen-header">
        <a className="lumen-wordmark" href="#lumen-top" aria-label="Ir al inicio de LUMEN">
          <span aria-hidden="true"><i /><i /><i /></span>
          <div><strong>LUMEN</strong><small>PATRIMONIO VIVO</small></div>
        </a>
        <div className="lumen-report-id">
          <span><i /> INFORME SINCRONIZADO</span>
          <small>{report.clientCode} · {currentDate}</small>
        </div>
        <div className="lumen-actions">
          <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'LUMEN PDF oficial' }); void onDownload?.(); }}>Descargar PDF</button>
          <button type="button" className="is-primary" onClick={() => { setCinema((value) => !value); onAnalyticsEvent?.({ type: 'report_lumen_cinema', label: 'LUMEN vista inmersiva' }); }}>{cinema ? 'Cerrar' : 'Presentar'}</button>
        </div>
      </header>

      <main id="lumen-top">
        <section className="lumen-hero" aria-labelledby="lumen-title">
          <div className="lumen-hero-copy">
            <p className="lumen-eyebrow">TU POSICIÓN, EXPLICADA POR EL TIEMPO</p>
            <h1 id="lumen-title">El capital deja huella.<br /><em>Aquí puedes verla.</em></h1>
            <p className="lumen-intro">Un recorrido vivo desde el primer cierre hasta hoy. Sin promedios ocultos: cada aportación, retirada y resultado ocupa su lugar exacto.</p>
          </div>
          <div className="lumen-balance">
            <span>Posición visible actual</span>
            <strong>{formatCurrency(visibleBalance)}</strong>
            {pending.length > 0 ? <small><i /> Incluye {signedMoney(pendingNet)} posteriores al último cierre</small> : <small>Cierre publicado · {latestPublished?.label ?? 'Sin periodos'}</small>}
          </div>

          <div className="lumen-primary-metrics" aria-label="Indicadores principales">
            <article>
              <span>Resultado · {latestPublished?.label ?? 'último mes'}</span>
              <strong className={tone(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong>
              <small>Beneficio generado durante el último cierre publicado</small>
            </article>
            <article>
              <span>Rentabilidad · {latestPublished?.label ?? 'último mes'}</span>
              <strong className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong>
              <small>Rendimiento del capital durante ese periodo</small>
            </article>
            <article>
              <span>TWR acumulado</span>
              <strong className={tone(twrPct)}>{signedPercent(twrPct)}</strong>
              <small>Rendimiento aislando aportaciones y retiradas</small>
            </article>
          </div>
        </section>

        <section className="lumen-trajectory" aria-labelledby="lumen-trajectory-title">
          <header className="lumen-section-heading">
            <div>
              <p>01 · TRAYECTORIA VIVA</p>
              <h2 id="lumen-trajectory-title">Tu patrimonio no es una cifra.<br />Es una historia en movimiento.</h2>
            </div>
            <div className="lumen-story-controls">
              <button type="button" onClick={replay} aria-label="Reproducir desde el inicio">↺ <span>Desde el inicio</span></button>
              <button type="button" className="is-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pausar recorrido' : 'Continuar recorrido'}>{playing ? 'Ⅱ' : '▶'}</button>
              <span>{playing ? 'RECORRIDO EN CURSO' : 'EXPLORACIÓN MANUAL'}</span>
            </div>
          </header>

          <div
            className="lumen-stage"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            style={{ '--lumen-focus': `${activePoint ? activePoint.x / chart.width * 100 : 50}%` } as React.CSSProperties}
          >
            <div className="lumen-stage-meta">
              <span>{active?.isPending ? 'AHORA' : active?.label.toUpperCase()}</span>
              <strong>{formatCurrency(active?.balance ?? 0)}</strong>
              <small className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Rendimiento pendiente de cierre' : signedPercent(active?.returnPct ?? 0)}</small>
            </div>
            <div className="lumen-chart-viewport" ref={chartViewportRef}>
              <svg
                className="lumen-chart"
                style={{ minWidth: `${Math.max(1180, months.length * 112)}px` }}
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                role="img"
                aria-labelledby="lumen-chart-title lumen-chart-description"
              >
                <title id="lumen-chart-title">Evolución del valor de la cartera</title>
                <desc id="lumen-chart-description">La trayectoria muestra el valor de cierre de cada mes. Selecciona cualquier punto para consultar su saldo, rentabilidad y movimientos.</desc>
                <defs>
                  <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8df2d2" stopOpacity=".42" /><stop offset=".52" stopColor="#7dc7e8" stopOpacity=".14" /><stop offset="1" stopColor="#7dc7e8" stopOpacity="0" /></linearGradient>
                  <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0b7370" /><stop offset=".48" stopColor="#00a88f" /><stop offset="1" stopColor="#004fd1" /></linearGradient>
                  <linearGradient id={`${gradientId}-scan`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#005dff" stopOpacity="0" /><stop offset=".42" stopColor="#005dff" stopOpacity=".55" /><stop offset="1" stopColor="#005dff" stopOpacity="0" /></linearGradient>
                  <radialGradient id={`${gradientId}-node`}><stop offset="0" stopColor="#ffffff" /><stop offset=".42" stopColor="#8df2d2" /><stop offset="1" stopColor="#007d78" /></radialGradient>
                  <filter id={`${gradientId}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="12" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  <filter id={`${gradientId}-soft`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="28" /></filter>
                  <clipPath id={`${gradientId}-reveal`}><rect className="lumen-reveal" x="0" y="0" width={activePoint ? activePoint.x + 3 : chart.width} height={chart.height} /></clipPath>
                  <pattern id={`${gradientId}-grid`} width="52" height="52" patternUnits="userSpaceOnUse"><path d="M 52 0 L 0 0 0 52" fill="none" stroke="rgba(14,57,64,.07)" strokeWidth="1" /></pattern>
                </defs>

                <rect width={chart.width} height={chart.height} fill={`url(#${gradientId}-grid)`} opacity=".8" />
                <g className="lumen-axis" aria-hidden="true">
                  {chart.ticks.map((tick) => <g key={tick.value}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} /><text x={chart.left - 24} y={tick.y + 4} textAnchor="end">{compactMoney(tick.value)}</text></g>)}
                </g>

                <path className="lumen-echo" d={chart.echoPath} />
                <path className="lumen-area-ghost" d={chart.area} />
                <g clipPath={`url(#${gradientId}-reveal)`}>
                  <path className="lumen-area" d={chart.area} fill={`url(#${gradientId}-area)`} />
                  <path className="lumen-line-glow" d={chart.path} filter={`url(#${gradientId}-glow)`} />
                  <path className="lumen-line" d={chart.path} stroke={`url(#${gradientId}-line)`} />
                </g>

                {activePoint ? <g className="lumen-scanner" aria-hidden="true">
                  <rect x={activePoint.x - 80} y={chart.top - 20} width="160" height={chart.baseline - chart.top + 90} rx="80" filter={`url(#${gradientId}-soft)`} />
                  <line x1={activePoint.x} x2={activePoint.x} y1={chart.top - 16} y2={chart.baseline + 38} stroke={`url(#${gradientId}-scan)`} />
                </g> : null}

                {chart.points.map((point, index) => {
                  const selected = index === activeIndex;
                  const revealed = index <= activeIndex;
                  const valueY = Math.max(52, point.y - 66);
                  return <g
                    key={point.key}
                    className={`lumen-point${selected ? ' is-selected' : ''}${revealed ? ' is-revealed' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${point.label}: ${formatCurrency(point.balance)}`}
                    onClick={() => selectMonth(index, 'trayectoria')}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectMonth(index, 'trayectoria'); }}
                  >
                    <line className="lumen-point-guide" x1={point.x} x2={point.x} y1={point.y} y2={chart.baseline} />
                    {point.increments > 0 ? <g className="lumen-flow is-in"><path d={`M ${point.x - 58} ${point.y + 62} L ${point.x - 8} ${point.y + 9}`} /><circle cx={point.x - 62} cy={point.y + 66} r="6" /><text x={point.x - 66} y={point.y + 91} textAnchor="middle">+{compactMoney(point.increments)}</text></g> : null}
                    {point.decrements > 0 ? <g className="lumen-flow is-out"><path d={`M ${point.x + 8} ${point.y + 9} L ${point.x + 58} ${point.y + 62}`} /><circle cx={point.x + 62} cy={point.y + 66} r="6" /><text x={point.x + 66} y={point.y + 91} textAnchor="middle">−{compactMoney(point.decrements)}</text></g> : null}
                    <circle className="lumen-node-aura" cx={point.x} cy={point.y} r={selected ? 29 : 17} />
                    <circle className="lumen-node" cx={point.x} cy={point.y} r={selected ? 9 : 5} fill={selected ? `url(#${gradientId}-node)` : undefined} />
                    {selected ? <g className="lumen-value-tag"><rect x={point.x - 103} y={valueY - 31} width="206" height="46" rx="23" /><text x={point.x} y={valueY - 1} textAnchor="middle">{formatCurrency(point.balance)}</text></g> : null}
                    <text className="lumen-month" x={point.x} y={chart.baseline + 50} textAnchor="middle">{point.shortLabel}</text>
                  </g>;
                })}
              </svg>
            </div>

            <div className="lumen-story-panel" aria-live="polite" key={active?.key}>
              <div><span>{String(activeIndex + 1).padStart(2, '0')}</span><i>—</i><small>{String(months.length).padStart(2, '0')}</small></div>
              <p>{narrative}</p>
              <dl>
                <div><dt>Flujo neto</dt><dd className={tone(activeFlow)}>{activeFlow ? signedMoney(activeFlow) : 'Sin movimientos'}</dd></div>
                <div><dt>Resultado</dt><dd className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Pendiente' : signedMoney(active?.profit ?? 0)}</dd></div>
                <div><dt>Cierre</dt><dd>{formatCurrency(active?.balance ?? 0)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="lumen-transport">
            <button type="button" onClick={() => selectMonth(Math.max(0, activeIndex - 1), 'anterior')} disabled={activeIndex === 0} aria-label="Mes anterior">←</button>
            <div className="lumen-progress" aria-label={`Recorrido completado al ${Math.round(progress)} por ciento`}><i style={{ width: `${progress}%` }} /><span style={{ left: `${progress}%` }} /></div>
            <button type="button" onClick={() => selectMonth(Math.min(months.length - 1, activeIndex + 1), 'siguiente')} disabled={activeIndex === months.length - 1} aria-label="Mes siguiente">→</button>
          </div>
          <div className="lumen-month-rail" ref={monthRailRef} role="list" aria-label="Periodos del informe">
            {months.map((month, index) => <button
              key={month.key}
              ref={(element) => { monthButtonRefs.current[month.key] = element; }}
              type="button"
              role="listitem"
              className={`${index === activeIndex ? 'is-active' : ''}${month.increments > 0 ? ' has-inflow' : ''}${month.decrements > 0 ? ' has-outflow' : ''}${month.isPending ? ' is-pending' : ''}`}
              onClick={() => selectMonth(index, 'selector')}
            ><span>{month.shortLabel}</span><small>{month.isPending ? 'En curso' : signedPercent(month.returnPct)}</small></button>)}
          </div>
        </section>

        <section className="lumen-composition" aria-labelledby="lumen-composition-title">
          <div className="lumen-section-heading">
            <div><p>02 · ORIGEN DE LA POSICIÓN</p><h2 id="lumen-composition-title">No es solo cuánto tienes.<br /><em>Es de dónde viene.</em></h2></div>
            <p className="lumen-section-note">La posición visible se reconcilia con el capital neto y el resultado acumulado, sin mezclar rentabilidad con movimientos de dinero.</p>
          </div>

          <div className="lumen-equation" aria-label="Composición de la posición actual">
            <div><span>Capital aportado</span><strong>{formatCurrency(report.incrementos + pendingIncrements)}</strong></div>
            <b>−</b>
            <div><span>Capital retirado</span><strong>{formatCurrency(report.decrementos + pendingDecrements)}</strong></div>
            <b>+</b>
            <div><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
            <b>=</b>
            <div className="is-total"><span>Posición visible</span><strong>{formatCurrency(visibleBalance)}</strong></div>
          </div>

          <div className={`lumen-composition-beam${report.beneficioTotal < 0 ? ' has-loss' : ''}`}>
            <div className="is-capital" style={{ width: `${report.beneficioTotal >= 0 ? capitalShare : 100}%` }}><span>Capital neto</span><strong>{formatCurrency(visibleNetCapital)}</strong></div>
            {report.beneficioTotal >= 0 ? <div className="is-result" style={{ width: `${resultShare}%` }}><span>Valor generado</span><strong>{signedMoney(report.beneficioTotal)}</strong></div> : <div className="is-loss"><span>Resultado</span><strong>{signedMoney(report.beneficioTotal)}</strong></div>}
          </div>
        </section>

        <section className="lumen-anatomy" aria-labelledby="lumen-anatomy-title">
          <header className="lumen-section-heading">
            <div><p>03 · DENTRO DEL PERIODO</p><h2 id="lumen-anatomy-title">{active?.isPending ? 'Capital posterior al cierre' : active?.label}</h2></div>
            <div className="lumen-period-switch">
              <button type="button" onClick={() => selectMonth(Math.max(0, activeIndex - 1), 'detalle anterior')} disabled={activeIndex === 0}>Anterior</button>
              <span>{String(activeIndex + 1).padStart(2, '0')} / {String(months.length).padStart(2, '0')}</span>
              <button type="button" onClick={() => selectMonth(Math.min(months.length - 1, activeIndex + 1), 'detalle siguiente')} disabled={activeIndex === months.length - 1}>Siguiente</button>
            </div>
          </header>

          <div className="lumen-month-flow">
            <article><span>01</span><small>Inicio</small><strong>{formatCurrency(active?.opening ?? 0)}</strong></article>
            <i>→</i>
            <article className="is-inflow"><span>02</span><small>Aportaciones</small><strong>{active?.increments ? `+${formatCurrency(active.increments)}` : '—'}</strong></article>
            <i>→</i>
            <article className="is-outflow"><span>03</span><small>Retiradas</small><strong>{active?.decrements ? `−${formatCurrency(active.decrements)}` : '—'}</strong></article>
            <i>→</i>
            <article className="is-result"><span>04</span><small>Resultado</small><strong className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Pendiente' : signedMoney(active?.profit ?? 0)}</strong></article>
            <i>→</i>
            <article className="is-close"><span>05</span><small>{active?.isPending ? 'Posición visible' : 'Cierre'}</small><strong>{formatCurrency(active?.balance ?? 0)}</strong></article>
          </div>

          {activeBreakdown ? <div className="lumen-tranches">
            <header><span>RECONCILIACIÓN INTRAMES</span><p>Cada tramo muestra únicamente el tiempo durante el que ese capital estuvo invertido.</p></header>
            <article className="is-opening">
              <div><span>Posición inicial del mes</span><small>Del 01/{active.key.slice(5, 7)} al {monthEndDay(active.key)}/{active.key.slice(5, 7)}</small></div>
              <strong>{formatCurrency(activeBreakdown.openingCapital ?? activeBreakdown.initialCapital)}</strong>
              <b>{signedPercent(activeBreakdown.initialReturnPct * 100)}</b>
              <em>{signedMoney(activeBreakdown.initialProfit)}</em>
            </article>
            {activeBreakdown.contributions.map((item) => <article className="is-inflow" key={`lumen-in-${item.iso}`}>
              <div><span>Aportación incorporada</span><small>{dateLabel(item.iso)} · hasta cierre de mes</small></div>
              <strong>{formatCurrency(item.amount)}</strong>
              <b>{signedPercent(item.returnPct * 100)}</b>
              <em>{signedMoney(item.profit)}</em>
            </article>)}
            {(activeBreakdown.withdrawals ?? []).map((item) => <article className="is-outflow" key={`lumen-out-${item.iso}`}>
              <div><span>Posición retirada</span><small>Invertida hasta el {dateLabel(item.iso)}</small></div>
              <strong>{formatCurrency(item.amount)}</strong>
              <b>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</b>
              <em>{signedMoney(item.profit)}</em>
            </article>)}
            <article className="is-total"><div><span>Resultado conciliado</span><small>Suma exacta de todos los tramos</small></div><strong>—</strong><b>—</b><em>{signedMoney(activeBreakdown.totalProfit)}</em></article>
          </div> : <div className="lumen-tranches-empty">
            <span>{active?.isPending ? 'PRÓXIMO CIERRE' : 'PERIODO LINEAL'}</span>
            <strong>{active?.isPending ? 'El capital ya está visible. El rendimiento se incorporará al publicar el siguiente cierre.' : 'El resultado corresponde a la posición mantenida durante el periodo.'}</strong>
          </div>}
        </section>

        <section className="lumen-spectrum" aria-labelledby="lumen-spectrum-title">
          <header className="lumen-section-heading">
            <div><p>04 · PULSO DE RENTABILIDAD</p><h2 id="lumen-spectrum-title">Cada mes, una intensidad distinta.</h2></div>
            <p className="lumen-section-note">La altura representa la rentabilidad del mes. Selecciona una señal para llevar todo el informe a ese periodo.</p>
          </header>
          <div className="lumen-spectrum-field" role="list" aria-label="Rentabilidad por mes">
            <div className="lumen-spectrum-zero" aria-hidden="true" />
            {months.map((month, index) => {
              const magnitude = Math.max(4, Math.abs(month.returnPct) / maxAbsReturn * 100);
              return <button
                key={`signal-${month.key}`}
                type="button"
                role="listitem"
                className={`${tone(month.returnPct)}${index === activeIndex ? ' is-active' : ''}${month.isPending ? ' is-pending' : ''}`}
                onClick={() => selectMonth(index, 'pulso')}
                aria-label={`${month.label}: ${month.isPending ? 'pendiente de cierre' : signedPercent(month.returnPct)}`}
              >
                <span>{month.isPending ? '—' : signedPercent(month.returnPct)}</span>
                <i style={{ '--signal-size': `${magnitude}%` } as React.CSSProperties} />
                <small>{month.shortLabel}</small>
              </button>;
            })}
          </div>
        </section>

        <section className={`lumen-ledger${ledgerOpen ? ' is-open' : ''}`}>
          <button type="button" className="lumen-ledger-trigger" aria-expanded={ledgerOpen} onClick={() => { setLedgerOpen((value) => !value); onAnalyticsEvent?.({ type: 'report_lumen_ledger', label: 'LUMEN registro mensual' }); }}>
            <span><small>05 · REGISTRO DE PRECISIÓN</small><strong>Ver todas las cifras del recorrido</strong></span>
            <b>{ledgerOpen ? 'Cerrar' : 'Abrir registro'} <i>{ledgerOpen ? '−' : '+'}</i></b>
          </button>
          {ledgerOpen ? <div className="lumen-ledger-table-wrap">
            <table className="lumen-ledger-table">
              <thead><tr><th>Periodo</th><th>Inicio</th><th>Aportaciones</th><th>Retiradas</th><th>Resultado</th><th>Rentabilidad</th><th>Posición al cierre</th></tr></thead>
              <tbody>{months.map((month, index) => <tr key={`ledger-${month.key}`} className={index === activeIndex ? 'is-active' : ''} onClick={() => selectMonth(index, 'registro')}>
                <th>{month.label}</th>
                <td>{formatCurrency(month.opening)}</td>
                <td>{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</td>
                <td>{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</td>
                <td className={tone(month.profit)}>{month.isPending ? 'Pendiente' : signedMoney(month.profit)}</td>
                <td className={tone(month.returnPct)}>{month.isPending ? 'Pendiente' : signedPercent(month.returnPct)}</td>
                <td>{formatCurrency(month.balance)}</td>
              </tr>)}</tbody>
            </table>
          </div> : null}
        </section>
      </main>

      <footer className="lumen-footer">
        <div><span aria-hidden="true"><i /><i /><i /></span><p><strong>LUMEN</strong><small>Patrimonio vivo · {report.clientCode}</small></p></div>
        <p>Las rentabilidades pasadas no garantizan resultados futuros. Documento informativo.</p>
      </footer>
    </article>
  );
};
