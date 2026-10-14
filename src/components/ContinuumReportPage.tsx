import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './ContinuumReportPage.css';

interface ContinuumPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface ContinuumReportPageProps {
  report: ReportData;
  pendingCashMovements?: ContinuumPendingMovement[];
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

interface ContinuumMonth {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  opening: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

interface ContinuumMovement {
  iso: string;
  type: string;
  amount: number;
  balance: number;
  returnPct?: number;
  profit?: number;
  pending?: boolean;
}

type PeriodPreset = '6m' | '12m' | 'all' | 'custom';
type MovementFilter = 'all' | 'increment' | 'decrement';

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
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const compactMoney = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const tone = (value: number) => value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral';

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const attributionKey = (type: string, iso: string, amount: number) => `${type}|${iso}|${amount.toFixed(6)}`;

const niceCeiling = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 1.25 ? 1.25 : normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
};

export const ContinuumReportPage: React.FC<ContinuumReportPageProps> = ({
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
  const hasTotalReturn = report.rentabilidadDisponible !== false;

  const months = useMemo<ContinuumMonth[]>(() => {
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const available = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(available[available.length - 1]?.month ?? '');
    return available.map((month) => {
      const key = monthToKey(month.month);
      const monthMovements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(monthMovements, 'increment');
      const decrements = sumMovements(monthMovements, 'decrement');
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
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const latestMonth = months[months.length - 1];
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusKey, setFocusKey] = useState(latestKey);
  const [showReturns, setShowReturns] = useState(true);
  const [showFlows, setShowFlows] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<ContinuumMonth | null>(null);
  const [journeyPlaying, setJourneyPlaying] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all');
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const expandedScrollRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, SVGGElement>());
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const visibleMonths = useMemo(() => {
    if (period === '6m') return months.slice(-6);
    if (period === '12m') return months.slice(-12);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const focusMonth = visibleMonths.find((month) => month.key === focusKey) ?? visibleMonths[visibleMonths.length - 1];
  const focusIndex = focusMonth ? visibleMonths.findIndex((month) => month.key === focusMonth.key) : -1;
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodProfit = visibleMonths.reduce((total, month) => total + month.profit, 0);
  const periodTwr = (visibleMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1) * 100;
  const activeReadout = hoveredMonth ?? focusMonth;
  const focusProgress = visibleMonths.length <= 1 || focusIndex < 0 ? 100 : focusIndex / (visibleMonths.length - 1) * 100;
  const archiveMonths = archiveExpanded || visibleMonths.length <= 12 ? visibleMonths : visibleMonths.slice(-12);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusKey(latestKey);
    setOpenMonthKey(null);
    setExpanded(false);
    setJourneyPlaying(false);
    setArchiveExpanded(false);
    setMovementFilter('all');
  }, [latestKey, months, report.clientId, report.createdAt]);

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusKey)) {
      setFocusKey(visibleMonths[visibleMonths.length - 1].key);
      setOpenMonthKey(null);
    }
  }, [focusKey, visibleMonths]);

