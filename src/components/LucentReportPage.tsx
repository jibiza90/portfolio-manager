import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import { LucentCapitalScene } from './LucentCapitalScene';
import type { LucentSceneLayer, LucentSceneNode } from './LucentCapitalScene';
import './LucentReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface LucentReportPageProps {
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

interface LucentMonth extends LucentSceneNode {
  opening: number;
  closeDate: string;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type LucentMode = 'summary' | 'story' | 'explore';

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
  if (key.startsWith('pending-')) return short ? 'Ahora' : 'Capital posterior al cierre';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const closeDateForMonth = (key: string) => {
  if (key.startsWith('pending-')) return 'Actual';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(year, month, 0).toLocaleDateString('es-ES');
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

const Icon: React.FC<{ name: 'play' | 'pause' | 'expand' | 'download' | 'compare' | 'spark' | 'layers' | 'close' }> = ({ name }) => {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <><path d="M7 5h4v14H7z" /><path d="M14 5h4v14h-4z" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="M3 8l6-6M21 8l-6-6M3 16l6 6M21 16l-6 6" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5M5 21h14" /></>,
    compare: <><path d="M8 4 4 8l4 4M4 8h15M16 20l4-4-4-4M20 16H5" /></>,
    spark: <><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    close: <path d="m5 5 14 14M19 5 5 19" />
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

export const LucentReportPage: React.FC<LucentReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const startedAt = useRef(Date.now());
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [mode, setMode] = useState<LucentMode>('summary');
  const [layer, setLayer] = useState<LucentSceneLayer>('balance');
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(0);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => movement.amount > 0 && Number.isFinite(movement.amount))
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const pendingNet = pendingIncrements - pendingDecrements;
  const visibleBalance = Number(report.saldo || 0) + pendingNet;
  const visibleContributions = Number(report.incrementos || 0) + pendingIncrements;
  const visibleWithdrawals = Number(report.decrementos || 0) + pendingDecrements;

  const months = useMemo<LucentMonth[]>(() => {
    const balanceByMonth = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdownByMonth = new Map((report.contributionBreakdowns ?? [])
      .map((row) => [monthToKey(row.month), row]));
    const rows = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const published = rows.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balanceByMonth.get(row.key) ?? Number(row.endBalance || 0);
      const previousBalance = index > 0
        ? balanceByMonth.get(rows[index - 1].key) ?? Number(rows[index - 1].endBalance || 0)
        : undefined;
      const breakdown = breakdownByMonth.get(row.key);
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        closeDate: closeDateForMonth(row.key),
        opening: breakdown?.openingCapital ?? breakdown?.initialCapital ?? previousBalance ?? balance - increments + decrements - Number(row.profit || 0),
        balance,
        profit: Number(row.profit || 0),
        returnPct: index === rows.length - 1 ? Number(report.rentabilidadUltimoMes || 0) : Number(row.profitPct || 0),
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
      closeDate: 'Actual',
      opening: Number(report.saldo || 0),
      balance: visibleBalance,
      profit: 0,
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      isPending: true
    }];
  }, [pending, pendingDecrements, pendingIncrements, report, visibleBalance]);

  const publishedMonths = useMemo(() => months.filter((month) => !month.isPending), [months]);
  const latestPublished = publishedMonths[publishedMonths.length - 1];
  const active = months[activeIndex] ?? months[months.length - 1];
  const compareLeft = months[compareA] ?? months[0];
  const compareRight = months[compareB] ?? months[months.length - 1];
  const compareIndices: [number, number] | null = compareOpen ? [compareA, compareB] : null;
  const totalTwr = Number(report.twrYtd ?? 0) * 100;
  const totalReturn = Number(report.rentabilidad || 0);

  useEffect(() => {
    const lastIndex = Math.max(0, months.length - 1);
    setActiveIndex(lastIndex);
    setCompareA(Math.max(0, lastIndex - Math.min(5, lastIndex)));
    setCompareB(lastIndex);
    setMode('summary');
    setPlaying(false);
    setCompareOpen(false);
    setExpandedMonths(new Set());
    startedAt.current = Date.now();
  }, [months.length, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!playing || mode !== 'story' || months.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= months.length - 1) {
          setPlaying(false);
          onAnalyticsEvent?.({
            type: 'report_lucent_story_complete',
            label: 'LUCENT historia completa',
            durationMs: Date.now() - startedAt.current
          });
          return current;
        }
        return current + 1;
      });
    }, activeIndex === 0 ? 3200 : 4300);
    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, months.length, onAnalyticsEvent, playing]);

  useEffect(() => {
    const rail = timelineRef.current;
    const button = active ? monthRefs.current[active.key] : null;
    if (!rail || !button) return;
    const left = button.offsetLeft + button.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, Math.min(left, rail.scrollWidth - rail.clientWidth)), behavior: 'smooth' });
  }, [active]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cinema) setCinema(false);
      if (event.key === 'ArrowLeft') selectMonth(Math.max(0, activeIndex - 1), 'teclado');
      if (event.key === 'ArrowRight') selectMonth(Math.min(months.length - 1, activeIndex + 1), 'teclado');
      if (event.key === ' ' && mode === 'story') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const selectMonth = (index: number, source: string) => {
    const safeIndex = Math.max(0, Math.min(months.length - 1, index));
    setActiveIndex(safeIndex);
    if (mode === 'story') setPlaying(false);
    onAnalyticsEvent?.({ type: 'report_lucent_month', label: `LUCENT ${source} ${months[safeIndex]?.label ?? safeIndex}` });
  };

  const changeMode = (next: LucentMode) => {
    setMode(next);
    setPlaying(next === 'story');
    if (next === 'story') {
      startedAt.current = Date.now();
      setActiveIndex(0);
    } else if (next === 'summary') {
      setActiveIndex(Math.max(0, months.length - 1));
    }
    onAnalyticsEvent?.({ type: 'report_lucent_mode', label: `LUCENT ${next}` });
  };

  const changeLayer = (next: LucentSceneLayer) => {
    setLayer(next);
    onAnalyticsEvent?.({ type: 'report_lucent_layer', label: `LUCENT capa ${next}` });
  };

  const replay = () => {
    startedAt.current = Date.now();
    setMode('story');
    setActiveIndex(0);
    setPlaying(true);
  };

  const narrative = useMemo(() => {
    if (!active) return 'La historia financiera comenzará con el primer cierre publicado.';
    if (active.isPending) {
      const flows = [
        active.increments > 0 ? `${formatCurrency(active.increments)} aportados` : '',
        active.decrements > 0 ? `${formatCurrency(active.decrements)} retirados` : ''
      ].filter(Boolean).join(' y ');
      return `${flows || 'Los nuevos movimientos'} ya forman parte del capital visible. Su rendimiento se incorporará cuando se publique el próximo cierre.`;
    }
    const previous = activeIndex > 0 ? months[activeIndex - 1] : undefined;
    const balanceDelta = previous ? active.balance - previous.balance : active.profit;
    if (active.breakdown?.contributions.length || active.breakdown?.withdrawals?.length) {
      const contributions = active.breakdown.contributions.length;
      const withdrawals = active.breakdown.withdrawals?.length ?? 0;
      const pieces = [
        contributions ? `${contributions} ${contributions === 1 ? 'aportación' : 'aportaciones'}` : '',
        withdrawals ? `${withdrawals} ${withdrawals === 1 ? 'retirada' : 'retiradas'}` : ''
      ].filter(Boolean).join(' y ');
      return `${active.label} combina la posición inicial con ${pieces}. Cada tramo conserva únicamente el rendimiento del tiempo que estuvo invertido y el mes termina en ${formatCurrency(active.balance)}.`;
    }
    return `${active.label} generó ${signedMoney(active.profit)} con una rentabilidad de ${signedPercent(active.returnPct)}. El valor de cartera cerró en ${formatCurrency(active.balance)}${previous ? `, una variación neta de ${signedMoney(balanceDelta)} frente al cierre anterior` : ''}.`;
  }, [active, activeIndex, months]);

  const insight = useMemo(() => {
    if (!publishedMonths.length) return 'Aún no existen cierres publicados para analizar.';
    const best = publishedMonths.reduce((current, month) => month.returnPct > current.returnPct ? month : current, publishedMonths[0]);
    const positive = publishedMonths.filter((month) => month.profit > 0).length;
    const growth = publishedMonths.length > 1
      ? publishedMonths[publishedMonths.length - 1].balance - publishedMonths[0].balance
      : publishedMonths[0].profit;
    return `${positive} de ${publishedMonths.length} cierres generaron beneficio. ${best.label} registró la mayor rentabilidad del periodo (${signedPercent(best.returnPct)}) y el valor de cartera avanzó ${signedMoney(growth)} entre el primer y el último cierre visible.`;
  }, [publishedMonths]);

  const balanceChart = useMemo(() => {
    const values = publishedMonths.map((month) => Math.max(0, month.balance));
    const max = Math.max(1, ...values) * 1.12;
    const width = 1000;
    const height = 320;
    const padding = { left: 50, right: 38, top: 34, bottom: 44 };
    const usableWidth = width - padding.left - padding.right;
    const usableHeight = height - padding.top - padding.bottom;
    const points = publishedMonths.map((month, index) => ({
      month,
      x: padding.left + (publishedMonths.length === 1 ? usableWidth / 2 : index * usableWidth / (publishedMonths.length - 1)),
      y: padding.top + usableHeight - (Math.max(0, month.balance) / max) * usableHeight
    }));
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const area = points.length ? `${path} L ${points[points.length - 1].x} ${padding.top + usableHeight} L ${points[0].x} ${padding.top + usableHeight} Z` : '';
    return { width, height, padding, usableHeight, max, points, path, area };
  }, [publishedMonths]);

  const chartTicks = useMemo(() => Array.from({ length: 5 }, (_, index) => balanceChart.max * (4 - index) / 4), [balanceChart.max]);
  const maxReturn = Math.max(1, ...publishedMonths.map((month) => Math.abs(month.returnPct)));
  const maxProfit = Math.max(1, ...publishedMonths.map((month) => Math.abs(month.profit)));

  const toggleExpanded = (key: string) => {
    setExpandedMonths((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const layerLabels: Record<LucentSceneLayer, string> = {
    balance: 'Patrimonio',
    return: 'Rentabilidad',
    profit: 'Beneficio',
    flows: 'Movimientos'
  };

  const comparison = compareLeft && compareRight ? {
    balance: compareRight.balance - compareLeft.balance,
    profit: compareRight.profit - compareLeft.profit,
    returnPct: compareRight.returnPct - compareLeft.returnPct,
    flows: (compareRight.increments - compareRight.decrements) - (compareLeft.increments - compareLeft.decrements)
  } : null;

  const allMovements = useMemo(() => [
    ...report.movements.map((movement) => ({ ...movement, pending: false })),
    ...pending.map((movement) => ({ ...movement, balance: 0, pending: true }))
  ].sort((left, right) => left.iso.localeCompare(right.iso)), [pending, report.movements]);

  const renderBreakdown = (month: LucentMonth) => {
    const breakdown = month.breakdown;
    if (!breakdown) return null;
    return (
      <div className="lucent-breakdown">
        <div className="lucent-breakdown-head">
          <div>
            <span>Arquitectura del resultado</span>
            <strong>{month.label}</strong>
          </div>
          <b>{signedMoney(breakdown.totalProfit)}</b>
        </div>
        <div className="lucent-breakdown-grid lucent-breakdown-labels">
          <span>Concepto</span><span>Capital</span><span>Rentabilidad</span><span>Beneficio</span>
        </div>
        <div className="lucent-breakdown-grid">
          <strong>Posición inicial del mes</strong>
          <span>{formatCurrency(breakdown.openingCapital ?? breakdown.initialCapital)}</span>
          <span className={tone(breakdown.initialReturnPct)}>{signedPercent(breakdown.initialReturnPct * 100)}</span>
          <span className={tone(breakdown.initialProfit)}>{signedMoney(breakdown.initialProfit)}</span>
        </div>
        {breakdown.contributions.map((row) => (
          <div className="lucent-breakdown-grid" key={`contribution-${row.iso}`}>
            <strong>Aportación incorporada el {dateLabel(row.iso)}</strong>
            <span>{formatCurrency(row.amount)}</span>
            <span className={tone(row.returnPct)}>{signedPercent(row.returnPct * 100)}</span>
            <span className={tone(row.profit)}>{signedMoney(row.profit)}</span>
          </div>
        ))}
        {(breakdown.withdrawals ?? []).map((row) => (
          <div className="lucent-breakdown-grid" key={`withdrawal-${row.iso}`}>
            <strong>Capital invertido hasta su retirada el {dateLabel(row.iso)}</strong>
            <span>{formatCurrency(row.amount)}</span>
            <span className={tone(row.returnPct ?? 0)}>{signedPercent((row.returnPct ?? 0) * 100)}</span>
            <span className={tone(row.profit)}>{signedMoney(row.profit)}</span>
          </div>
        ))}
        <div className="lucent-breakdown-grid is-total">
          <strong>Beneficio explicado</strong><span>—</span><span>—</span><strong>{signedMoney(breakdown.totalProfit)}</strong>
        </div>
      </div>
    );
  };

  return (
    <div className={`lucent-root${cinema ? ' is-cinema' : ''}`} ref={rootRef}>
      <header className="lucent-header">
        <div className="lucent-brand">
          <span className="lucent-brand-mark"><i /><i /><i /></span>
          <div><strong>LUCENT</strong><small>Private wealth intelligence</small></div>
        </div>
        <div className="lucent-header-meta">
          <span>{report.clientCode}</span>
          <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <button className="lucent-download" type="button" onClick={onDownload}>
          <Icon name="download" /><span>Descargar informe</span>
        </button>
      </header>

      <nav className="lucent-modes" aria-label="Modo de visualización">
        {([
          ['summary', 'Resumen', 'Lectura completa'],
          ['story', 'Historia', 'Recorrido guiado'],
          ['explore', 'Explorar', 'Control tridimensional']
        ] as Array<[LucentMode, string, string]>).map(([value, title, subtitle]) => (
          <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}>
            <span>{title}</span><small>{subtitle}</small>
          </button>
        ))}
      </nav>

      <main className="lucent-main">
        <section className="lucent-hero">
          <div className="lucent-hero-copy">
            <p className="lucent-eyebrow"><Icon name="spark" /> Inteligencia patrimonial viva</p>
            <h1>Tu capital,<br /><em>convertido en historia.</em></h1>
            <p className="lucent-intro">Una lectura tridimensional de cada cierre, cada movimiento y cada resultado de la cartera.</p>
            <div className="lucent-hero-balance">
              <span>Valor actual de cartera</span>
              <strong>{formatCurrency(visibleBalance)}</strong>
              {pending.length ? <small>Incluye {signedMoney(pendingNet)} de capital posterior al último cierre</small> : <small>Último cierre publicado: {latestPublished?.label ?? '—'}</small>}
            </div>
          </div>

          <div className="lucent-stage">
            <div className="lucent-stage-toolbar">
              <div className="lucent-layer-switch" aria-label="Capa de datos">
                {(Object.keys(layerLabels) as LucentSceneLayer[]).map((value) => (
                  <button key={value} type="button" className={layer === value ? 'is-active' : ''} aria-pressed={layer === value} onClick={() => changeLayer(value)}>
                    {layerLabels[value]}
                  </button>
                ))}
              </div>
              <div className="lucent-stage-actions">
                <button type="button" className={compareOpen ? 'is-active' : ''} onClick={() => setCompareOpen((value) => !value)} aria-label="Comparar dos meses"><Icon name="compare" /></button>
                <button type="button" onClick={() => setCinema(true)} aria-label="Presentar a pantalla completa"><Icon name="expand" /></button>
              </div>
            </div>
            <LucentCapitalScene
              nodes={months}
              activeIndex={activeIndex}
              layer={layer}
              mode={mode}
              compareIndices={compareIndices}
              onSelect={(index) => selectMonth(index, 'escena')}
            />
            <div className="lucent-stage-caption">
              <span><i className="is-mint" /> Cierre mensual</span>
              <span><i className="is-blue" /> Aportación</span>
              <span><i className="is-gold" /> Retirada</span>
              {mode === 'explore' ? <b>Arrastra para rotar · rueda para acercar · pulsa un mes</b> : null}
            </div>
          </div>

          <aside className="lucent-focus-card" aria-live="polite">
            <div className="lucent-focus-index"><span>{String(activeIndex + 1).padStart(2, '0')}</span><i /> <small>{String(months.length).padStart(2, '0')}</small></div>
            <p>{active?.isPending ? 'Capital en curso' : 'Cierre seleccionado'}</p>
            <h2>{active?.label ?? 'Sin datos'}</h2>
            <div className="lucent-focus-value">
              <span>Valor de cartera</span><strong>{active ? formatCurrency(active.balance) : '—'}</strong>
            </div>
            <div className="lucent-focus-pairs">
              <div><span>Beneficio</span><b className={tone(active?.profit ?? 0)}>{active ? signedMoney(active.profit) : '—'}</b></div>
              <div><span>Rentabilidad</span><b className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Pendiente de cierre' : active ? signedPercent(active.returnPct) : '—'}</b></div>
            </div>
            <p className="lucent-focus-narrative">{narrative}</p>
            {mode === 'story' ? (
              <div className="lucent-story-controls">
                <button type="button" onClick={() => setPlaying((value) => !value)}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pausar' : 'Continuar'}</button>
                <button type="button" onClick={replay}>Reiniciar</button>
              </div>
            ) : null}
          </aside>
        </section>

        <section className="lucent-timeline" aria-label="Línea temporal">
          <div className="lucent-timeline-head">
            <span>Trayectoria completa</span>
            <strong>{months[0]?.label ?? '—'} <i /> {months[months.length - 1]?.label ?? '—'}</strong>
          </div>
          <div className="lucent-timeline-rail" ref={timelineRef}>
            {months.map((month, index) => (
              <button
                key={month.key}
                ref={(element) => { monthRefs.current[month.key] = element; }}
                type="button"
                className={`${index === activeIndex ? 'is-active' : ''}${month.isPending ? ' is-pending' : ''}`}
                onClick={() => selectMonth(index, 'línea temporal')}
              >
                <i /><span>{month.shortLabel}</span><small>{compactMoney(month.balance)}</small>
              </button>
            ))}
          </div>
        </section>

        {compareOpen && compareLeft && compareRight ? (
          <section className="lucent-compare" aria-label="Comparador de periodos">
            <div className="lucent-section-heading">
              <div><p>Laboratorio temporal</p><h2>Compara dos momentos de la cartera</h2></div>
              <button type="button" className="lucent-icon-button" onClick={() => setCompareOpen(false)} aria-label="Cerrar comparador"><Icon name="close" /></button>
            </div>
            <div className="lucent-compare-selectors">
              <label><span>Punto de partida</span><select value={compareA} onChange={(event) => setCompareA(Number(event.target.value))}>{months.map((month, index) => <option value={index} key={month.key}>{month.label}</option>)}</select></label>
              <span className="lucent-compare-arrow"><Icon name="compare" /></span>
              <label><span>Punto de llegada</span><select value={compareB} onChange={(event) => setCompareB(Number(event.target.value))}>{months.map((month, index) => <option value={index} key={month.key}>{month.label}</option>)}</select></label>
            </div>
            <div className="lucent-compare-grid">
              <article><span>Valor de cartera</span><strong>{signedMoney(comparison?.balance ?? 0)}</strong><small>{formatCurrency(compareLeft.balance)} → {formatCurrency(compareRight.balance)}</small></article>
              <article><span>Diferencia de beneficio mensual</span><strong>{signedMoney(comparison?.profit ?? 0)}</strong><small>{signedMoney(compareLeft.profit)} → {signedMoney(compareRight.profit)}</small></article>
              <article><span>Diferencia de rentabilidad</span><strong>{signedPercent(comparison?.returnPct ?? 0)}</strong><small>{signedPercent(compareLeft.returnPct)} → {signedPercent(compareRight.returnPct)}</small></article>
              <article><span>Diferencia de flujo neto</span><strong>{signedMoney(comparison?.flows ?? 0)}</strong><small>Entradas menos salidas</small></article>
            </div>
          </section>
        ) : null}

        <section className="lucent-kpis" aria-label="Resumen financiero">
          <article className="is-primary"><span>Valor actual de cartera</span><strong>{formatCurrency(visibleBalance)}</strong><small>{pending.length ? 'Capital publicado más movimientos posteriores' : `Cierre de ${latestPublished?.label ?? 'periodo'}`}</small></article>
          <article className="is-primary"><span>Rentabilidad {latestPublished?.label ?? 'último mes'}</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPercent(Number(report.rentabilidadUltimoMes || 0))}</strong><small>Rendimiento TWR del último cierre</small></article>
          <article className="is-primary"><span>Beneficio {latestPublished?.label ?? 'último mes'}</span><strong className={tone(report.beneficioUltimoMes)}>{signedMoney(Number(report.beneficioUltimoMes || 0))}</strong><small>Resultado real generado en euros</small></article>
          <article><span>TWR acumulado</span><strong className={tone(totalTwr)}>{signedPercent(totalTwr)}</strong><small>Desde {publishedMonths[0]?.label ?? 'el primer cierre'}</small></article>
          <article><span>Capital aportado</span><strong>{formatCurrency(visibleContributions)}</strong><small>{report.movements.filter((row) => row.type === 'increment').length + pending.filter((row) => row.type === 'increment').length} aportaciones registradas</small></article>
          <article><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawals)}</strong><small>{report.movements.filter((row) => row.type === 'decrement').length + pending.filter((row) => row.type === 'decrement').length} retiradas registradas</small></article>
          <article><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(Number(report.beneficioTotal || 0))}</strong><small>Resultado acumulado publicado</small></article>
          <article><span>Rentabilidad total</span><strong className={tone(totalReturn)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(totalReturn)}</strong><small>Beneficio sobre capital neto aportado</small></article>
        </section>

        <section className="lucent-intelligence">
          <div className="lucent-intelligence-orb"><Icon name="spark" /></div>
          <div><p>Lectura automática del periodo</p><strong>{insight}</strong></div>
          <span>Generado exclusivamente con los datos del informe</span>
        </section>

        <section className="lucent-chart-section lucent-balance-section">
          <div className="lucent-section-heading">
            <div><p>Cartografía patrimonial</p><h2>Evolución del valor de cartera</h2><span>Cierre de cada mes, con escala iniciada en cero para conservar la proporción real.</span></div>
            <div className="lucent-section-stat"><span>Último valor</span><strong>{formatCurrency(latestPublished?.balance ?? 0)}</strong></div>
          </div>
          <div className="lucent-line-chart-scroll">
            <svg className="lucent-line-chart" viewBox={`0 0 ${balanceChart.width} ${balanceChart.height}`} role="img" aria-label="Evolución mensual del valor de cartera">
              <defs>
                <linearGradient id="lucent-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52bcae" stopOpacity=".34" /><stop offset="100%" stopColor="#52bcae" stopOpacity=".02" /></linearGradient>
                <filter id="lucent-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              {chartTicks.map((tick, index) => {
                const y = balanceChart.padding.top + index * balanceChart.usableHeight / 4;
                return <g key={tick}><line x1={balanceChart.padding.left} x2={balanceChart.width - balanceChart.padding.right} y1={y} y2={y} /><text x={balanceChart.padding.left - 8} y={y + 4} textAnchor="end">{compactMoney(tick)}</text></g>;
              })}
              <path d={balanceChart.area} className="lucent-area-path" />
              <path d={balanceChart.path} className="lucent-line-path" filter="url(#lucent-glow)" />
              {balanceChart.points.map((point, index) => (
                <g key={point.month.key} className={`lucent-chart-point${index === publishedMonths.length - 1 ? ' is-last' : ''}`} onClick={() => selectMonth(index, 'gráfico')}>
                  <line x1={point.x} x2={point.x} y1={point.y + 8} y2={balanceChart.padding.top + balanceChart.usableHeight} className="lucent-point-guide" />
                  <circle cx={point.x} cy={point.y} r="7" />
                  <text x={point.x} y={point.y + (index % 2 === 0 ? -16 : 25)} textAnchor="middle" className="lucent-point-value">{compactMoney(point.month.balance)}</text>
                  <text x={point.x} y={balanceChart.height - 12} textAnchor="middle" className="lucent-point-month">{point.month.shortLabel}</text>
                  <title>{point.month.label}: {formatCurrency(point.month.balance)}</title>
                </g>
              ))}
            </svg>
          </div>
        </section>

        <section className="lucent-dual-charts">
          <article className="lucent-chart-section">
            <div className="lucent-section-heading compact"><div><p>Rendimiento</p><h2>Rentabilidad mensual</h2></div><strong className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong></div>
            <div className="lucent-bar-chart" style={{ '--lucent-columns': publishedMonths.length } as React.CSSProperties}>
              {publishedMonths.map((month, index) => {
                const height = Math.max(4, Math.abs(month.returnPct) / maxReturn * 74);
                return <button type="button" key={month.key} className={`${tone(month.returnPct)}${index === publishedMonths.length - 1 ? ' is-last' : ''}`} onClick={() => selectMonth(index, 'rentabilidad')}><b>{signedPercent(month.returnPct)}</b><span className="lucent-bar-track"><i style={{ height: `${height}%` }} /></span><small>{month.shortLabel}</small><em>{month.label}: {signedPercent(month.returnPct)}</em></button>;
              })}
            </div>
          </article>
          <article className="lucent-chart-section">
            <div className="lucent-section-heading compact"><div><p>Resultado</p><h2>Beneficio mensual</h2></div><strong className={tone(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong></div>
            <div className="lucent-bar-chart is-profit" style={{ '--lucent-columns': publishedMonths.length } as React.CSSProperties}>
              {publishedMonths.map((month, index) => {
                const height = Math.max(4, Math.abs(month.profit) / maxProfit * 74);
                return <button type="button" key={month.key} className={`${tone(month.profit)}${index === publishedMonths.length - 1 ? ' is-last' : ''}`} onClick={() => selectMonth(index, 'beneficio')}><b>{compactMoney(month.profit)}</b><span className="lucent-bar-track"><i style={{ height: `${height}%` }} /></span><small>{month.shortLabel}</small><em>{month.label}: {signedMoney(month.profit)}</em></button>;
              })}
            </div>
          </article>
        </section>

        <section className="lucent-data-section">
          <div className="lucent-section-heading">
            <div><p>Registro mensual</p><h2>Tabla mensual</h2><span>Beneficio, rentabilidad y valor de cartera al cierre de cada periodo.</span></div>
            <small><b>+</b> abre el detalle cuando el mes contiene aportaciones o retiradas</small>
          </div>
          <div className="lucent-table-wrap">
            <table className="lucent-table">
              <colgroup><col className="is-toggle" /><col className="is-date" /><col /><col /><col /></colgroup>
              <thead><tr><th aria-label="Detalle" /><th>Fecha de cierre</th><th>Beneficio</th><th>Rentabilidad</th><th>Valor de cartera</th></tr></thead>
              <tbody>
                {publishedMonths.map((month) => {
                  const expandable = Boolean(month.breakdown);
                  const expanded = expandedMonths.has(month.key);
                  return (
                    <React.Fragment key={month.key}>
                      <tr className={expandable ? 'has-detail' : ''}>
                        <td>{expandable ? <button type="button" aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalle de ${month.label}`} aria-expanded={expanded} onClick={() => toggleExpanded(month.key)}>{expanded ? '−' : '+'}</button> : <span>·</span>}</td>
                        <td><strong>{month.closeDate}</strong>{month.increments || month.decrements ? <small>{month.increments ? 'Aportación' : ''}{month.increments && month.decrements ? ' · ' : ''}{month.decrements ? 'Retirada' : ''}</small> : null}</td>
                        <td className={tone(month.profit)}>{signedMoney(month.profit)}</td>
                        <td className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</td>
                        <td><strong>{formatCurrency(month.balance)}</strong></td>
                      </tr>
                      {expanded ? <tr className="lucent-detail-row"><td colSpan={5}>{renderBreakdown(month)}</td></tr> : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lucent-data-section">
          <div className="lucent-section-heading">
            <div><p>Flujos de capital</p><h2>Capital aportado y retirado</h2><span>Movimientos registrados y su efecto en el capital neto de la cartera.</span></div>
            <div className="lucent-flow-total"><span>Capital neto aportado</span><strong>{formatCurrency(visibleContributions - visibleWithdrawals)}</strong></div>
          </div>
          <div className="lucent-movement-grid">
            {allMovements.map((movement, index) => (
              <article key={`${movement.iso}-${movement.type}-${index}`} className={movement.type === 'increment' ? 'is-in' : 'is-out'}>
                <span className="lucent-movement-icon">{movement.type === 'increment' ? '↗' : '↘'}</span>
                <div><small>{dateLabel(movement.iso)}</small><strong>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</strong>{movement.pending ? <em>Posterior al último cierre</em> : null}</div>
                <b>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</b>
              </article>
            ))}
            {!allMovements.length ? <p className="lucent-empty">No hay aportaciones ni retiradas registradas en este informe.</p> : null}
          </div>
        </section>

        <section className="lucent-method">
          <div><p>Cómo interpretar el informe</p><h2>Dos perspectivas complementarias</h2></div>
          <article><span>01</span><div><strong>TWR · rentabilidad ponderada por el tiempo</strong><p>Mide la evolución de la cartera aislando el efecto de las aportaciones y retiradas. Permite conocer cómo se han comportado las inversiones independientemente de cuándo entró o salió capital.</p></div></article>
          <article><span>02</span><div><strong>Rentabilidad total</strong><p>Mide el beneficio acumulado en relación con el capital neto aportado. Por este motivo puede variar cuando se realizan nuevas aportaciones o retiradas.</p></div></article>
        </section>
      </main>

      <footer className="lucent-footer"><div className="lucent-brand"><span className="lucent-brand-mark"><i /><i /><i /></span><div><strong>LUCENT</strong><small>Private wealth intelligence</small></div></div><span>Información financiera privada · {report.clientCode}</span></footer>

      {cinema ? (
        <div className="lucent-cinema-bar">
          <div><span>Presentación inmersiva</span><strong>{active?.label}</strong></div>
          <div className="lucent-cinema-layers">{(Object.keys(layerLabels) as LucentSceneLayer[]).map((value) => <button type="button" key={value} className={layer === value ? 'is-active' : ''} onClick={() => changeLayer(value)}>{layerLabels[value]}</button>)}</div>
          <button type="button" onClick={() => setCinema(false)}><Icon name="close" /> Salir <kbd>ESC</kbd></button>
        </div>
      ) : null}
    </div>
  );
};
