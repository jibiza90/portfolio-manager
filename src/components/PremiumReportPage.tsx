import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReportData } from '../services/reportLinks';
import type { GeneralReferenceMonth } from '../services/cloudPortfolio';
import { formatCurrency } from '../utils/format';
import './PremiumReportPage.css';

interface PremiumPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface PremiumReportPageProps {
  report: ReportData;
  generalReferenceMonthly?: GeneralReferenceMonth[];
  pendingCashMovements?: PremiumPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface PremiumMonth {
  key: string;
  label: string;
  shortLabel: string;
  profit: number;
  returnPct: number;
  balance: number;
  generalReturnPct?: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

const monthLookup: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11
};

const axisMoney = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
});

const compactMoney = new Intl.NumberFormat('es-ES', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const keyToDate = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, Math.max(0, month - 1), 1);
};

const compactMonth = (key: string) => {
  const date = keyToDate(key);
  const month = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(date.getFullYear()).slice(-2)}`;
};

const longMonth = (key: string) => {
  const date = keyToDate(key);
  const value = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

const niceStep = (raw: number) => {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  if (fraction <= 1) return magnitude;
  if (fraction <= 2) return magnitude * 2;
  if (fraction <= 5) return magnitude * 5;
  return magnitude * 10;
};

const buildMoneyAxis = (values: number[], tickCount = 5) => {
  const maxValue = Math.max(0, ...values);
  const step = niceStep(Math.max(1, maxValue) / Math.max(1, tickCount - 1));
  const max = Math.max(step, Math.ceil(maxValue / step) * step);
  return {
    min: 0,
    max,
    ticks: Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step).reverse()
  };
};

const pluralMonths = (count: number) => `${count} ${count === 1 ? 'mes' : 'meses'}`;

export const PremiumReportPage: React.FC<PremiumReportPageProps> = ({
  report,
  generalReferenceMonthly = [],
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<PremiumMonth[]>(() => {
    const generalByMonth = new Map(generalReferenceMonthly.map((item) => [item.month, item.returnPct * 100]));
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const validStats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance) && (
        item.endBalance !== 0 || item.profit !== 0 || item.profitPct !== 0
      ))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = validStats.length ? monthToKey(validStats[validStats.length - 1].month) : '';

    return validStats.map((item) => {
      const key = monthToKey(item.month);
      return {
        key,
        label: longMonth(key),
        shortLabel: compactMonth(key),
        profit: item.profit ?? 0,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : item.profitPct ?? 0,
        balance: item.endBalance ?? 0,
        generalReturnPct: generalByMonth.get(key),
        movements: (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key),
        breakdown: breakdownByMonth.get(key)
      };
    });
  }, [generalReferenceMonthly, report]);

  const defaultStart = Math.max(0, months.length - 10);
  const [rangeStart, setRangeStart] = useState(defaultStart);
  const [rangeEnd, setRangeEnd] = useState(Math.max(0, months.length - 1));
  const [activeMonthKey, setActiveMonthKey] = useState(months[months.length - 1]?.key ?? '');
  const [isExpanded, setIsExpanded] = useState(false);
  const wealthChartRef = useRef<HTMLDivElement>(null);
  const expandedChartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextEnd = Math.max(0, months.length - 1);
    setRangeStart(Math.max(0, months.length - 10));
    setRangeEnd(nextEnd);
    setActiveMonthKey(months[nextEnd]?.key ?? '');
  }, [months.length, report.clientId, report.createdAt]);

  useLayoutEffect(() => {
    let settledFrame = 0;
    const scrollToLatest = () => {
      const scroller = wealthChartRef.current;
      if (!scroller) return;
      scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    };
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest();
      settledFrame = window.requestAnimationFrame(scrollToLatest);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settledFrame);
    };
  }, [rangeStart, rangeEnd, months.length]);

  useLayoutEffect(() => {
    if (!isExpanded) return undefined;
    let settledFrame = 0;
    const scrollToLatest = () => {
      const scroller = expandedChartScrollRef.current;
      if (!scroller) return;
      scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    };
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest();
      settledFrame = window.requestAnimationFrame(scrollToLatest);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settledFrame);
    };
  }, [isExpanded, rangeStart, rangeEnd, months.length]);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isExpanded]);

  const selectedMonths = months.slice(rangeStart, rangeEnd + 1);
  const activeMonth = selectedMonths.find((month) => month.key === activeMonthKey)
    ?? selectedMonths[selectedMonths.length - 1]
    ?? months[months.length - 1];
  const activeMonthIndex = months.findIndex((month) => month.key === activeMonth?.key);
  const previousMonth = activeMonthIndex > 0 ? months[activeMonthIndex - 1] : undefined;
  const activeBreakdown = activeMonth?.breakdown;
  const activeIncrements = activeMonth?.movements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0) ?? 0;
  const activeDecrements = activeMonth?.movements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0) ?? 0;
  const activeOpeningBalance = activeBreakdown?.openingCapital
    ?? previousMonth?.balance
    ?? Math.max(0, (activeMonth?.balance ?? 0) - (activeMonth?.profit ?? 0) - activeIncrements + activeDecrements);

  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributions = report.incrementos + pendingIncrements;
  const visibleWithdrawals = report.decrementos + pendingDecrements;
  const netCapital = visibleContributions - visibleWithdrawals;
  const firstMovement = [...(report.movements ?? [])].sort((left, right) => left.iso.localeCompare(right.iso))[0];
  const inceptionLabel = firstMovement ? shortDate(firstMovement.iso) : months[0]?.shortLabel ?? 'Inicio';
  const latestMonth = months[months.length - 1];
  const twrPct = (report.twrYtd ?? 0) * 100;

  const setPreset = (count: number | 'all') => {
    if (!months.length) return;
    const end = months.length - 1;
    const start = count === 'all' ? 0 : Math.max(0, end - count + 1);
    setRangeStart(start);
    setRangeEnd(end);
    setActiveMonthKey(months[end].key);
    onAnalyticsEvent?.({
      type: 'premium_period_change',
      label: count === 'all' ? 'Todo el historico' : `Ultimos ${count} meses`
    });
  };

  const updateRangeStart = (value: number) => {
    const next = Math.min(value, Math.max(0, rangeEnd - 1));
    setRangeStart(next);
    if (!months.slice(next, rangeEnd + 1).some((month) => month.key === activeMonthKey)) {
      setActiveMonthKey(months[rangeEnd]?.key ?? '');
    }
  };

  const updateRangeEnd = (value: number) => {
    const next = Math.max(value, Math.min(months.length - 1, rangeStart + 1));
    setRangeEnd(next);
    if (!months.slice(rangeStart, next + 1).some((month) => month.key === activeMonthKey)) {
      setActiveMonthKey(months[next]?.key ?? '');
    }
  };

  const activateMonth = (month: PremiumMonth, source: string) => {
    setActiveMonthKey(month.key);
    onAnalyticsEvent?.({
      type: 'premium_month_focus',
      label: month.label,
      metadata: { source }
    });
  };

  const renderNavigator = (expanded = false) => {
    if (!months.length) return null;
    const width = 1000;
    const height = 92;
    const padX = 14;
    const padY = 16;
    const plotWidth = width - padX * 2;
    const plotHeight = height - padY * 2;
    const minBalance = Math.min(...months.map((month) => month.balance));
    const maxBalance = Math.max(...months.map((month) => month.balance));
    const span = Math.max(1, maxBalance - minBalance);
    const points = months.map((month, index) => ({
      x: padX + (months.length === 1 ? plotWidth / 2 : index / (months.length - 1) * plotWidth),
      y: padY + (1 - (month.balance - minBalance) / span) * plotHeight
    }));
    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
    const startX = points[rangeStart]?.x ?? padX;
    const endX = points[rangeEnd]?.x ?? width - padX;

    return (
      <div className={`premium-v2-navigator ${expanded ? 'is-expanded' : ''}`}>
        <div className="premium-v2-navigator-meta">
          <span>Histórico completo</span>
          <strong>{selectedMonths[0]?.shortLabel ?? '—'} — {selectedMonths[selectedMonths.length - 1]?.shortLabel ?? '—'}</strong>
          <small>{pluralMonths(selectedMonths.length)} seleccionados</small>
        </div>
        <div className="premium-v2-navigator-track">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`premiumNavigatorArea${expanded ? 'Expanded' : ''}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(11, 104, 112, 0.26)" />
                <stop offset="100%" stopColor="rgba(11, 104, 112, 0.02)" />
              </linearGradient>
            </defs>
            <rect x={padX} y={padY} width={Math.max(0, startX - padX)} height={plotHeight} className="premium-v2-navigator-mask" />
            <rect x={endX} y={padY} width={Math.max(0, width - padX - endX)} height={plotHeight} className="premium-v2-navigator-mask" />
            {points.length > 1 ? (
              <path
                d={`M ${points[0].x},${height - padY} L ${line} L ${points[points.length - 1].x},${height - padY} Z`}
                fill={`url(#premiumNavigatorArea${expanded ? 'Expanded' : ''})`}
              />
            ) : null}
            <polyline points={line} className="premium-v2-navigator-line" />
            <line x1={startX} y1={7} x2={startX} y2={height - 7} className="premium-v2-navigator-handle-line" />
            <line x1={endX} y1={7} x2={endX} y2={height - 7} className="premium-v2-navigator-handle-line" />
          </svg>
          <div className="premium-v2-range-inputs">
            <input
              type="range"
              min={0}
              max={Math.max(0, months.length - 1)}
              value={rangeStart}
              aria-label="Inicio del periodo"
              onChange={(event) => updateRangeStart(Number(event.target.value))}
            />
            <input
              type="range"
              min={0}
              max={Math.max(0, months.length - 1)}
              value={rangeEnd}
              aria-label="Final del periodo"
              onChange={(event) => updateRangeEnd(Number(event.target.value))}
            />
          </div>
        </div>
        <div className="premium-v2-navigator-labels" aria-hidden="true">
          <span>{months[0]?.shortLabel}</span>
          <span>{months[Math.floor((months.length - 1) / 2)]?.shortLabel}</span>
          <span>{months[months.length - 1]?.shortLabel}</span>
        </div>
      </div>
    );
  };

  const renderWealthChart = (expanded = false) => {
    const data = selectedMonths;
    if (!data.length) {
      return <div className="premium-v2-empty">No hay cierres mensuales disponibles para este periodo.</div>;
    }
    const width = expanded ? 1600 : 1200;
    const height = expanded ? 640 : 470;
    const pads = expanded
      ? { left: 118, right: 48, top: 52, bottom: 58 }
      : { left: 92, right: 30, top: 42, bottom: 54 };
    const plotWidth = width - pads.left - pads.right;
    const plotHeight = height - pads.top - pads.bottom;
    const plotBottom = pads.top + plotHeight;
    const axis = buildMoneyAxis(data.map((month) => month.balance), 5);
    const points = data.map((month, index) => ({
      ...month,
      x: pads.left + (data.length === 1 ? plotWidth / 2 : index / (data.length - 1) * plotWidth),
      y: pads.top + (1 - month.balance / Math.max(1, axis.max)) * plotHeight,
      index
    }));
    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
    const area = points.length > 1
      ? `M ${points[0].x},${plotBottom} L ${line} L ${points[points.length - 1].x},${plotBottom} Z`
      : '';
    const activePoint = points.find((point) => point.key === activeMonth?.key) ?? points[points.length - 1];
    const labelStep = data.length <= 12 ? 1 : Math.ceil(data.length / 8);

    return (
      <div ref={expanded ? undefined : wealthChartRef} className={`premium-v2-wealth-chart ${expanded ? 'is-expanded' : ''}`}>
        <div className="premium-v2-chart-inspector" aria-live="polite">
          <span>{activePoint?.label}</span>
          <strong>{formatCurrency(activePoint?.balance ?? 0)}</strong>
          <small>
            <b className={(activePoint?.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}>{signedPercent(activePoint?.returnPct ?? 0)}</b>
            <i aria-hidden="true" />
            {signedMoney(activePoint?.profit ?? 0)}
          </small>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Evolución mensual del patrimonio">
          <defs>
            <linearGradient id={`premiumWealthArea${expanded ? 'Expanded' : ''}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(12, 117, 124, 0.31)" />
              <stop offset="62%" stopColor="rgba(34, 162, 166, 0.10)" />
              <stop offset="100%" stopColor="rgba(34, 162, 166, 0.01)" />
            </linearGradient>
            <filter id={`premiumPointShadow${expanded ? 'Expanded' : ''}`} x="-100%" y="-100%" width="300%" height="300%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#062e3f" floodOpacity="0.22" />
            </filter>
          </defs>
          {axis.ticks.map((tick) => {
            const y = pads.top + (1 - tick / Math.max(1, axis.max)) * plotHeight;
            return (
              <g key={tick}>
                <line x1={pads.left} y1={y} x2={width - pads.right} y2={y} className="premium-v2-grid" />
                <text x={pads.left - 16} y={y + 5} textAnchor="end" className="premium-v2-axis-label">{axisMoney.format(tick)}</text>
              </g>
            );
          })}
          {area ? <path d={area} className="premium-v2-area" fill={`url(#premiumWealthArea${expanded ? 'Expanded' : ''})`} /> : null}
          {activePoint ? (
            <line x1={activePoint.x} y1={pads.top} x2={activePoint.x} y2={plotBottom} className="premium-v2-crosshair" />
          ) : null}
          {points.length > 1 ? <polyline points={line} className="premium-v2-line" /> : null}
          {points.map((point) => {
            const isActive = point.key === activePoint?.key;
            const showValue = data.length <= 12 || point.index === 0 || point.index === points.length - 1 || isActive;
            const labelY = Math.max(pads.top + 18, Math.min(plotBottom - 16, point.y + (point.index % 2 === 0 ? -26 : 31)));
            const labelHalfWidth = expanded ? 62 : 51;
            const labelX = Math.max(
              pads.left + labelHalfWidth,
              Math.min(point.x, width - pads.right - labelHalfWidth)
            );
            const hasIncrement = point.movements.some((movement) => movement.type === 'increment');
            const hasDecrement = point.movements.some((movement) => movement.type === 'decrement');
            return (
              <g
                key={point.key}
                className={`premium-v2-point-group ${isActive ? 'is-active' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${point.label}: ${formatCurrency(point.balance)}`}
                onMouseEnter={() => activateMonth(point, 'patrimony')}
                onFocus={() => activateMonth(point, 'patrimony')}
                onClick={() => activateMonth(point, 'patrimony')}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  activateMonth(point, 'patrimony');
                }}
              >
                <circle cx={point.x} cy={point.y} r={expanded ? 8 : 6.5} className="premium-v2-point-ring" filter={`url(#premiumPointShadow${expanded ? 'Expanded' : ''})`} />
                <circle cx={point.x} cy={point.y} r={expanded ? 4.4 : 3.7} className="premium-v2-point-core" />
                <circle cx={point.x} cy={point.y} r={expanded ? 28 : 22} fill="transparent" />
                {showValue ? (
                  <g className="premium-v2-value-label" pointerEvents="none">
                    <rect x={labelX - labelHalfWidth} y={labelY - (expanded ? 17 : 14)} width={labelHalfWidth * 2} height={expanded ? 27 : 23} rx={expanded ? 10 : 8} />
                    <text x={labelX} y={labelY} textAnchor="middle">{axisMoney.format(point.balance)}</text>
                  </g>
                ) : null}
                {hasIncrement ? (
                  <g className="premium-v2-flow-marker is-increment" transform={`translate(${point.x - (hasDecrement ? 12 : 0)} ${plotBottom + 22})`}>
                    <circle r="10" /><text textAnchor="middle" y="4">+</text>
                  </g>
                ) : null}
                {hasDecrement ? (
                  <g className="premium-v2-flow-marker is-decrement" transform={`translate(${point.x + (hasIncrement ? 12 : 0)} ${plotBottom + 22})`}>
                    <circle r="10" /><text textAnchor="middle" y="3">−</text>
                  </g>
                ) : null}
                {(point.index % labelStep === 0 || point.index === points.length - 1) ? (
                  <text x={point.x} y={height - 10} textAnchor="middle" className="premium-v2-x-label">{point.shortLabel}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="premium-v2-flow-legend">
          <span><i className="is-increment">+</i>Aportación</span>
          <span><i className="is-decrement">−</i>Retirada</span>
          <small>Selecciona cualquier punto para analizar el mes</small>
        </div>
      </div>
    );
  };

  const renderMetricChart = (type: 'return' | 'profit') => {
    const values = selectedMonths.map((month) => type === 'return' ? month.returnPct : month.profit);
    const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
    const hasNegative = values.some((value) => value < 0);
    const hasGeneral = type === 'return' && selectedMonths.some((month) => month.generalReturnPct !== undefined);
    return (
      <div className={`premium-v2-bars ${hasNegative ? 'has-negative' : ''}`} style={{ '--month-count': Math.max(1, selectedMonths.length) } as React.CSSProperties}>
        <div className="premium-v2-zero-line"><span>0</span></div>
        <div className="premium-v2-bars-grid">
          {selectedMonths.map((month) => {
            const value = type === 'return' ? month.returnPct : month.profit;
            const size = Math.max(4, Math.min(hasNegative ? 43 : 86, Math.abs(value) / maxAbs * (hasNegative ? 43 : 86)));
            const isActive = month.key === activeMonth?.key;
            const generalValue = month.generalReturnPct;
            const generalOffset = generalValue === undefined ? 0 : Math.min(86, Math.abs(generalValue) / maxAbs * 86);
            return (
              <button
                type="button"
                key={`${type}-${month.key}`}
                className={`premium-v2-bar-column ${isActive ? 'is-active' : ''}`}
                onMouseEnter={() => activateMonth(month, type)}
                onFocus={() => activateMonth(month, type)}
                onClick={() => activateMonth(month, type)}
                aria-label={`${month.label}: ${type === 'return' ? signedPercent(value) : signedMoney(value)}`}
              >
                <span className={`premium-v2-bar-number ${value >= 0 ? 'positive' : 'negative'}`}>
                  {type === 'return' ? signedPercent(value) : axisMoney.format(value)}
                </span>
                <span className="premium-v2-bar-track">
                  <span
                    className={`premium-v2-bar-fill ${value >= 0 ? 'positive' : 'negative'}`}
                    style={{ '--bar-size': `${size}%` } as React.CSSProperties}
                  />
                  {hasGeneral && generalValue !== undefined ? (
                    <span className="premium-v2-general-marker" style={{ '--general-offset': `${generalOffset}%` } as React.CSSProperties} />
                  ) : null}
                </span>
                <span className="premium-v2-bar-month">{month.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const activeContributions = activeBreakdown?.contributions ?? [];
  const activeWithdrawals = activeBreakdown?.withdrawals ?? [];
  const rangeProfit = selectedMonths.reduce((sum, month) => sum + month.profit, 0);
  const rangeReturn = selectedMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1;
  const rangeStartBalance = selectedMonths.length
    ? Math.max(0, selectedMonths[0].balance - selectedMonths[0].profit - selectedMonths[0].movements.reduce(
        (sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount),
        0
      ))
    : 0;
  const rangeEndBalance = selectedMonths[selectedMonths.length - 1]?.balance ?? 0;

  const expandedChart = isExpanded && typeof document !== 'undefined'
    ? createPortal(
        <div className="premium-v2-overlay" role="dialog" aria-modal="true" aria-label="Evolución patrimonial ampliada">
          <div className="premium-v2-overlay-shell">
            <header>
              <div>
                <span>Análisis patrimonial</span>
                <h2>Evolución de la cartera</h2>
                <p>{selectedMonths[0]?.label} — {selectedMonths[selectedMonths.length - 1]?.label}</p>
              </div>
              <button type="button" onClick={() => setIsExpanded(false)}>Cerrar <kbd>Esc</kbd></button>
            </header>
            <div ref={expandedChartScrollRef} className="premium-v2-overlay-chart">{renderWealthChart(true)}</div>
            {renderNavigator(true)}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="premium-v2-report" ref={rootRef}>
      {expandedChart}
      <header className="premium-v2-topbar">
        <div className="premium-v2-wordmark"><i />JIGSA <span>Private Office</span></div>
        <div className="premium-v2-topbar-meta">
          <span><small>Cuenta</small><strong>{report.clientCode}</strong></span>
          <span><small>Última publicación</small><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></span>
        </div>
      </header>

      <div className="premium-v2-opening">
        <header className="premium-v2-hero">
          <div className="premium-v2-hero-copy">
            <span className="premium-v2-eyebrow"><i /> Posición consolidada</span>
            <h1>Patrimonio<br />en perspectiva.</h1>
            <p>Una lectura precisa de la evolución de tu capital, sus resultados y cada movimiento.</p>
            <div className="premium-v2-hero-meta">
              <span><small>Desde</small><strong>{inceptionLabel}</strong></span>
              <span><small>Mes de referencia</small><strong>{latestMonth?.label ?? 'Último cierre'}</strong></span>
            </div>
          </div>
          <div className="premium-v2-hero-balance">
            <span>Saldo actual</span>
            <strong>{formatCurrency(visibleBalance)}</strong>
            <small className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedMoney(report.beneficioTotal)} de beneficio acumulado</small>
            {pendingCashMovements.length ? <em>Incluye movimientos posteriores al último cierre</em> : null}
          </div>
        </header>

        <section className="premium-v2-primary-kpis" aria-label="Indicadores principales">
          <article>
            <span>Rentabilidad · {latestMonth?.label ?? 'Último mes'}</span>
            <strong className={report.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative'}>{signedPercent(report.rentabilidadUltimoMes)}</strong>
            <p>TWR del último cierre</p>
          </article>
          <article>
            <span>Beneficio · {latestMonth?.label ?? 'Último mes'}</span>
            <strong className={report.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}>{signedMoney(report.beneficioUltimoMes)}</strong>
            <p>Resultado del último cierre</p>
          </article>
          <article>
            <span>TWR acumulado</span>
            <strong className={twrPct >= 0 ? 'positive' : 'negative'}>{signedPercent(twrPct)}</strong>
            <p>Desde {inceptionLabel}</p>
          </article>
        </section>
      </div>

      <section className="premium-v2-secondary-kpis" aria-label="Capital y resultados acumulados">
        <article><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedMoney(report.beneficioTotal)}</strong><small>Desde {inceptionLabel}</small></article>
        <article><span>Capital aportado</span><strong>{formatCurrency(visibleContributions)}</strong><small>{report.movements.filter((movement) => movement.type === 'increment').length + pendingCashMovements.filter((movement) => movement.type === 'increment').length} aportaciones</small></article>
        <article><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawals)}</strong><small>{report.movements.filter((movement) => movement.type === 'decrement').length + pendingCashMovements.filter((movement) => movement.type === 'decrement').length} retiradas</small></article>
        <article><span>Capital neto aportado</span><strong>{formatCurrency(netCapital)}</strong><small>Aportaciones menos retiradas</small></article>
        <article><span>Rentabilidad total</span><strong className={report.rentabilidad >= 0 ? 'positive' : 'negative'}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}</strong><small>Beneficio sobre capital neto</small></article>
      </section>

      {pendingCashMovements.length ? (
        <section className="premium-v2-capital-update">
          <div>
            <span>Capital actualizado</span>
            <strong>Movimientos posteriores al último cierre</strong>
            <p>El saldo actual ya incorpora estos movimientos. Su rendimiento se reflejará en el próximo cierre publicado.</p>
          </div>
          <div className="premium-v2-capital-update-list">
            {pendingCashMovements.map((movement, index) => (
              <span key={`${movement.iso}-${movement.type}-${index}`}>
                <small>{shortDate(movement.iso)}</small>
                <b>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b>
                <strong className={movement.type === 'increment' ? 'positive' : 'negative'}>
                  {movement.type === 'increment' ? '+' : '-'}{formatCurrency(movement.amount)}
                </strong>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="premium-v2-analysis-grid">
        <section className="premium-v2-period-panel">
          <div className="premium-v2-section-heading">
            <div>
              <span>Ventana temporal</span>
              <h2>Control de periodo</h2>
              <p>Elige el tramo que quieres estudiar. Toda la página se sincroniza.</p>
            </div>
            <div className="premium-v2-presets" role="group" aria-label="Periodos rápidos">
              <button type="button" onClick={() => setPreset(3)}>3M</button>
              <button type="button" onClick={() => setPreset(6)}>6M</button>
              <button type="button" onClick={() => setPreset(12)}>12M</button>
              <button type="button" onClick={() => setPreset('all')}>Todo</button>
            </div>
          </div>
          {renderNavigator()}
          <div className="premium-v2-period-summary">
            <span><small>Inicio</small><strong>{formatCurrency(rangeStartBalance)}</strong></span>
            <span><small>Beneficio</small><strong className={rangeProfit >= 0 ? 'positive' : 'negative'}>{signedMoney(rangeProfit)}</strong></span>
            <span><small>TWR</small><strong className={rangeReturn >= 0 ? 'positive' : 'negative'}>{signedPercent(rangeReturn * 100)}</strong></span>
            <span><small>Cierre</small><strong>{formatCurrency(rangeEndBalance)}</strong></span>
          </div>
        </section>

        <section className="premium-v2-panel premium-v2-wealth-panel">
          <div className="premium-v2-section-heading">
            <div>
              <span>Trayectoria patrimonial</span>
              <h2>Evolución de la cartera</h2>
              <p>Saldo al cierre de cada mes y movimientos registrados.</p>
            </div>
            <button
              type="button"
              className="premium-v2-expand"
              onClick={() => {
                setIsExpanded(true);
                onAnalyticsEvent?.({ type: 'chart_expand_request', label: 'Evolucion patrimonio premium' });
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>
              Pantalla completa
            </button>
          </div>
          {renderWealthChart()}
        </section>
      </div>

      <div className="premium-v2-chart-pair">
        <section className="premium-v2-panel">
          <div className="premium-v2-section-heading is-compact">
            <div><span>Rendimiento</span><h2>Rentabilidad mensual</h2><p>TWR de cada cierre seleccionado.</p></div>
            <strong className={(activeMonth?.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}>{signedPercent(activeMonth?.returnPct ?? 0)}</strong>
          </div>
          {renderMetricChart('return')}
          {selectedMonths.some((month) => month.generalReturnPct !== undefined) ? (
            <div className="premium-v2-general-legend"><i /> Referencia general de la estrategia</div>
          ) : null}
        </section>
        <section className="premium-v2-panel">
          <div className="premium-v2-section-heading is-compact">
            <div><span>Resultado</span><h2>Beneficio mensual</h2><p>Resultado en euros de cada cierre.</p></div>
            <strong className={(activeMonth?.profit ?? 0) >= 0 ? 'positive' : 'negative'}>{signedMoney(activeMonth?.profit ?? 0)}</strong>
          </div>
          {renderMetricChart('profit')}
        </section>
      </div>

      {activeMonth ? (
        <section className="premium-v2-month-focus" aria-live="polite">
          <header>
            <div>
              <span>Mes analizado</span>
              <h2>{activeMonth.label}</h2>
            </div>
            <div className="premium-v2-month-focus-result">
              <span>Resultado del mes</span>
              <strong className={activeMonth.profit >= 0 ? 'positive' : 'negative'}>{signedMoney(activeMonth.profit)}</strong>
              <small className={activeMonth.returnPct >= 0 ? 'positive' : 'negative'}>{signedPercent(activeMonth.returnPct)}</small>
            </div>
          </header>
          <div className="premium-v2-month-ledger">
            <article><span>Saldo inicial</span><strong>{formatCurrency(activeOpeningBalance)}</strong><small>Capital al comenzar el mes</small></article>
            <article><span>Aportaciones</span><strong className="positive">{activeIncrements ? `+${formatCurrency(activeIncrements)}` : formatCurrency(0)}</strong><small>Capital incorporado</small></article>
            <article><span>Retiradas</span><strong className={activeDecrements ? 'negative' : ''}>{activeDecrements ? `-${formatCurrency(activeDecrements)}` : formatCurrency(0)}</strong><small>Capital retirado</small></article>
            <article><span>Beneficio</span><strong className={activeMonth.profit >= 0 ? 'positive' : 'negative'}>{signedMoney(activeMonth.profit)}</strong><small>Resultado generado</small></article>
            <article className="is-total"><span>Saldo final</span><strong>{formatCurrency(activeMonth.balance)}</strong><small>Cierre mensual</small></article>
          </div>

          {activeBreakdown ? (
            <div className="premium-v2-breakdown">
              <div className="premium-v2-breakdown-head">
                <div><span>Composición del resultado</span><strong>Cada tramo de capital, con su rentabilidad efectiva.</strong></div>
                <small>{activeContributions.length + activeWithdrawals.length} movimientos con detalle</small>
              </div>
              <div className="premium-v2-breakdown-rows">
                <div>
                  <span><i className="is-opening" />Posición inicial del mes</span>
                  <strong>{formatCurrency(activeBreakdown.initialCapital)}</strong>
                  <b className={activeBreakdown.initialReturnPct >= 0 ? 'positive' : 'negative'}>{signedPercent(activeBreakdown.initialReturnPct * 100)}</b>
                  <em className={activeBreakdown.initialProfit >= 0 ? 'positive' : 'negative'}>{signedMoney(activeBreakdown.initialProfit)}</em>
                </div>
                {activeContributions.map((contribution) => (
                  <div key={`${contribution.iso}-${contribution.amount}`}>
                    <span><i className="is-increment" />Aportación · {shortDate(contribution.iso)}</span>
                    <strong>{formatCurrency(contribution.amount)}</strong>
                    <b className={contribution.returnPct >= 0 ? 'positive' : 'negative'}>{signedPercent(contribution.returnPct * 100)}</b>
                    <em className={contribution.profit >= 0 ? 'positive' : 'negative'}>{signedMoney(contribution.profit)}</em>
                  </div>
                ))}
                {activeWithdrawals.map((withdrawal) => (
                  <div key={`${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
                    <span><i className="is-decrement" />Capital retirado · {shortDate(withdrawal.iso)}</span>
                    <strong>{formatCurrency(withdrawal.amount)}</strong>
                    <b className={(withdrawal.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}>{withdrawal.returnPct === undefined ? '—' : signedPercent(withdrawal.returnPct * 100)}</b>
                    <em className={withdrawal.profit >= 0 ? 'positive' : 'negative'}>{signedMoney(withdrawal.profit)}</em>
                  </div>
                ))}
              </div>
              <div className="premium-v2-breakdown-total">
                <span>Beneficio explicado</span>
                <strong className={activeBreakdown.totalProfit >= 0 ? 'positive' : 'negative'}>{signedMoney(activeBreakdown.totalProfit)}</strong>
              </div>
            </div>
          ) : (
            <div className="premium-v2-no-breakdown">
              <span>Lectura del mes</span>
              <p>El resultado corresponde al capital mantenido durante este periodo. No existen tramos adicionales de aportación o retirada con una rentabilidad diferenciada.</p>
            </div>
          )}
        </section>
      ) : null}

      <footer className="premium-v2-footer">
        <div><span>JIGSA</span><small>Portfolio intelligence</small></div>
        <p>Información elaborada a partir de los datos publicados de la cuenta. Los movimientos de capital no alteran el cálculo TWR.</p>
        <strong>{report.clientCode}</strong>
      </footer>
    </div>
  );
};