  useEffect(() => {
    const scrollToEnd = (container: HTMLDivElement | null) => {
      if (container) container.scrollLeft = container.scrollWidth;
    };
    window.requestAnimationFrame(() => {
      scrollToEnd(chartScrollRef.current);
      scrollToEnd(expandedScrollRef.current);
    });
  }, [expanded, period, periodStart, periodEnd]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setJourneyPlaying(false);
        setExpanded(false);
        window.requestAnimationFrame(() => expandButtonRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab' || !overlayRef.current) return;
      const focusable = Array.from(overlayRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.classList.add('continuum-lock');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('continuum-lock');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (!journeyPlaying || visibleMonths.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setFocusKey((currentKey) => {
        const currentIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === currentKey));
        if (currentIndex >= visibleMonths.length - 1) {
          setJourneyPlaying(false);
          return visibleMonths[currentIndex]?.key ?? currentKey;
        }
        return visibleMonths[currentIndex + 1].key;
      });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [journeyPlaying, visibleMonths]);

  useEffect(() => {
    if (focusIndex < 0) return;
    const centerFocusedMonth = (container: HTMLDivElement | null) => {
      if (!container) return;
      const width = Math.max(1180, visibleMonths.length * 98 + 190);
      const left = 92;
      const right = width - 72;
      const x = visibleMonths.length <= 1 ? (left + right) / 2 : left + focusIndex * ((right - left) / (visibleMonths.length - 1));
      const target = x - container.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, target), behavior: journeyPlaying ? 'smooth' : 'auto' });
    };
    centerFocusedMonth(chartScrollRef.current);
    centerFocusedMonth(expandedScrollRef.current);
  }, [focusIndex, journeyPlaying, periodEnd, periodStart, visibleMonths.length]);

  const moveFocus = useCallback((direction: -1 | 1, shouldMoveDomFocus = true) => {
    if (!visibleMonths.length) return;
    setJourneyPlaying(false);
    const current = Math.max(0, visibleMonths.findIndex((month) => month.key === focusMonth?.key));
    const next = visibleMonths[Math.max(0, Math.min(visibleMonths.length - 1, current + direction))];
    setFocusKey(next.key);
    if (shouldMoveDomFocus) monthRefs.current.get(next.key)?.focus();
  }, [focusMonth?.key, visibleMonths]);

  const attributedMovements = useMemo<ContinuumMovement[]>(() => {
    const pools = new Map<string, Array<{ returnPct?: number; profit: number }>>();
    (report.contributionBreakdowns ?? []).forEach((breakdown) => {
      breakdown.contributions.forEach((item) => {
        const key = attributionKey('increment', item.iso, item.amount);
        const values = pools.get(key) ?? [];
        values.push({ returnPct: item.returnPct, profit: item.profit });
        pools.set(key, values);
      });
      (breakdown.withdrawals ?? []).forEach((item) => {
        const key = attributionKey('decrement', item.iso, item.amount);
        const values = pools.get(key) ?? [];
        values.push({ returnPct: item.returnPct, profit: item.profit });
        pools.set(key, values);
      });
    });
    const published = (report.movements ?? []).map((movement) => {
      const attributed = pools.get(attributionKey(movement.type, movement.iso, movement.amount))?.shift();
      return { ...movement, returnPct: attributed?.returnPct, profit: attributed?.profit };
    });
    let projectedBalance = report.saldo;
    const inTransit = pending.map((movement) => {
      projectedBalance += movement.type === 'increment' ? movement.amount : -movement.amount;
      return { ...movement, balance: projectedBalance, pending: true };
    });
    return [...published, ...inTransit].sort((left, right) => right.iso.localeCompare(left.iso));
  }, [pending, report.contributionBreakdowns, report.movements, report.saldo]);

  const visibleMovements = attributedMovements.filter((movement) => (
    movement.pending || !periodStart || (movement.iso.slice(0, 7) >= periodStart && movement.iso.slice(0, 7) <= periodEnd)
  ));
  const filteredMovements = visibleMovements.filter((movement) => movementFilter === 'all' || movement.type === movementFilter);
  const movementCounts = {
    all: visibleMovements.length,
    increment: visibleMovements.filter((movement) => movement.type === 'increment').length,
    decrement: visibleMovements.filter((movement) => movement.type === 'decrement').length
  };

  const bestMonth = months.reduce<ContinuumMonth | undefined>((best, month) => !best || month.returnPct > best.returnPct ? month : best, undefined);
  const profitableMonths = months.filter((month) => month.profit > 0).length;
  const currentPositiveStreak = [...months].reverse().findIndex((month) => month.profit <= 0);
  const positiveStreak = currentPositiveStreak === -1 ? months.length : currentPositiveStreak;
  const firstInvestedMonth = months.find((month) => month.balance > 0);
  const valueGrowth = firstInvestedMonth?.balance
    ? (visibleBalance - firstInvestedMonth.balance) / firstInvestedMonth.balance * 100
    : 0;
  const capitalShare = visibleBalance > 0 ? Math.max(0, Math.min(100, netCapital / visibleBalance * 100)) : 0;
  const profitShare = visibleBalance > 0 ? Math.max(0, Math.min(100, report.beneficioTotal / visibleBalance * 100)) : 0;
  const coreStyle = { '--capital-share': `${capitalShare * 3.6}deg` } as React.CSSProperties;

  const chartWidth = Math.max(1180, visibleMonths.length * 98 + 190);
  const chartHeight = 510;
  const chartLeft = 92;
  const chartRight = chartWidth - 72;
  const balanceTop = 50;
  const balanceBottom = 306;
  const returnCenter = 390;
  const xFor = (index: number) => visibleMonths.length <= 1
    ? (chartLeft + chartRight) / 2
    : chartLeft + index * ((chartRight - chartLeft) / (visibleMonths.length - 1));
  const maxBalance = niceCeiling(Math.max(...visibleMonths.map((month) => Math.abs(month.balance)), 1) * 1.04);
  const maxReturn = niceCeiling(Math.max(...visibleMonths.map((month) => Math.abs(month.returnPct)), 1) * 1.08);
  const yForBalance = (value: number) => balanceBottom - (Math.max(0, value) / maxBalance) * (balanceBottom - balanceTop);
  const returnHeight = (value: number) => Math.abs(value) / maxReturn * 68;
  const balancePath = visibleMonths.map((month, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yForBalance(month.balance)}`).join(' ');
  const balanceArea = balancePath && visibleMonths.length
    ? `${balancePath} L ${xFor(visibleMonths.length - 1)} ${balanceBottom} L ${xFor(0)} ${balanceBottom} Z`
    : '';

  const selectPeriod = (next: PeriodPreset) => {
    setJourneyPlaying(false);
    setHoveredMonth(null);
    setPeriod(next);
    onAnalyticsEvent?.({ type: 'report_period_change', label: `Continuum ${next}` });
  };

  const selectMonth = (key: string) => {
    setJourneyPlaying(false);
    setFocusKey(key);
  };

  const toggleJourney = () => {
    if (journeyPlaying) {
      setJourneyPlaying(false);
      return;
    }
    if (focusIndex >= visibleMonths.length - 1) setFocusKey(visibleMonths[0]?.key ?? '');
    setOpenMonthKey(null);
    setJourneyPlaying(true);
    onAnalyticsEvent?.({ type: 'report_guided_journey', label: 'Continuum recorrido guiado' });
  };

  const renderChart = (isExpanded = false) => (
    <div className={`continuum-chart-stage${isExpanded ? ' is-expanded' : ''}`}>
      {activeReadout ? <div className="continuum-chart-readout" aria-live="polite">
        <span>{activeReadout.label}</span>
        <strong>{formatCurrency(activeReadout.balance)}</strong>
        <div><b className={tone(activeReadout.returnPct)}>{signedPercent(activeReadout.returnPct)}</b><em className={tone(activeReadout.profit)}>{signedMoney(activeReadout.profit)}</em></div>
        <small>{activeReadout.increments || activeReadout.decrements ? `${activeReadout.increments ? `Aportado ${formatCurrency(activeReadout.increments)}` : ''}${activeReadout.increments && activeReadout.decrements ? ' · ' : ''}${activeReadout.decrements ? `Retirado ${formatCurrency(activeReadout.decrements)}` : ''}` : 'Sin movimientos de capital'}</small>
      </div> : null}
      <div className="continuum-chart-scroll" ref={isExpanded ? expandedScrollRef : chartScrollRef}>
        <div className="continuum-sticky-axis" aria-hidden="true">
          {[1, .75, .5, .25, 0].map((ratio) => <span key={ratio} style={{ top: `${(balanceTop + (1 - ratio) * (balanceBottom - balanceTop)) / chartHeight * 100}%` }}>{compactMoney(maxBalance * ratio)}</span>)}
          {showReturns ? <><span className="is-return is-high" style={{ top: `${(returnCenter - 68) / chartHeight * 100}%` }}>+{maxReturn.toLocaleString('es-ES')} %</span><span className="is-return" style={{ top: `${returnCenter / chartHeight * 100}%` }}>0 %</span><span className="is-return is-low" style={{ top: `${(returnCenter + 68) / chartHeight * 100}%` }}>−{maxReturn.toLocaleString('es-ES')} %</span></> : null}
        </div>
        <svg key={`${periodStart}-${periodEnd}-${showReturns}-${showFlows}`} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: chartWidth }} role="listbox" aria-label="Evolución conjunta del patrimonio, la rentabilidad y los movimientos de capital">
          <title>Evolución conjunta del patrimonio, la rentabilidad y los movimientos de capital</title>
          <defs>
            <linearGradient id={`continuum-area-${isExpanded ? 'expanded' : 'inline'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#63e6cf" stopOpacity=".34" />
              <stop offset=".72" stopColor="#63e6cf" stopOpacity=".06" />
              <stop offset="1" stopColor="#63e6cf" stopOpacity="0" />
            </linearGradient>
            <filter id={`continuum-glow-${isExpanded ? 'expanded' : 'inline'}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = balanceBottom - ratio * (balanceBottom - balanceTop);
            return <line key={ratio} x1={chartLeft} x2={chartRight} y1={y} y2={y} className="continuum-grid-line" />;
          })}
          {showReturns ? <><line x1={chartLeft} x2={chartRight} y1={returnCenter - 68} y2={returnCenter - 68} className="continuum-return-bound" /><line x1={chartLeft} x2={chartRight} y1={returnCenter} y2={returnCenter} className="continuum-return-zero" /><line x1={chartLeft} x2={chartRight} y1={returnCenter + 68} y2={returnCenter + 68} className="continuum-return-bound" /></> : null}
          {focusIndex >= 0 ? <><line x1={xFor(focusIndex)} x2={xFor(focusIndex)} y1="34" y2="461" className="continuum-scanner" /><rect x={xFor(focusIndex) - 43} y="31" width="86" height="432" rx="18" className="continuum-focus-field" /></> : null}
          {balanceArea ? <path d={balanceArea} fill={`url(#continuum-area-${isExpanded ? 'expanded' : 'inline'})`} className="continuum-area" /> : null}
          {balancePath ? <path d={balancePath} className="continuum-path" /> : null}
          {visibleMonths.map((month, index) => {
            const x = xFor(index);
            const y = yForBalance(month.balance);
            const isFocused = month.key === focusMonth?.key;
            const barHeight = returnHeight(month.returnPct);
            const barY = month.returnPct >= 0 ? returnCenter - barHeight : returnCenter;
            return <g
              key={month.key}
              ref={(node) => { if (!isExpanded) { if (node) monthRefs.current.set(month.key, node); else monthRefs.current.delete(month.key); } }}
              role="option"
              aria-selected={isFocused}
              tabIndex={0}
              className={`continuum-month-node${isFocused ? ' is-focused' : ''}`}
              onClick={() => selectMonth(month.key)}
              onFocus={() => selectMonth(month.key)}
              onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHoveredMonth(month); }}
              onPointerLeave={() => setHoveredMonth(null)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1, !isExpanded); }
                if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(1, !isExpanded); }
                if (event.key === 'Enter' && month.breakdown) setOpenMonthKey((current) => current === month.key ? null : month.key);
              }}
              aria-label={`${month.label}. Saldo ${formatCurrency(month.balance)}. Rentabilidad ${signedPercent(month.returnPct)}. Beneficio ${signedMoney(month.profit)}`}
            >
              <rect x={x - 44} y="28" width="88" height="444" className="continuum-hit-area" />
              <circle cx={x} cy={y} r={isFocused ? 7 : 4} className="continuum-point-halo" />
              <circle cx={x} cy={y} r={isFocused ? 4 : 2.5} className="continuum-point" filter={isFocused ? `url(#continuum-glow-${isExpanded ? 'expanded' : 'inline'})` : undefined} />
              {showReturns ? <rect x={x - 13} y={barY} width="26" height={Math.max(1, barHeight)} rx="4" className={`continuum-return-bar ${month.returnPct < 0 ? 'is-negative' : 'is-positive'}`} /> : null}
              {showFlows && month.increments > 0 ? <path d={`M ${x - (month.decrements ? 8 : 0)} 432 l 6 9 h -12 z`} className="continuum-flow-in" /> : null}
              {showFlows && month.decrements > 0 ? <path d={`M ${x + (month.increments ? 8 : 0)} 441 l 6 -9 h -12 z`} className="continuum-flow-out" /> : null}
              <text x={x} y="488" textAnchor="middle" className="continuum-month-label">{month.shortLabel}</text>
              {isFocused ? <><text x={x} y={Math.max(22, y - 20)} textAnchor="middle" className="continuum-point-value">{compactMoney(month.balance)}</text>{showReturns ? <text x={x} y={month.returnPct >= 0 ? Math.max(325, barY - 9) : Math.min(476, barY + barHeight + 18)} textAnchor="middle" className="continuum-return-value">{signedPercent(month.returnPct)}</text> : null}</> : null}
            </g>;
          })}
          {!visibleMonths.length ? <text x={chartWidth / 2} y={chartHeight / 2} textAnchor="middle" className="continuum-empty-chart">Sin cierres publicados</text> : null}
        </svg>
      </div>
      <div className="continuum-axis-key" aria-hidden="true"><span>Patrimonio</span><span>Rentabilidad</span><span>Capital</span></div>
    </div>
  );

  const focusPreviousMonth = focusIndex > 0 ? visibleMonths[focusIndex - 1] : undefined;
  const focusNarrative = focusMonth
    ? focusMonth.increments || focusMonth.decrements
      ? `${focusMonth.label} cerró con ${signedMoney(focusMonth.profit)} de resultado después de integrar ${focusMonth.increments ? `aportaciones por ${formatCurrency(focusMonth.increments)}` : ''}${focusMonth.increments && focusMonth.decrements ? ' y ' : ''}${focusMonth.decrements ? `retiradas por ${formatCurrency(focusMonth.decrements)}` : ''}. Cada flujo queda separado del rendimiento de la inversión.`
      : `${focusMonth.label} cerró con ${signedMoney(focusMonth.profit)} de resultado y sin movimientos de capital. La variación del mes procede íntegramente de la inversión.`
    : 'Selecciona un cierre para consultar su lectura completa.';

  return (
    <main className="continuum-report" ref={rootRef}>
      <header className="continuum-topbar">
        <div className="continuum-wordmark"><span>C/19</span><div><strong>CONTINUUM</strong><small>PRIVATE WEALTH INTERFACE · CODEX</small></div></div>
        <div className="continuum-top-actions"><span className="continuum-live"><i />POSICIÓN VERIFICADA</span><span>{report.clientCode}</span><button type="button" onClick={onDownload}>Exportar informe</button></div>
      </header>

      <section className="continuum-opening" aria-label="Estado actual de la cartera">
        <div className="continuum-opening-copy">
          <span className="continuum-eyebrow">PATRIMONIO ACTUAL</span>
          <h1>{formatCurrency(visibleBalance)}</h1>
          <p>{pending.length ? 'Saldo publicado más movimientos de capital posteriores al último cierre.' : `Posición consolidada al cierre de ${latestMonth?.label ?? 'la cartera'}.`}</p>
          <div className="continuum-opening-meta"><span>Último cierre <strong>{latestMonth?.label ?? 'Sin datos'}</strong></span><span>Histórico <strong>{months.length} {months.length === 1 ? 'mes' : 'meses'}</strong></span>{pending.length ? <span className="is-pending">Actualización de capital activa</span> : <span className="is-settled">Cartera conciliada</span>}</div>
          <div className="continuum-opening-delta"><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
        </div>

        <div className="continuum-core" style={coreStyle} aria-label={`Capital neto ${formatCurrency(netCapital)} y beneficio acumulado ${signedMoney(report.beneficioTotal)}`}>
          <div className="continuum-core-orbit is-outer"><i /><i /><i /></div>
          <div className="continuum-core-orbit is-inner"><i /><i /></div>
          <div className="continuum-core-ring"><div><span>CAPITAL EN OPERACIÓN</span><strong>{compactMoney(netCapital)}</strong><small>{capitalShare.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % del saldo</small></div></div>
          <span className="continuum-core-caption is-capital">CAPITAL <b>{formatCurrency(netCapital)}</b></span>
          <span className="continuum-core-caption is-profit">BENEFICIO <b>{signedMoney(report.beneficioTotal)}</b></span>
        </div>

        <div className="continuum-opening-signals">
          <article><span>{latestMonth?.label ?? 'Último cierre'}</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong><small>Rentabilidad mensual</small></article>
          <article><span>RESULTADO DEL MES</span><strong className={tone(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong><small>Beneficio en euros</small></article>
          <div><span>TWR acumulado <strong>{signedPercent(twrPct)}</strong></span><span>Rentabilidad total <strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></span></div>
        </div>
      </section>

      <section className="continuum-capital-band" aria-label="Identidad patrimonial">
        <span><small>APORTADO</small><strong>{formatCurrency(visibleContributed)}</strong></span>
        <b>−</b>
        <span><small>RETIRADO</small><strong>{formatCurrency(visibleWithdrawn)}</strong></span>
        <b>+</b>
        <span><small>BENEFICIO</small><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></span>
        <b>=</b>
        <span className="is-result"><small>PATRIMONIO</small><strong>{formatCurrency(visibleBalance)}</strong></span>
      </section>

      <details className="continuum-method">
        <summary><div><span>CLAVES DE LECTURA</span><strong>Cómo interpretar el rendimiento de la cartera</strong></div><small>Abrir explicación <i>+</i></small></summary>
        <div className="continuum-method-grid">
          <article><span>01</span><div><strong>TWR · Rentabilidad de la inversión</strong><p>Mide la evolución de la cartera aislando el efecto de las aportaciones y retiradas. Permite valorar el comportamiento de la inversión independientemente de cuándo entró o salió capital.</p></div></article>
          <article><span>02</span><div><strong>Rentabilidad total</strong><p>Relaciona el beneficio acumulado con el capital neto aportado. Por eso puede cambiar cuando se realizan nuevas aportaciones o retiradas.</p></div></article>
          <article><span>03</span><div><strong>Resultado mensual</strong><p>Es el beneficio o la pérdida generada en euros durante cada mes. En meses con movimientos, la composición separa cada tramo de capital.</p></div></article>
        </div>
      </details>

      {pending.length ? <section className="continuum-transit" aria-labelledby="continuum-transit-title"><div><span>CAPITAL EN TRÁNSITO</span><h2 id="continuum-transit-title">La posición ya incorpora nuevos movimientos</h2><p>Su resultado se integrará cuando se publique el siguiente cierre mensual.</p></div><div>{pending.map((movement, index) => <article key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></article>)}</div></section> : null}

      <section className="continuum-console" aria-label="Controles de la trayectoria">
        <div><span>VENTANA TEMPORAL</span><strong>{periodStart ? `${monthLabel(periodStart, true)} → ${monthLabel(periodEnd, true)}` : 'Sin datos'}</strong></div>
        <div className="continuum-periods">{(['6m', '12m', 'all', 'custom'] as const).map((option) => <button key={option} type="button" className={period === option ? 'is-active' : ''} aria-pressed={period === option} onClick={() => selectPeriod(option)}>{option === 'all' ? 'Todo el histórico' : option === 'custom' ? 'Elegir fechas' : option.toUpperCase()}</button>)}</div>
        <div className="continuum-layers" role="group" aria-label="Capas visibles"><button type="button" className={showReturns ? 'is-active' : ''} aria-pressed={showReturns} onClick={() => setShowReturns((current) => !current)}><i />Rentabilidad</button><button type="button" className={showFlows ? 'is-active' : ''} aria-pressed={showFlows} onClick={() => setShowFlows((current) => !current)}><i />Movimientos</button></div>
        {period === 'custom' ? <div className="continuum-custom-period"><label>Desde<select value={customStart} onChange={(event) => { const next = event.target.value; setCustomStart(next); if (next > customEnd) setCustomEnd(next); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => { const next = event.target.value; setCustomEnd(next); if (next < customStart) setCustomStart(next); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <section className="continuum-field" aria-labelledby="continuum-field-title">
        <header><div><span className="continuum-eyebrow">TRAYECTORIA SINCRONIZADA</span><h2 id="continuum-field-title">La historia completa, en un único plano</h2><p>Patrimonio, rentabilidad y movimientos de capital comparten la misma línea temporal.</p></div><div className="continuum-field-actions"><span>Resultado visible <strong className={tone(periodProfit)}>{signedMoney(periodProfit)}</strong></span><span>TWR visible <strong className={tone(periodTwr)}>{signedPercent(periodTwr)}</strong></span><div className="continuum-field-buttons"><button type="button" className={journeyPlaying ? 'is-playing' : ''} aria-pressed={journeyPlaying} onClick={toggleJourney}>{journeyPlaying ? 'Pausar recorrido' : 'Ver evolución'} <i aria-hidden="true">{journeyPlaying ? 'Ⅱ' : '▶'}</i></button><button ref={expandButtonRef} type="button" onClick={() => { setJourneyPlaying(false); setExpanded(true); onAnalyticsEvent?.({ type: 'report_chart_expand', label: 'Continuum trayectoria expandida' }); }}>Ampliar ↗</button></div></div></header>
        {renderChart()}
        <nav className="continuum-navigator" aria-label="Navegación por cierres mensuales">
          <button type="button" disabled={focusIndex <= 0} onClick={() => moveFocus(-1, false)} aria-label="Ver mes anterior">←</button>
          <div className="continuum-navigator-track" style={{ '--focus-progress': `${focusProgress}%` } as React.CSSProperties}>
            <i aria-hidden="true" />
            {visibleMonths.map((month) => <button key={month.key} type="button" className={month.key === focusMonth?.key ? 'is-active' : ''} onClick={() => selectMonth(month.key)} aria-label={`Ver ${month.label}`} title={month.label}><span /></button>)}
          </div>
          <span><strong>{focusMonth?.shortLabel ?? '—'}</strong><small>{focusIndex >= 0 ? focusIndex + 1 : 0} de {visibleMonths.length}</small></span>
          <button type="button" disabled={focusIndex < 0 || focusIndex >= visibleMonths.length - 1} onClick={() => moveFocus(1, false)} aria-label="Ver mes siguiente">→</button>
        </nav>
        <footer><span><i className="is-balance" />Patrimonio</span><span><i className="is-return" />Rentabilidad</span><span><i className="is-increment" />Aportación</span><span><i className="is-decrement" />Retirada</span><small>Selecciona cualquier mes para reconstruir su cierre.</small></footer>
      </section>

      <section className="continuum-lens" aria-live="polite" key={focusMonth?.key ?? 'empty'}>
        {focusMonth ? <>
          <div className="continuum-lens-index"><span>CIERRE EN FOCO</span><strong>{focusMonth.shortLabel}</strong><small>{String(focusIndex + 1).padStart(2, '0')} / {String(visibleMonths.length).padStart(2, '0')}</small></div>
          <div className="continuum-lens-story"><h2>{focusMonth.label}</h2><p>{focusNarrative}</p><div><span>Saldo inicial <strong>{formatCurrency(focusMonth.opening)}</strong></span><span>Aportaciones <strong>{focusMonth.increments ? `+${formatCurrency(focusMonth.increments)}` : '—'}</strong></span><span>Retiradas <strong>{focusMonth.decrements ? `−${formatCurrency(focusMonth.decrements)}` : '—'}</strong></span>{focusPreviousMonth ? <span>Cierre anterior <strong>{formatCurrency(focusPreviousMonth.balance)}</strong></span> : null}</div></div>
          <div className="continuum-lens-outcome"><span>RESULTADO</span><strong className={tone(focusMonth.profit)}>{signedMoney(focusMonth.profit)}</strong><small>{signedPercent(focusMonth.returnPct)}</small></div>
          <div className="continuum-lens-close"><span>SALDO FINAL</span><strong>{formatCurrency(focusMonth.balance)}</strong>{focusMonth.breakdown ? <button type="button" aria-expanded={openMonthKey === focusMonth.key} onClick={() => setOpenMonthKey((current) => current === focusMonth.key ? null : focusMonth.key)}>{openMonthKey === focusMonth.key ? 'Cerrar composición' : 'Abrir composición'}</button> : <small>Cierre sin tramos adicionales</small>}</div>
          {openMonthKey === focusMonth.key && focusMonth.breakdown ? <div className="continuum-composition"><header><span>COMPOSICIÓN DEL RESULTADO</span><strong>{signedMoney(focusMonth.breakdown.totalProfit)}</strong></header><article><span>Posición inicial</span><strong>{formatCurrency(focusMonth.breakdown.initialCapital)}</strong><em>{signedPercent(focusMonth.breakdown.initialReturnPct * 100)}</em><b>{signedMoney(focusMonth.breakdown.initialProfit)}</b></article>{focusMonth.breakdown.contributions.map((item, index) => <article key={`${item.iso}-${index}`}><span>Aportación · {formatDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><em>{signedPercent(item.returnPct * 100)}</em><b>{signedMoney(item.profit)}</b></article>)}{(focusMonth.breakdown.withdrawals ?? []).map((item, index) => <article key={`${item.iso}-${index}`}><span>Retirada · {formatDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><em>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</em><b>{signedMoney(item.profit)}</b></article>)}</div> : null}
        </> : <p className="continuum-empty">Sin cierres publicados.</p>}
      </section>

      <section className="continuum-intelligence" aria-label="Indicadores de lectura">
        <article><span>MEJOR CIERRE</span><strong>{bestMonth?.shortLabel ?? '—'}</strong><small>{bestMonth ? `${signedPercent(bestMonth.returnPct)} · ${signedMoney(bestMonth.profit)}` : 'Sin datos publicados'}</small></article>
        <article><span>CIERRES POSITIVOS</span><strong>{profitableMonths}<i>/</i>{months.length}</strong><small>{positiveStreak ? `${positiveStreak} consecutivos hasta el último cierre` : 'sin racha positiva activa'}</small></article>
        <article><span>EVOLUCIÓN PATRIMONIAL</span><strong className={tone(valueGrowth)}>{firstInvestedMonth ? signedPercent(valueGrowth) : '—'}</strong><small>{firstInvestedMonth ? `desde ${firstInvestedMonth.shortLabel}; incluye movimientos` : 'sin base histórica suficiente'}</small></article>
        <article><span>PESO DEL BENEFICIO</span><strong>{profitShare.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</strong><small>del patrimonio actual corresponde a beneficio</small></article>
      </section>

      <section className="continuum-months" aria-labelledby="continuum-months-title">
        <header><div><span className="continuum-eyebrow">ARCHIVO TEMPORAL</span><h2 id="continuum-months-title">Cada cierre conserva su contexto</h2><p>Una lectura rápida del histórico visible; el detalle se abre solo donde existe composición adicional.</p></div><div className="continuum-archive-actions"><strong>{archiveMonths.length} de {visibleMonths.length} cierres</strong>{visibleMonths.length > 12 ? <button type="button" onClick={() => setArchiveExpanded((current) => !current)}>{archiveExpanded ? 'Mostrar últimos 12' : 'Abrir archivo completo'}</button> : null}</div></header>
        <div className="continuum-month-grid">
          {archiveMonths.map((month, index) => {
            const isOpen = openMonthKey === month.key;
            return <article key={month.key} className={`${month.key === focusMonth?.key ? 'is-focused' : ''}${isOpen ? ' is-open' : ''}`} style={{ '--month-order': index } as React.CSSProperties}>
              <button type="button" onClick={() => { selectMonth(month.key); if (month.breakdown) setOpenMonthKey((current) => current === month.key ? null : month.key); }} aria-expanded={month.breakdown ? isOpen : undefined}>
                <span>{month.shortLabel}</span><strong>{formatCurrency(month.balance)}</strong><div><em className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</em><b className={tone(month.profit)}>{signedMoney(month.profit)}</b></div><small>{month.increments || month.decrements ? `${month.increments ? '↑' : ''}${month.decrements ? '↓' : ''} movimiento de capital` : 'sin movimientos'}</small>{month.breakdown ? <i>{isOpen ? '−' : '+'}</i> : null}
              </button>
              {isOpen && month.breakdown ? <div className="continuum-month-detail"><span>Posición inicial <strong>{formatCurrency(month.breakdown.initialCapital)}</strong><em>{signedPercent(month.breakdown.initialReturnPct * 100)}</em></span>{month.breakdown.contributions.map((item, itemIndex) => <span key={`${item.iso}-${itemIndex}`}>Aportación {formatDate(item.iso)} <strong>{formatCurrency(item.amount)}</strong><em>{signedPercent(item.returnPct * 100)}</em></span>)}{(month.breakdown.withdrawals ?? []).map((item, itemIndex) => <span key={`${item.iso}-${itemIndex}`}>Retirada {formatDate(item.iso)} <strong>{formatCurrency(item.amount)}</strong><em>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</em></span>)}</div> : null}
            </article>;
          })}
        </div>
      </section>

      <section className="continuum-ledger" aria-labelledby="continuum-ledger-title">
        <header><div><span className="continuum-eyebrow">REGISTRO DE CAPITAL</span><h2 id="continuum-ledger-title">Trazabilidad de aportaciones y retiradas</h2></div><div><span>Aportado <strong>{formatCurrency(visibleContributed)}</strong></span><span>Retirado <strong>{formatCurrency(visibleWithdrawn)}</strong></span></div></header>
        <div className="continuum-ledger-filters" role="group" aria-label="Filtrar movimientos"><span>MOSTRAR</span>{(['all', 'increment', 'decrement'] as const).map((filter) => <button key={filter} type="button" className={movementFilter === filter ? 'is-active' : ''} aria-pressed={movementFilter === filter} onClick={() => setMovementFilter(filter)}>{filter === 'all' ? 'Todos' : filter === 'increment' ? 'Aportaciones' : 'Retiradas'} <small>{movementCounts[filter]}</small></button>)}</div>
        <div className="continuum-ledger-head"><span>Fecha</span><span>Tipo</span><span>Importe</span><span>Rentabilidad atribuida</span><span>Beneficio atribuido</span><span>Estado</span></div>
        {filteredMovements.map((movement, index) => <article key={`${movement.iso}-${movement.type}-${index}`} className={movement.pending ? 'is-pending' : ''}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{movement.pending || movement.returnPct === undefined ? '—' : signedPercent(movement.returnPct * 100)}</span><span className={tone(movement.profit ?? 0)}>{movement.pending || movement.profit === undefined ? '—' : signedMoney(movement.profit)}</span><em>{movement.pending ? 'Próximo cierre' : movement.returnPct === undefined ? 'Publicado' : 'Atribuido'}</em></article>)}
        {!filteredMovements.length ? <p className="continuum-empty">No hay movimientos de este tipo en el periodo visible.</p> : null}
      </section>

      <footer className="continuum-footer"><div><span>C/19 · CONTINUUM</span><strong>Identidad patrimonial verificada</strong></div><p>{formatCurrency(visibleContributed)} − {formatCurrency(visibleWithdrawn)} + {signedMoney(report.beneficioTotal)} = <strong>{formatCurrency(visibleBalance)}</strong></p><small>Datos publicados y movimientos de capital visibles · {months.length} cierres</small></footer>

      {expanded && typeof document !== 'undefined' ? createPortal(<div ref={overlayRef} className="continuum-overlay" role="dialog" aria-modal="true" aria-labelledby="continuum-overlay-title"><header><div><span>CONTINUUM / VISTA EXPANDIDA</span><h2 id="continuum-overlay-title">Trayectoria patrimonial ampliada</h2><p>{periodStart ? `${monthLabel(periodStart)} — ${monthLabel(periodEnd)}` : 'Sin datos'}</p></div><div className="continuum-overlay-actions"><button type="button" className={journeyPlaying ? 'is-playing' : ''} aria-pressed={journeyPlaying} onClick={toggleJourney}>{journeyPlaying ? 'Pausar' : 'Reproducir'} {journeyPlaying ? 'Ⅱ' : '▶'}</button><button type="button" autoFocus onClick={() => { setJourneyPlaying(false); setExpanded(false); window.requestAnimationFrame(() => expandButtonRef.current?.focus()); }} aria-label="Cerrar gráfico ampliado">Cerrar ×</button></div></header>{renderChart(true)}<footer><span>← Selecciona o desplázate por el histórico →</span><small>{focusMonth?.label ?? 'Sin cierre seleccionado'} · Pulsa ESC para salir</small></footer></div>, document.body) : null}
    </main>
  );
};
