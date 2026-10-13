import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './MeridianReportPage.css';

interface MeridianPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface MeridianReportPageProps {
  report: ReportData;
  pendingCashMovements?: MeridianPendingMovement[];
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

interface MeridianMonth {
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

interface MeridianTooltip {
  month: MeridianMonth;
  left: number;
  top: number;
}

type MeridianPeriod = '3m' | '6m' | '12m' | 'all' | 'custom';

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
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (absolute >= 100_000) return `${Math.round(value / 1000).toLocaleString('es-ES')} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const toneClass = (value: number) => value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral';

export const MeridianReportPage: React.FC<MeridianReportPageProps> = ({
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
  const visibleNetCapital = visibleContributed - visibleWithdrawn;

  const months = useMemo<MeridianMonth[]>(() => {
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
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
  const [period, setPeriod] = useState<MeridianPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [showIndex, setShowIndex] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<MeridianTooltip | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const staffScrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setShowIndex(false);
    setExpandedKey(null);
    setTooltip(null);
  }, [latestKey, months, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey)
    ?? visibleMonths[visibleMonths.length - 1];
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodLabel = visibleMonths.length
    ? `${visibleMonths[0].shortLabel} — ${visibleMonths[visibleMonths.length - 1].shortLabel}`
    : 'Sin cierres';

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusedKey)) {
      setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
    }
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  useEffect(() => {
    const scroll = staffScrollRef.current;
    if (!scroll) return;
    scroll.scrollLeft = scroll.scrollWidth;
  }, [period, visibleMonths.length]);

  const selectPeriod = (nextPeriod: MeridianPeriod) => {
    setPeriod(nextPeriod);
    setTooltip(null);
  };

  const focusMonth = useCallback((month: MeridianMonth) => {
    setFocusedKey(month.key);
  }, []);

  const toggleMonthDetail = useCallback((month: MeridianMonth) => {
    setFocusedKey(month.key);
    if (!month.breakdown) return;
    setExpandedKey((current) => current === month.key ? null : month.key);
  }, []);

  const moveFocus = useCallback((direction: -1 | 1) => {
    if (!visibleMonths.length) return;
    const currentIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === focusedMonth?.key));
    const nextIndex = Math.max(0, Math.min(visibleMonths.length - 1, currentIndex + direction));
    setFocusedKey(visibleMonths[nextIndex].key);
  }, [focusedMonth?.key, visibleMonths]);

  const openExpanded = () => {
    setIsExpanded(true);
    onAnalyticsEvent?.({ type: 'chart_expand_request', label: 'MERIDIANO carta patrimonial' });
  };

  const closeExpanded = useCallback(() => {
    setIsExpanded(false);
    if (dialogRef.current?.open) dialogRef.current.close();
    window.setTimeout(() => expandButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isExpanded && !dialog.open) dialog.showModal();
    if (!isExpanded && dialog.open) dialog.close();
  }, [isExpanded]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      closeExpanded();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [closeExpanded]);

  const renderStaff = (expanded = false) => {
    const chartMonths = visibleMonths;
    const count = chartMonths.length;
    const chartWidth = Math.max(expanded ? 1320 : 1180, count * 82 + 170 + (pending.length ? 82 : 0));
    const plotLeft = 132;
    const plotRight = pending.length ? 92 : 36;
    const plotWidth = chartWidth - plotLeft - plotRight;
    const step = count > 1 ? plotWidth / (count - 1) : 0;
    const pointX = (index: number) => count === 1 ? plotLeft + plotWidth / 2 : plotLeft + index * step;
    const bandTops = [48, 136, 224, 312, 400];
    const bandHeight = 72;
    const maxBalance = Math.max(...chartMonths.map((month) => month.balance), 1) * 1.08;
    const maxProfit = Math.max(...chartMonths.map((month) => Math.abs(month.profit)), 1);
    const maxReturn = Math.max(...chartMonths.map((month) => Math.abs(month.returnPct)), 1);
    const maxIncrement = Math.max(...chartMonths.map((month) => month.increments), 1);
    const maxDecrement = Math.max(...chartMonths.map((month) => month.decrements), 1);
    const balanceY = (value: number) => bandTops[0] + bandHeight - (Math.max(0, value) / maxBalance) * 64;
    const linePath = chartMonths.map((month, index) => `${index ? 'L' : 'M'} ${pointX(index)} ${balanceY(month.balance)}`).join(' ');
    const barWidth = Math.max(8, Math.min(18, (step || 60) * 0.42));
    const columnWidth = Math.max(48, step || 70);

    const showTooltip = (event: React.MouseEvent<SVGGElement>, month: MeridianMonth) => {
      setTooltip({
        month,
        left: Math.min(window.innerWidth - 290, Math.max(12, event.clientX + 14)),
        top: Math.min(window.innerHeight - 190, Math.max(12, event.clientY + 14))
      });
    };

    return (
      <svg
        className={`meridian-staff-svg${expanded ? ' is-expanded' : ''}`}
        viewBox={`0 0 ${chartWidth} 520`}
        width={chartWidth}
        height="520"
        role="img"
        aria-labelledby={`meridian-chart-title${expanded ? '-expanded' : ''}`}
      >
        <title id={`meridian-chart-title${expanded ? '-expanded' : ''}`}>
          Evolución mensual del saldo, beneficio, rentabilidad, aportaciones y retiradas
        </title>
        {bandTops.map((top, index) => (
          <g key={top} className={`meridian-band meridian-band-${index + 1}`}>
            <rect x="0" y={top - 8} width={chartWidth} height="88" className={index % 2 ? 'meridian-band-even' : 'meridian-band-odd'} />
            <line x1={plotLeft} y1={top + bandHeight} x2={chartWidth - 22} y2={top + bandHeight} className="meridian-axis-line" />
          </g>
        ))}

        {['Saldo', 'Beneficio', 'Rentabilidad', 'Aportaciones', 'Retiradas'].map((label, index) => (
          <text key={label} x="16" y={bandTops[index] + 18} className="meridian-band-label">{label}</text>
        ))}
        <text x="16" y={bandTops[0] + 63} className="meridian-axis-value">0 €</text>
        <text x="16" y={bandTops[0] + 34} className="meridian-axis-value">{compactMoney(maxBalance / 2)}</text>
        <text x="16" y={bandTops[0] + 7} className="meridian-axis-value">{compactMoney(maxBalance)}</text>

        {chartMonths.map((month, index) => {
          const x = pointX(index);
          const isFocused = month.key === focusedMonth?.key;
          return (
            <g
              key={month.key}
              className={`meridian-month-column${isFocused ? ' is-focused' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${month.label}. Saldo final ${formatCurrency(month.balance)}. Beneficio ${signedMoney(month.profit)}. Rentabilidad ${signedPercent(month.returnPct)}.`}
              onClick={() => toggleMonthDetail(month)}
              onMouseEnter={(event) => showTooltip(event, month)}
              onMouseMove={(event) => showTooltip(event, month)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => focusMonth(month)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1); }
                if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(1); }
                if (event.key === 'Enter') { event.preventDefault(); toggleMonthDetail(month); }
                if (event.key === 'Escape') setExpandedKey(null);
              }}
            >
              <rect x={x - columnWidth / 2} y="36" width={columnWidth} height="452" className="meridian-column-hit" />
              {isFocused ? <line x1={x - columnWidth / 2} y1="36" x2={x + columnWidth / 2} y2="36" className="meridian-focus-rule" /> : null}
              <line x1={x} y1="40" x2={x} y2="480" className="meridian-month-guide" />

              {month.profit !== 0 ? (
                <rect
                  x={x - barWidth / 2}
                  y={month.profit > 0 ? bandTops[1] + 36 - (Math.abs(month.profit) / maxProfit) * 31 : bandTops[1] + 36}
                  width={barWidth}
                  height={(Math.abs(month.profit) / maxProfit) * 31}
                  rx="1"
                  className={month.profit > 0 ? 'meridian-positive-fill' : 'meridian-negative-fill'}
                />
              ) : null}
              <line x1={x - 22} y1={bandTops[1] + 36} x2={x + 22} y2={bandTops[1] + 36} className="meridian-zero-line" />

              {month.returnPct !== 0 ? (
                <rect
                  x={x - barWidth / 2}
                  y={month.returnPct > 0 ? bandTops[2] + 36 - (Math.abs(month.returnPct) / maxReturn) * 31 : bandTops[2] + 36}
                  width={barWidth}
                  height={(Math.abs(month.returnPct) / maxReturn) * 31}
                  rx="1"
                  className={month.returnPct > 0 ? 'meridian-positive-fill' : 'meridian-negative-fill'}
                />
              ) : null}
              <line x1={x - 22} y1={bandTops[2] + 36} x2={x + 22} y2={bandTops[2] + 36} className="meridian-zero-line" />
              {isFocused ? <text x={x} y={bandTops[2] + 13} textAnchor="middle" className={toneClass(month.returnPct)}>{signedPercent(month.returnPct)}</text> : null}

              {month.increments > 0 ? (
                <rect x={x - barWidth / 2} y={bandTops[3] + 68 - (month.increments / maxIncrement) * 58} width={barWidth} height={(month.increments / maxIncrement) * 58} rx="1" className="meridian-increment-fill" />
              ) : null}
              {month.decrements > 0 ? (
                <rect x={x - barWidth / 2} y={bandTops[4] + 68 - (month.decrements / maxDecrement) * 58} width={barWidth} height={(month.decrements / maxDecrement) * 58} rx="1" className="meridian-decrement-fill" />
              ) : null}

              {month.increments > 0 ? <path d={`M ${x - 10} ${bandTops[0] + 63} l 5 -8 l 5 8 z`} className="meridian-increment-fill" /> : null}
              {month.decrements > 0 ? <path d={`M ${x + 4} ${bandTops[0] + 55} l 5 8 l 5 -8 z`} className="meridian-decrement-fill" /> : null}
              <text x={x} y="508" textAnchor="middle" className="meridian-month-name">{month.shortLabel}</text>
            </g>
          );
        })}

        {linePath ? <path d={linePath} className="meridian-balance-line" pathLength="1" /> : null}
        {chartMonths.map((month, index) => (
          <circle key={`balance-${month.key}`} cx={pointX(index)} cy={balanceY(month.balance)} r={month.key === focusedMonth?.key ? 4.5 : 3} className="meridian-balance-point" />
        ))}

        {pending.length ? (
          <g className="meridian-transit-column">
            <rect x={chartWidth - 78} y="36" width="64" height="452" />
            <line x1={chartWidth - 78} y1="36" x2={chartWidth - 78} y2="488" />
            <text x={chartWidth - 46} y="508" textAnchor="middle">En tránsito</text>
          </g>
        ) : null}

        {!count ? <text x={chartWidth / 2} y="260" textAnchor="middle" className="meridian-empty-label">Sin cierres publicados</text> : null}
        {count === 1 ? <text x={chartWidth / 2} y="126" textAnchor="middle" className="meridian-empty-label">Un solo cierre publicado</text> : null}
      </svg>
    );
  };

  const projectedPending = pending.map((movement, index) => {
    const previous = pending.slice(0, index).reduce((balance, item) => balance + (item.type === 'increment' ? item.amount : -item.amount), report.saldo);
    return {
      ...movement,
      projectedBalance: previous + (movement.type === 'increment' ? movement.amount : -movement.amount)
    };
  });

  const twrPct = (report.twrYtd ?? 0) * 100;
  const hasTotalReturn = report.rentabilidadDisponible !== false;

  return (
    <main className="meridian-report" ref={rootRef}>
      <header className="meridian-mast">
        <div>
          <p className="meridian-kicker">CARTA PATRIMONIAL · GROK 4.7</p>
          <h1>Meridiano</h1>
          <p>La lectura completa de su cartera, en una sola superficie.</p>
        </div>
        <div className="meridian-mast-actions">
          <span>{report.clientCode}</span>
          <button type="button" onClick={onDownload}>Descargar PDF</button>
        </div>
      </header>

      <section className="meridian-identity" aria-label="Resumen de cartera completa">
        <div className="meridian-main-balance">
          <span>Saldo disponible</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small>Cartera completa{pending.length ? ' · incluye capital en tránsito' : ''}</small>
        </div>
        <div className="meridian-identity-metrics">
          <div>
            <span>Beneficio del último mes</span>
            <strong className={toneClass(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong>
          </div>
          <div>
            <span>Rentabilidad del último mes</span>
            <strong className={toneClass(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong>
          </div>
          <div>
            <span>Beneficio acumulado</span>
            <strong className={toneClass(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong>
          </div>
          <div title="Mide el rendimiento de la gestión. No depende del momento en que usted aportó o retiró.">
            <span>TWR acumulado</span>
            <strong>{signedPercent(twrPct)}</strong>
          </div>
          <div title="Beneficio acumulado dividido entre el capital neto aportado.">
            <span>Rentabilidad total</span>
            <strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong>
          </div>
        </div>
      </section>

      {pending.length ? (
        <section className="meridian-pending" aria-labelledby="meridian-pending-title">
          <div>
            <span>EN TRÁNSITO</span>
            <h2 id="meridian-pending-title">Actualización de capital</h2>
            <p>Movimientos posteriores al último cierre publicado. Se incorporarán al rendimiento cuando se publique el próximo cierre.</p>
          </div>
          <div className="meridian-pending-list">
            {projectedPending.map((movement, index) => (
              <div key={`${movement.iso}-${movement.type}-${index}`}>
                <time>{formatDate(movement.iso)}</time>
                <span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span>
                <strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>
                  {movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}
                </strong>
                <small>Saldo proyectado {formatCurrency(movement.projectedBalance)}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="meridian-chart-section" aria-labelledby="meridian-chart-heading">
        <div className="meridian-chart-head">
          <div>
            <span>LECTURA POR BANDAS</span>
            <h2 id="meridian-chart-heading">Carta mensual</h2>
            <p>{periodLabel} · cada magnitud conserva su propia escala.</p>
          </div>
          <div className="meridian-chart-controls">
            <div className="meridian-periods" aria-label="Periodo del informe">
              {(['3m', '6m', '12m', 'all'] as const).map((option) => (
                <button key={option} type="button" className={period === option ? 'is-active' : ''} aria-pressed={period === option} onClick={() => selectPeriod(option)}>
                  {option === 'all' ? 'Todo' : option.toUpperCase()}
                </button>
              ))}
              <button type="button" className={period === 'custom' ? 'is-active' : ''} aria-pressed={period === 'custom'} onClick={() => selectPeriod('custom')}>Personalizado</button>
            </div>
            <button ref={expandButtonRef} type="button" className="meridian-expand" onClick={openExpanded}>Ampliar</button>
          </div>
        </div>
        {period === 'custom' ? (
          <div className="meridian-custom-period">
            <label>Desde<select value={customStart} onChange={(event) => setCustomStart(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label>
            <label>Hasta<select value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label>
          </div>
        ) : null}
        <div className="meridian-staff-scroll" ref={staffScrollRef} tabIndex={0}>
          {renderStaff()}
        </div>
        <div className="meridian-live sr-only" aria-live="polite">
          {focusedMonth ? `${focusedMonth.label}. Beneficio ${signedMoney(focusedMonth.profit)}. Rentabilidad ${signedPercent(focusedMonth.returnPct)}.` : 'Sin cierres publicados'}
        </div>
      </section>

      <section className="meridian-legend" aria-label="Capital y leyenda">
        <div><i className="is-increment" /><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div>
        <div><i className="is-decrement" /><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div>
        <div className="meridian-legend-note"><i className="is-profit" /><span>Beneficio / rentabilidad positivos</span></div>
        <div className="meridian-legend-note"><i className="is-loss" /><span>Beneficio / rentabilidad negativos</span></div>
      </section>

      {focusedMonth ? (
        <section className="meridian-month-panel" aria-labelledby="meridian-month-title">
          <header>
            <div><span>MES ENFOCADO</span><h2 id="meridian-month-title">{focusedMonth.label}</h2></div>
            {focusedMonth.breakdown ? <button type="button" onClick={() => toggleMonthDetail(focusedMonth)}>{expandedKey === focusedMonth.key ? 'Ocultar detalle' : 'Ver detalle'}</button> : null}
          </header>
          <div className="meridian-month-equation">
            <div><span>Saldo inicial</span><strong>{formatCurrency(focusedMonth.opening)}</strong></div>
            <b>+</b>
            <div><span>Aportaciones</span><strong>{formatCurrency(focusedMonth.increments)}</strong></div>
            <b>−</b>
            <div><span>Retiradas</span><strong>{formatCurrency(focusedMonth.decrements)}</strong></div>
            <b>+</b>
            <div><span>Beneficio del mes</span><strong className={toneClass(focusedMonth.profit)}>{signedMoney(focusedMonth.profit)}</strong></div>
            <b>=</b>
            <div><span>Saldo final</span><strong>{formatCurrency(focusedMonth.balance)}</strong></div>
          </div>
          <div className="meridian-month-return">
            <span>Rentabilidad del mes</span>
            <strong className={toneClass(focusedMonth.returnPct)}>{signedPercent(focusedMonth.returnPct)}</strong>
          </div>
          {expandedKey === focusedMonth.key && focusedMonth.breakdown ? (
            <div className="meridian-breakdown">
              <div className="meridian-breakdown-head"><span>Tramo</span><span>Capital</span><span>Rentabilidad aplicada</span><span>Beneficio del tramo</span></div>
              <div><span>Posición inicial</span><span>{formatCurrency(focusedMonth.breakdown.initialCapital)}</span><span>{signedPercent(focusedMonth.breakdown.initialReturnPct * 100)}</span><span>{signedMoney(focusedMonth.breakdown.initialProfit)}</span></div>
              {focusedMonth.breakdown.contributions.map((item, index) => (
                <div key={`${item.iso}-${index}`}><span>Aportación {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>
              ))}
              {(focusedMonth.breakdown.withdrawals ?? []).map((item, index) => (
                <div key={`${item.iso}-${index}`}><span>Retirada {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>
              ))}
              <div className="meridian-breakdown-total"><span>Beneficio explicado</span><span>—</span><span>{Math.abs(focusedMonth.breakdown.totalProfit - focusedMonth.profit) < 0.01 ? 'Conciliado' : '—'}</span><span>{signedMoney(focusedMonth.breakdown.totalProfit)}</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="meridian-index-section">
        <div className="meridian-section-heading">
          <div><span>ÍNDICE MENSUAL</span><h2>Comprobación de cierres</h2></div>
          <button type="button" onClick={() => setShowIndex((current) => !current)}>{showIndex ? 'Ocultar meses' : 'Ver todos los meses'}</button>
        </div>
        {showIndex ? (
          <div className="meridian-index" role="table" aria-label="Índice mensual">
            <div className="meridian-index-head" role="row"><span>Mes</span><span>Saldo inicial</span><span>Aportaciones</span><span>Retiradas</span><span>Beneficio</span><span>Rentabilidad</span><span>Saldo final</span><span>Detalle</span></div>
            {visibleMonths.map((month) => (
              <React.Fragment key={month.key}>
                <div className={`meridian-index-row${month.key === focusedMonth?.key ? ' is-active' : ''}`} role="row" onClick={() => focusMonth(month)}>
                  <span data-label="Mes">{month.shortLabel}</span><span data-label="Saldo inicial">{formatCurrency(month.opening)}</span><span data-label="Aportaciones">{formatCurrency(month.increments)}</span><span data-label="Retiradas">{formatCurrency(month.decrements)}</span><span data-label="Beneficio" className={toneClass(month.profit)}>{signedMoney(month.profit)}</span><span data-label="Rentabilidad" className={toneClass(month.returnPct)}>{signedPercent(month.returnPct)}</span><span data-label="Saldo final">{formatCurrency(month.balance)}</span><button type="button" disabled={!month.breakdown} aria-label={`Detalle de ${month.label}`} onClick={(event) => { event.stopPropagation(); toggleMonthDetail(month); }}>{month.breakdown ? (expandedKey === month.key ? '−' : '+') : '—'}</button>
                </div>
                {expandedKey === month.key && month.breakdown ? (
                  <div className="meridian-index-detail">
                    <strong>{month.label}</strong><span>Beneficio explicado {signedMoney(month.breakdown.totalProfit)}</span><span>{Math.abs(month.breakdown.totalProfit - month.profit) < 0.01 ? 'Conciliado' : 'Revisar desglose'}</span>
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </section>

      <section className="meridian-ledger" aria-labelledby="meridian-ledger-title">
        <div className="meridian-section-heading"><div><span>TESORERÍA</span><h2 id="meridian-ledger-title">Movimientos registrados</h2></div></div>
        <div className="meridian-ledger-head"><span>Fecha</span><span>Movimiento</span><span>Importe</span><span>Saldo tras movimiento</span></div>
        {projectedPending.map((movement, index) => (
          <div className="meridian-ledger-row is-pending" key={`pending-${movement.iso}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'} <small>Posterior al último cierre</small></span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{formatCurrency(movement.projectedBalance)}</span></div>
        ))}
        {[...(report.movements ?? [])].sort((left, right) => right.iso.localeCompare(left.iso)).map((movement, index) => (
          <div className="meridian-ledger-row" key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{formatCurrency(movement.balance)}</span></div>
        ))}
        {!pending.length && !(report.movements ?? []).length ? <p className="meridian-empty-row">Sin movimientos de tesorería</p> : null}
      </section>

      <footer className="meridian-seal">
        <span>CONCILIACIÓN DE CARTERA</span>
        <div><strong>{formatCurrency(visibleNetCapital)}</strong><b>+</b><strong>{signedMoney(report.beneficioTotal)}</strong><b>=</b><strong>{formatCurrency(visibleBalance)}</strong></div>
        <p>Capital neto aportado + beneficio acumulado = saldo disponible{pending.length ? ' · incluye movimientos en tránsito' : ''}</p>
      </footer>

      {tooltip && !isExpanded ? (
        <div className="meridian-tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="tooltip">
          <strong>{tooltip.month.label}</strong><span>Saldo final <b>{formatCurrency(tooltip.month.balance)}</b></span><span>Beneficio <b>{signedMoney(tooltip.month.profit)}</b></span><span>Rentabilidad <b>{signedPercent(tooltip.month.returnPct)}</b></span><span>Aportaciones <b>{formatCurrency(tooltip.month.increments)}</b></span><span>Retiradas <b>{formatCurrency(tooltip.month.decrements)}</b></span>
        </div>
      ) : null}

      <dialog ref={dialogRef} className="meridian-dialog" onClose={() => setIsExpanded(false)}>
        <div className="meridian-dialog-head"><div><span>MERIDIANO · VISTA AMPLIADA</span><h2>Carta mensual</h2></div><button type="button" onClick={closeExpanded}>Cerrar</button></div>
        <div className="meridian-dialog-chart">{renderStaff(true)}</div>
        {tooltip ? (
          <div className="meridian-tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="tooltip">
            <strong>{tooltip.month.label}</strong><span>Saldo final <b>{formatCurrency(tooltip.month.balance)}</b></span><span>Beneficio <b>{signedMoney(tooltip.month.profit)}</b></span><span>Rentabilidad <b>{signedPercent(tooltip.month.returnPct)}</b></span><span>Aportaciones <b>{formatCurrency(tooltip.month.increments)}</b></span><span>Retiradas <b>{formatCurrency(tooltip.month.decrements)}</b></span>
          </div>
        ) : null}
      </dialog>
    </main>
  );
};
