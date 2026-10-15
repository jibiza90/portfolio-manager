import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './AionReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AionReportPageProps {
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

interface AionNode {
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

interface ChartPoint extends AionNode {
  x: number;
  y: number;
  returnY: number;
}

type ExperienceMode = 'story' | 'precision';

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
  const formatted = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
};

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPct = (value: number) => {
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

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const niceCeiling = (value: number) => {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
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

const isoDate = (value: string) => value.split('-').reverse().join('/');

export const AionReportPage: React.FC<AionReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const timelineRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const storyStartedAt = useRef(Date.now());
  const pointerStart = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('story');
  const [immersive, setImmersive] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareFrom, setCompareFrom] = useState(0);
  const [compareTo, setCompareTo] = useState(0);

  const pending = useMemo(() => pendingCashMovements
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const netCapital = visibleContributed - visibleWithdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;

  const nodes = useMemo<AionNode[]>(() => {
    const balanceByMonth = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdownByMonth = new Map((report.contributionBreakdowns ?? [])
      .map((row) => [monthToKey(row.month), row]));
    const validMonths = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const published = validMonths.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balanceByMonth.get(row.key) ?? Number(row.endBalance || 0);
      const previousBalance = index > 0
        ? (balanceByMonth.get(validMonths[index - 1].key) ?? Number(validMonths[index - 1].endBalance || 0))
        : undefined;
      const breakdown = breakdownByMonth.get(row.key);
      const inferredOpening = balance - increments + decrements - Number(row.profit || 0);
      const opening = breakdown?.openingCapital ?? breakdown?.initialCapital ?? previousBalance ?? inferredOpening;
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        opening,
        balance,
        profit: Number(row.profit || 0),
        returnPct: index === validMonths.length - 1
          ? Number(report.rentabilidadUltimoMes || 0)
          : Number(row.profitPct || 0),
        increments,
        decrements,
        breakdown
      };
    });

    if (!pending.length) return published;
    return [...published, {
      key: `now-${pending[pending.length - 1].iso}`,
      label: 'Posición actual',
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
    setCompareFrom(0);
    setCompareTo(Math.max(0, nodes.length - 1));
    setPlaying(nodes.length > 1);
    storyStartedAt.current = Date.now();
  }, [nodes.length, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!playing || experienceMode !== 'story' || nodes.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => {
        if (index >= nodes.length - 1) {
          setPlaying(false);
          onAnalyticsEvent?.({
            type: 'report_aion_story_complete',
            label: 'AION historia completa',
            durationMs: Date.now() - storyStartedAt.current
          });
          return index;
        }
        return index + 1;
      });
    }, activeIndex === 0 ? 2200 : 2800);
    return () => window.clearTimeout(timer);
  }, [activeIndex, experienceMode, nodes.length, onAnalyticsEvent, playing]);

  useEffect(() => {
    const key = nodes[activeIndex]?.key;
    if (key) timelineRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIndex, nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && immersive) setImmersive(false);
      if (event.key === 'ArrowLeft') {
        setPlaying(false);
        setActiveIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === 'ArrowRight') {
        setPlaying(false);
        setActiveIndex((index) => Math.min(nodes.length - 1, index + 1));
      }
      if (event.key === ' ' && immersive) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [immersive, nodes.length]);

  const active = nodes[activeIndex] ?? nodes[nodes.length - 1];
  const completion = nodes.length > 1 ? activeIndex / (nodes.length - 1) * 100 : 100;

  const chart = useMemo(() => {
    const width = 1600;
    const height = 760;
    const left = 116;
    const right = 76;
    const top = 112;
    const baseline = 590;
    const usableWidth = width - left - right;
    const maxBalance = niceCeiling(Math.max(1, ...nodes.map((node) => Math.max(0, node.balance))) * 1.06);
    const maxAbsReturn = Math.max(1, ...nodes.map((node) => Math.abs(node.returnPct)));
    const points: ChartPoint[] = nodes.map((node, index) => {
      const x = nodes.length === 1 ? left + usableWidth / 2 : left + index / (nodes.length - 1) * usableWidth;
      const y = baseline - Math.max(0, node.balance) / maxBalance * (baseline - top);
      const returnY = 72 - node.returnPct / maxAbsReturn * 34;
      return { ...node, x, y, returnY };
    });
    const balancePath = smoothPath(points);
    const areaPath = points.length
      ? `${balancePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : '';
    const rearAreaPath = points.length
      ? `${smoothPath(points.map((point) => ({ x: point.x + 24, y: point.y + 18 })))} L ${points[points.length - 1].x + 24} ${baseline + 18} L ${points[0].x + 24} ${baseline + 18} Z`
      : '';
    const returnPath = smoothPath(points.map((point) => ({ x: point.x, y: point.returnY })));
    const ticks = Array.from({ length: 5 }, (_, index) => ({
      value: maxBalance * index / 4,
      y: baseline - (baseline - top) * index / 4
    }));
    return { width, height, left, right, top, baseline, maxBalance, points, balancePath, areaPath, rearAreaPath, returnPath, ticks };
  }, [nodes]);

  const activePoint = chart.points[activeIndex] ?? chart.points[chart.points.length - 1];
  const compareStart = nodes[Math.min(compareFrom, compareTo)] ?? nodes[0];
  const compareEnd = nodes[Math.max(compareFrom, compareTo)] ?? nodes[nodes.length - 1];
  const compareStartIndex = nodes.indexOf(compareStart);
  const compareEndIndex = nodes.indexOf(compareEnd);
  const compareProfit = nodes.slice(compareStartIndex + 1, compareEndIndex + 1)
    .reduce((sum, node) => sum + node.profit, 0);
  const compareIncrements = nodes.slice(compareStartIndex + 1, compareEndIndex + 1)
    .reduce((sum, node) => sum + node.increments, 0);
  const compareDecrements = nodes.slice(compareStartIndex + 1, compareEndIndex + 1)
    .reduce((sum, node) => sum + node.decrements, 0);

  const selectedBreakdown = active?.breakdown;
  const activeFlow = (active?.increments ?? 0) - (active?.decrements ?? 0);
  const hasAccumulatedLoss = report.beneficioTotal < 0;
  const resultShare = hasAccumulatedLoss
    ? Math.max(0, Math.min(100, Math.abs(report.beneficioTotal) / Math.max(1, Math.abs(netCapital)) * 100))
    : visibleBalance > 0
      ? Math.max(0, Math.min(100, report.beneficioTotal / visibleBalance * 100))
      : 0;
  const capitalShare = hasAccumulatedLoss ? 100 : 100 - resultShare;

  useEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 2 || !activePoint) return;
    const pointPosition = activePoint.x / chart.width * viewport.scrollWidth;
    const target = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, pointPosition - viewport.clientWidth * .48));
    viewport.scrollTo({ left: target, behavior: 'smooth' });
  }, [activePoint, chart.width]);

  const selectNode = (index: number, source: string) => {
    setPlaying(false);
    setActiveIndex(index);
    onAnalyticsEvent?.({ type: 'report_aion_month', label: `AION ${source} ${nodes[index]?.label ?? index}` });
  };

  const replay = () => {
    storyStartedAt.current = Date.now();
    setExperienceMode('story');
    setActiveIndex(0);
    setPlaying(true);
    onAnalyticsEvent?.({ type: 'report_aion_replay', label: 'AION reproducir historia' });
  };

  const switchMode = (mode: ExperienceMode) => {
    setExperienceMode(mode);
    setPlaying(false);
    onAnalyticsEvent?.({ type: 'report_aion_mode', label: `AION modo ${mode}` });
  };

  const narrative = useMemo(() => {
    if (!active) return 'No hay periodos publicados para reconstruir la posición.';
    if (active.isPending) {
      const fragments = [
        active.increments ? `se incorporaron ${formatCurrency(active.increments)}` : '',
        active.decrements ? `se retiraron ${formatCurrency(active.decrements)}` : ''
      ].filter(Boolean).join(' y ');
      return `Después del último cierre ${fragments}. El capital ya forma parte de la posición visible; su resultado se incorporará cuando se publique el próximo cierre mensual.`;
    }
    if (active.breakdown) {
      const initial = active.breakdown.openingCapital ?? active.breakdown.initialCapital;
      const pieces = [`La posición comenzó con ${formatCurrency(initial)} y obtuvo ${signedPct(active.breakdown.initialReturnPct * 100)}.`];
      active.breakdown.contributions.forEach((item) => pieces.push(`La aportación de ${formatCurrency(item.amount)} del ${isoDate(item.iso)} generó ${signedMoney(item.profit)} (${signedPct(item.returnPct * 100)}).`));
      (active.breakdown.withdrawals ?? []).forEach((item) => pieces.push(`Los ${formatCurrency(item.amount)} retirados el ${isoDate(item.iso)} habían generado ${signedMoney(item.profit)} hasta su salida${item.returnPct === undefined ? '.' : ` (${signedPct(item.returnPct * 100)}).`}`));
      pieces.push(`El resultado total del mes fue ${signedMoney(active.profit)} y la posición cerró en ${formatCurrency(active.balance)}.`);
      return pieces.join(' ');
    }
    return `En ${active.label}, la cartera partió de ${formatCurrency(active.opening)}${active.increments ? `, incorporó ${formatCurrency(active.increments)}` : ''}${active.decrements ? ` y registró una retirada de ${formatCurrency(active.decrements)}` : ''}. Generó ${signedMoney(active.profit)} con una rentabilidad de ${signedPct(active.returnPct)} y cerró en ${formatCurrency(active.balance)}.`;
  }, [active]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    pointerStart.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) < 55) return;
    setPlaying(false);
    setActiveIndex((index) => delta < 0 ? Math.min(nodes.length - 1, index + 1) : Math.max(0, index - 1));
  };

  return (
    <article className={`aion-root${immersive ? ' is-immersive' : ''}${experienceMode === 'precision' ? ' is-precision' : ' is-story'}`} ref={rootRef}>
      <div className="aion-atmosphere" aria-hidden="true"><i /><i /><i /><i /></div>

      <header className="aion-header">
        <div className="aion-brand">
          <span className="aion-sigil" aria-hidden="true"><i /><i /><i /></span>
          <div><small>TEMPORAL WEALTH TWIN</small><h1>AION</h1><p>{report.clientCode} · Patrimonio reconstruido en tiempo real</p></div>
        </div>
        <div className="aion-header-state">
          <span><i /> DATOS SINCRONIZADOS</span>
          <small>{new Date(report.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</small>
        </div>
        <div className="aion-header-actions">
          <button type="button" onClick={() => { setImmersive((value) => !value); onAnalyticsEvent?.({ type: 'report_expand_chart', label: 'AION modo inmersivo' }); }}>
            {immersive ? 'Salir' : 'Pantalla completa'}
          </button>
          <button type="button" className="aion-pdf" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'AION PDF oficial' }); void onDownload?.(); }}>PDF</button>
        </div>
      </header>

      <section className="aion-now" aria-labelledby="aion-position-title">
        <div className="aion-now-copy">
          <span>SU POSICIÓN · AHORA</span>
          <h2 id="aion-position-title">{formatCurrency(visibleBalance)}</h2>
          <p>{pending.length ? 'Incluye los movimientos de capital posteriores al último cierre publicado.' : `Último cierre publicado · ${nodes[nodes.length - 1]?.label ?? 'Sin fecha'}`}</p>
        </div>
        <div className="aion-equation" aria-label="Composición de la posición actual">
          <div><span>Capital neto aportado</span><strong>{formatCurrency(netCapital)}</strong></div>
          <i>+</i>
          <div><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
          <i>=</i>
          <div className="is-total"><span>Posición visible</span><strong>{formatCurrency(visibleBalance)}</strong></div>
        </div>
        <div className="aion-now-metrics">
          <div><span>Resultado último mes</span><strong className={tone(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong></div>
          <div><span>Rentabilidad último mes</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPct(report.rentabilidadUltimoMes)}</strong></div>
          <div><span>TWR acumulado</span><strong className={tone(twrPct)}>{signedPct(twrPct)}</strong></div>
          <div><span>Rentabilidad total</span><strong className={tone(report.rentabilidad)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong></div>
        </div>
      </section>

      <section className="aion-twin" aria-label="Gemelo temporal del patrimonio">
        <div className="aion-twin-head">
          <div><small>GEMELO TEMPORAL</small><h2>La historia completa de su patrimonio</h2><p>Cada cambio visual representa capital, resultado o rentabilidad real.</p></div>
          <div className="aion-mode-switch" role="tablist" aria-label="Nivel de lectura">
            <button type="button" role="tab" aria-selected={experienceMode === 'story'} className={experienceMode === 'story' ? 'is-active' : ''} onClick={() => switchMode('story')}><span>01</span> Historia</button>
            <button type="button" role="tab" aria-selected={experienceMode === 'precision'} className={experienceMode === 'precision' ? 'is-active' : ''} onClick={() => switchMode('precision')}><span>02</span> Precisión</button>
          </div>
        </div>

        <div
          className="aion-stage-shell"
          style={{ '--aion-focus-x': `${activePoint ? activePoint.x / chart.width * 100 : 50}%` } as React.CSSProperties}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="aion-story-status">
            <span className={playing ? 'is-playing' : ''}><i /> {playing ? 'HISTORIA EN CURSO' : 'EXPLORACIÓN MANUAL'}</span>
            <b>{String(activeIndex + 1).padStart(2, '0')} / {String(nodes.length).padStart(2, '0')}</b>
          </div>

          <div className="aion-chart-viewport" ref={chartViewportRef}>
          <svg className="aion-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="aion-chart-title aion-chart-desc">
            <title id="aion-chart-title">Evolución temporal de la cartera</title>
            <desc id="aion-chart-desc">La superficie representa el valor de la cartera. Las entradas azules son aportaciones, las salidas ámbar son retiradas y la línea superior representa la rentabilidad mensual en una escala independiente.</desc>
            <defs>
              <linearGradient id="aion-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#83d8bd" stopOpacity=".48" /><stop offset=".46" stopColor="#4e9eb2" stopOpacity=".22" /><stop offset="1" stopColor="#1d3946" stopOpacity=".04" /></linearGradient>
              <linearGradient id="aion-rear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#274a57" stopOpacity=".26" /><stop offset="1" stopColor="#0b1115" stopOpacity=".02" /></linearGradient>
              <linearGradient id="aion-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6b98b3" /><stop offset=".62" stopColor="#8ed8c0" /><stop offset="1" stopColor="#f0eee6" /></linearGradient>
              <linearGradient id="aion-return" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#667e8e" /><stop offset="1" stopColor="#dcc89e" /></linearGradient>
              <radialGradient id="aion-node"><stop offset="0" stopColor="#ffffff" /><stop offset=".38" stopColor="#96e1c6" /><stop offset="1" stopColor="#386b70" /></radialGradient>
              <filter id="aion-soft-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <filter id="aion-wide-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="24" /></filter>
              <clipPath id="aion-reveal"><rect className="aion-reveal-rect" x="0" y="0" width={activePoint ? activePoint.x + 2 : chart.width} height={chart.height} /></clipPath>
              <pattern id="aion-micro-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(128,164,172,.08)" strokeWidth="1" /></pattern>
            </defs>

            <rect width={chart.width} height={chart.height} fill="url(#aion-micro-grid)" opacity=".34" />
            <g className="aion-axis" aria-hidden="true">
              {chart.ticks.map((tick) => <g key={tick.value}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} /><text x={chart.left - 20} y={tick.y + 5} textAnchor="end">{compactMoney(tick.value)}</text></g>)}
            </g>

            <path d={chart.rearAreaPath} className="aion-rear-plane" />
            <path d={chart.areaPath} className="aion-area-ghost" />
            <g clipPath="url(#aion-reveal)" className="aion-revealed-data">
              <path d={chart.areaPath} className="aion-area" />
              <path d={chart.balancePath} className="aion-balance-glow" filter="url(#aion-wide-glow)" />
              <path d={chart.balancePath} className="aion-balance-line" />
            </g>

            <g className="aion-return-layer">
              <text x={chart.left + 250} y="32">TWR MENSUAL · ESCALA INDEPENDIENTE</text>
              <line x1={chart.left} x2={chart.width - chart.right} y1="72" y2="72" />
              <path d={chart.returnPath} />
              {chart.points.map((point, index) => <circle key={`return-${point.key}`} cx={point.x} cy={point.returnY} r={index === activeIndex ? 6 : 3} className={index <= activeIndex ? 'is-revealed' : ''}><title>{point.label}: {signedPct(point.returnPct)}</title></circle>)}
            </g>

            {chart.points.map((point, index) => {
              const selected = index === activeIndex;
              const revealed = index <= activeIndex;
              return <g key={point.key} className={`aion-month-node${selected ? ' is-selected' : ''}${revealed ? ' is-revealed' : ''}`} role="button" tabIndex={0} aria-label={`${point.label}: ${formatCurrency(point.balance)}`} onClick={() => selectNode(index, 'gráfico')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectNode(index, 'gráfico'); }}>
                <line x1={point.x} x2={point.x} y1={point.y} y2={chart.baseline} className="aion-depth-line" />
                {point.increments > 0 ? <g className="aion-flow-marker is-inflow"><path d={`M ${point.x - 70} ${point.y + 54} L ${point.x - 10} ${point.y + 8}`} /><circle cx={point.x - 74} cy={point.y + 57} r="7" /><text x={point.x - 82} y={point.y + 83} textAnchor="middle">+{compactMoney(point.increments)}</text></g> : null}
                {point.decrements > 0 ? <g className="aion-flow-marker is-outflow"><path d={`M ${point.x + 10} ${point.y + 8} L ${point.x + 70} ${point.y + 54}`} /><circle cx={point.x + 74} cy={point.y + 57} r="7" /><text x={point.x + 82} y={point.y + 83} textAnchor="middle">−{compactMoney(point.decrements)}</text></g> : null}
                {selected ? <>
                  <rect x={point.x - 66} y="92" width="132" height={chart.baseline - 72} rx="66" className="aion-lens" />
                  <line x1={point.x} x2={point.x} y1="92" y2={chart.baseline + 28} className="aion-lens-line" />
                  <ellipse cx={point.x} cy={point.y} rx="34" ry="15" className="aion-node-aura" filter="url(#aion-soft-glow)" />
                </> : null}
                <circle cx={point.x} cy={point.y} r={selected ? 10 : 5} className="aion-balance-node" />
                {selected ? <g className="aion-node-value"><rect x={point.x - 104} y={Math.max(128, point.y - 78)} width="208" height="48" rx="24" /><text x={point.x} y={Math.max(158, point.y - 48)} textAnchor="middle">{formatCurrency(point.balance)}</text></g> : null}
                <text x={point.x} y={chart.baseline + 50} textAnchor="middle" className="aion-month-label">{point.shortLabel}</text>
              </g>;
            })}

            {chart.balancePath ? <g className="aion-data-particles" clipPath="url(#aion-reveal)" aria-hidden="true">
              {[0, 1, 2].map((item) => <circle key={item} r={item === 1 ? 2.8 : 2} style={{ opacity: .72 - item * .16 }}><animateMotion path={chart.balancePath} dur={`${9 + item * 3}s`} begin={`${-item * 3}s`} repeatCount="indefinite" /></circle>)}
            </g> : null}
          </svg>
          </div>

          <aside className="aion-time-lens" aria-live="polite">
            <div><small>LENTE TEMPORAL</small><strong>{active?.isPending ? 'AHORA' : active?.label.toUpperCase()}</strong></div>
            <span>{active?.isPending ? 'CAPITAL EN TRANSICIÓN' : 'CIERRE PUBLICADO'}</span>
            <h3>{active ? formatCurrency(active.balance) : '—'}</h3>
            <dl>
              <div><dt>Inicio</dt><dd>{active ? formatCurrency(active.opening) : '—'}</dd></div>
              <div><dt>Flujo neto</dt><dd className={tone(activeFlow)}>{activeFlow === 0 ? formatCurrency(0) : signedMoney(activeFlow)}</dd></div>
              <div><dt>Beneficio</dt><dd className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Pendiente' : active ? signedMoney(active.profit) : '—'}</dd></div>
              <div><dt>Rentabilidad</dt><dd className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Pendiente' : active ? signedPct(active.returnPct) : '—'}</dd></div>
            </dl>
          </aside>

          <div className="aion-story-caption" aria-live="polite" key={active?.key}>
            <span>{String(activeIndex + 1).padStart(2, '0')}</span><p>{narrative}</p>
          </div>
        </div>

        <div className="aion-transport">
          <button type="button" className="aion-replay" onClick={replay} aria-label="Reproducir historia desde el inicio">↺ <span>Reproducir historia</span></button>
          <button type="button" className="aion-play" onClick={() => { if (activeIndex >= nodes.length - 1) { replay(); } else { setExperienceMode('story'); setPlaying((value) => !value); } }} aria-label={playing ? 'Pausar historia' : 'Continuar historia'}>{playing ? 'Ⅱ' : '▶'}</button>
          <div className="aion-progress"><i style={{ width: `${completion}%` }} /><span style={{ left: `${completion}%` }} /></div>
          <button type="button" className="aion-present" onClick={() => selectNode(nodes.length - 1, 'presente')}>Ir al presente →</button>
        </div>

        <div className="aion-timeline" role="list" aria-label="Línea temporal de la inversión">
          {nodes.map((node, index) => <button key={node.key} ref={(element) => { timelineRefs.current[node.key] = element; }} type="button" role="listitem" className={`${index === activeIndex ? 'is-active' : ''}${node.increments ? ' has-inflow' : ''}${node.decrements ? ' has-outflow' : ''}${node.isPending ? ' is-pending' : ''}`} onClick={() => selectNode(index, 'línea temporal')}>
            <i /><span>{node.shortLabel}</span><small>{compactMoney(node.balance)}</small>
          </button>)}
        </div>
      </section>

      <section className="aion-origin" aria-labelledby="aion-origin-title">
        <div className="aion-section-intro"><small>ORIGEN DE LA POSICIÓN</small><h2 id="aion-origin-title">De dónde procede cada euro</h2><p>Capital neto y beneficio convergen en la posición visible actual.</p></div>
        <div className="aion-composition">
          <div className={`aion-composition-track${hasAccumulatedLoss ? ' has-loss' : ''}`} aria-label={`Capital neto ${capitalShare.toFixed(1)} por ciento; ${hasAccumulatedLoss ? 'pérdida' : 'beneficio'} ${resultShare.toFixed(1)} por ciento`}>
            <i className="is-capital" style={{ width: `${capitalShare}%` }}><span>Capital neto</span></i>
            <i className={hasAccumulatedLoss ? 'is-loss' : 'is-profit'} style={{ width: `${resultShare}%` }}><span>{hasAccumulatedLoss ? 'Pérdida' : 'Beneficio'}</span></i>
          </div>
          <div className="aion-composition-values">
            <div><i className="is-capital" /><span>Capital neto aportado<small>{formatCurrency(netCapital)}</small></span><b>{capitalShare.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</b></div>
            <div><i className={hasAccumulatedLoss ? 'is-loss' : 'is-profit'} /><span>{hasAccumulatedLoss ? 'Pérdida acumulada' : 'Beneficio acumulado'}<small>{signedMoney(report.beneficioTotal)}</small></span><b>{resultShare.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</b></div>
            <div className="is-position"><span>Posición visible<small>{formatCurrency(visibleBalance)}</small></span><b>100 %</b></div>
          </div>
        </div>
      </section>

      <section className="aion-month-anatomy" aria-labelledby="aion-anatomy-title">
        <div className="aion-section-intro">
          <small>ANATOMÍA DEL PERIODO</small><h2 id="aion-anatomy-title">{active?.isPending ? 'Capital posterior al cierre' : active?.label}</h2><p>{active?.isPending ? 'El movimiento ya modifica la posición visible, pero todavía no incorpora rentabilidad.' : 'Lectura exacta del capital y el resultado del periodo seleccionado.'}</p>
        </div>
        <div className="aion-anatomy-flow">
          <article><span>01 · POSICIÓN INICIAL</span><strong>{active ? formatCurrency(active.opening) : '—'}</strong><small>Capital existente al comenzar el periodo</small></article>
          <i>+</i>
          <article className="is-inflow"><span>02 · APORTACIONES</span><strong>{active?.increments ? formatCurrency(active.increments) : '—'}</strong><small>{active?.increments ? 'Capital incorporado durante el periodo' : 'Sin nuevas aportaciones'}</small></article>
          <i>−</i>
          <article className="is-outflow"><span>03 · RETIRADAS</span><strong>{active?.decrements ? formatCurrency(active.decrements) : '—'}</strong><small>{active?.decrements ? 'Capital retirado durante el periodo' : 'Sin retiradas'}</small></article>
          <i>+</i>
          <article className="is-profit"><span>04 · BENEFICIO</span><strong className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Pendiente' : active ? signedMoney(active.profit) : '—'}</strong><small>{active?.isPending ? 'Se publicará con el próximo cierre' : 'Resultado generado por la inversión'}</small></article>
          <i>=</i>
          <article className="is-close"><span>05 · POSICIÓN AL CIERRE</span><strong>{active ? formatCurrency(active.balance) : '—'}</strong><small>{active?.isPending ? 'Posición visible actual' : 'Valor publicado al finalizar el mes'}</small></article>
        </div>

        <div className="aion-tranches">
          {selectedBreakdown && !active?.isPending ? <>
            <article>
              <span>POSICIÓN INICIAL DEL MES</span>
              <strong>{formatCurrency(selectedBreakdown.openingCapital ?? selectedBreakdown.initialCapital)}</strong>
              <div><b>{signedPct(selectedBreakdown.initialReturnPct * 100)}</b><em>{signedMoney(selectedBreakdown.initialProfit)}</em></div>
            </article>
            {selectedBreakdown.contributions.map((item) => <article className="is-inflow" key={`aion-in-${item.iso}`}><span>APORTACIÓN · {isoDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><div><b>{signedPct(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em></div></article>)}
            {(selectedBreakdown.withdrawals ?? []).map((item) => <article className="is-outflow" key={`aion-out-${item.iso}`}><span>RETIRADA · {isoDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><div><b>{item.returnPct === undefined ? '—' : signedPct(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em></div></article>)}
            <article className="is-total"><span>RESULTADO CONCILIADO</span><strong>{signedMoney(selectedBreakdown.totalProfit)}</strong><div><b>100 % explicado</b><em>{Math.abs(selectedBreakdown.totalProfit - (active?.profit ?? 0)) < .01 ? 'Coincide con el cierre' : 'Existe una diferencia'}</em></div></article>
          </> : <article className="is-empty"><span>{active?.isPending ? 'PRÓXIMO CIERRE' : 'PERIODO SIN MOVIMIENTOS INTRAMES'}</span><strong>{active?.isPending ? 'El rendimiento todavía no se ha aplicado' : 'Todo el resultado corresponde a la posición mantenida durante el mes'}</strong><p>{active?.isPending ? 'El capital ya aparece en el saldo visible y se integrará en los cálculos publicados cuando finalice el periodo.' : 'No es necesario separar el resultado entre diferentes tramos de capital.'}</p></article>}
        </div>
      </section>

      <section className={`aion-precision-drawer${experienceMode === 'precision' ? ' is-open' : ''}`} aria-hidden={experienceMode !== 'precision'}>
        <div className="aion-section-intro"><small>MODO PRECISIÓN</small><h2>El mecanismo interno de la cartera</h2><p>Cifras exactas, conciliación mensual y comparación entre dos cierres.</p></div>

        <div className="aion-ledger-wrap">
          <table className="aion-ledger">
            <thead><tr><th>Periodo</th><th>Inicio</th><th>Aportaciones</th><th>Retiradas</th><th>Beneficio</th><th>Rentabilidad</th><th>Cierre</th></tr></thead>
            <tbody>{nodes.map((node, index) => <tr key={`ledger-${node.key}`} className={index === activeIndex ? 'is-active' : ''} onClick={() => selectNode(index, 'tabla de precisión')}>
              <th>{node.label}</th><td>{formatCurrency(node.opening)}</td><td>{node.increments ? `+${formatCurrency(node.increments)}` : '—'}</td><td>{node.decrements ? `−${formatCurrency(node.decrements)}` : '—'}</td><td className={tone(node.profit)}>{node.isPending ? 'Pendiente' : signedMoney(node.profit)}</td><td className={tone(node.returnPct)}>{node.isPending ? 'Pendiente' : signedPct(node.returnPct)}</td><td>{formatCurrency(node.balance)}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="aion-compare">
          <div className="aion-compare-head"><div><small>COMPARADOR TEMPORAL</small><h3>Qué cambió entre dos cierres</h3></div><button type="button" aria-expanded={compareOpen} onClick={() => { setCompareOpen((value) => !value); onAnalyticsEvent?.({ type: 'report_aion_compare', label: 'AION comparador temporal' }); }}>{compareOpen ? 'Cerrar comparación' : 'Abrir comparación'}</button></div>
          {compareOpen ? <div className="aion-compare-body">
            <div className="aion-compare-selectors">
              <label>Desde<select value={compareFrom} onChange={(event) => setCompareFrom(Number(event.target.value))}>{nodes.map((node, index) => <option key={`from-${node.key}`} value={index}>{node.label}</option>)}</select></label>
              <span>→</span>
              <label>Hasta<select value={compareTo} onChange={(event) => setCompareTo(Number(event.target.value))}>{nodes.map((node, index) => <option key={`to-${node.key}`} value={index}>{node.label}</option>)}</select></label>
            </div>
            <div className="aion-compare-results">
              <article><span>Variación de posición</span><strong className={tone(compareEnd.balance - compareStart.balance)}>{signedMoney(compareEnd.balance - compareStart.balance)}</strong><small>{formatCurrency(compareStart.balance)} → {formatCurrency(compareEnd.balance)}</small></article>
              <article><span>Beneficio generado</span><strong className={tone(compareProfit)}>{signedMoney(compareProfit)}</strong><small>Suma de resultados publicados</small></article>
              <article><span>Capital incorporado</span><strong>{compareIncrements ? `+${formatCurrency(compareIncrements)}` : formatCurrency(0)}</strong><small>Aportaciones del intervalo</small></article>
              <article><span>Capital retirado</span><strong>{compareDecrements ? `−${formatCurrency(compareDecrements)}` : formatCurrency(0)}</strong><small>Retiradas del intervalo</small></article>
            </div>
          </div> : null}
        </div>
      </section>

      <footer className="aion-footer">
        <div><span className="aion-sigil" aria-hidden="true"><i /><i /><i /></span><p><strong>AION</strong><small>Temporal Wealth Twin · {report.clientCode}</small></p></div>
        <p>Datos actualizados el {new Date(report.createdAt).toLocaleString('es-ES')} · Concepto y dirección CODEX</p>
      </footer>
    </article>
  );
};
