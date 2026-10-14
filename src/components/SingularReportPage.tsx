import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './SingularReportPage.css';

interface SingularPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface SingularReportPageProps {
  report: ReportData;
  pendingCashMovements?: SingularPendingMovement[];
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

interface SingularMonth {
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

interface SingularAttributedMovement {
  iso: string;
  type: string;
  amount: number;
  balance: number;
  returnPct?: number;
  profit?: number;
  pending?: boolean;
}

type SingularPeriod = '3m' | '6m' | '12m' | 'all' | 'custom';
type SingularChartMode = 'balance' | 'return' | 'profit';

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

const toneClass = (value: number) => value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral';

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const matchKey = (type: string, iso: string, amount: number) => `${type}|${iso}|${amount.toFixed(6)}`;

export const SingularReportPage: React.FC<SingularReportPageProps> = ({
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
  const netContributed = visibleContributed - visibleWithdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;
  const hasTotalReturn = report.rentabilidadDisponible !== false;

  const months = useMemo<SingularMonth[]>(() => {
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
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const latestMonth = months[months.length - 1];
  const [period, setPeriod] = useState<SingularPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [chartMode, setChartMode] = useState<SingularChartMode>('balance');
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ month: SingularMonth; left: number; top: number } | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const chartGroupRefs = useRef(new Map<string, SVGGElement>());

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);
  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey) ?? visibleMonths[visibleMonths.length - 1];
  const focusedIndex = focusedMonth ? visibleMonths.findIndex((month) => month.key === focusedMonth.key) : -1;
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodTwr = visibleMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1;

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setOpenMonthKey(null);
    setTooltip(null);
  }, [latestKey, months, report.clientId, report.createdAt]);

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusedKey)) {
      setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
      setOpenMonthKey(null);
    }
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    const container = chartScrollRef.current;
    if (!container) return;
    window.requestAnimationFrame(() => { container.scrollLeft = container.scrollWidth; });
  }, [chartMode, period, periodStart, periodEnd]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  const moveFocus = useCallback((direction: -1 | 1) => {
    if (!visibleMonths.length) return;
    const current = Math.max(0, visibleMonths.findIndex((month) => month.key === focusedMonth?.key));
    const next = visibleMonths[Math.max(0, Math.min(visibleMonths.length - 1, current + direction))];
    setFocusedKey(next.key);
    chartGroupRefs.current.get(next.key)?.focus();
  }, [focusedMonth?.key, visibleMonths]);

  const attributedMovements = useMemo<SingularAttributedMovement[]>(() => {
    const pools = new Map<string, Array<{ returnPct?: number; profit: number }>>();
    (report.contributionBreakdowns ?? []).forEach((breakdown) => {
      breakdown.contributions.forEach((item) => {
        const values = pools.get(matchKey('increment', item.iso, item.amount)) ?? [];
        values.push({ returnPct: item.returnPct, profit: item.profit });
        pools.set(matchKey('increment', item.iso, item.amount), values);
      });
      (breakdown.withdrawals ?? []).forEach((item) => {
        const values = pools.get(matchKey('decrement', item.iso, item.amount)) ?? [];
        values.push({ returnPct: item.returnPct, profit: item.profit });
        pools.set(matchKey('decrement', item.iso, item.amount), values);
      });
    });
    const published = (report.movements ?? []).map((movement) => {
      const attributed = pools.get(matchKey(movement.type, movement.iso, movement.amount))?.shift();
      return { ...movement, returnPct: attributed?.returnPct, profit: attributed?.profit };
    });
    let projected = report.saldo;
    const inTransit = pending.map((movement) => {
      projected += movement.type === 'increment' ? movement.amount : -movement.amount;
      return { ...movement, balance: projected, pending: true };
    });
    return [...published, ...inTransit].sort((left, right) => right.iso.localeCompare(left.iso));
  }, [pending, report.contributionBreakdowns, report.movements, report.saldo]);

  const visibleAttributedMovements = attributedMovements.filter((movement) => movement.pending || !periodStart || (movement.iso.slice(0, 7) >= periodStart && movement.iso.slice(0, 7) <= periodEnd));
  const positiveMonths = months.filter((month) => month.profit > 0).length;
  const contributionCount = (report.movements ?? []).filter((movement) => movement.type === 'increment').length + pending.filter((movement) => movement.type === 'increment').length;
  const withdrawalCount = (report.movements ?? []).filter((movement) => movement.type === 'decrement').length + pending.filter((movement) => movement.type === 'decrement').length;

  const chartWidth = Math.max(940, visibleMonths.length * 88 + 140);
  const chartHeight = 370;
  const plotTop = 38;
  const plotBottom = 292;
  const pointX = (index: number) => visibleMonths.length <= 1 ? chartWidth / 2 : 70 + index * ((chartWidth - 140) / (visibleMonths.length - 1));
  const maxBalance = Math.max(...visibleMonths.map((month) => Math.abs(month.balance)), 1) * 1.08;
  const maxReturn = Math.max(...visibleMonths.map((month) => Math.abs(month.returnPct)), 1) * 1.12;
  const maxProfit = Math.max(...visibleMonths.map((month) => Math.abs(month.profit)), 1) * 1.12;
  const balanceY = (value: number) => plotBottom - (Math.max(0, value) / maxBalance) * (plotBottom - plotTop);
  const centerY = 164;
  const barValue = (month: SingularMonth) => chartMode === 'return' ? month.returnPct : month.profit;
  const barMax = chartMode === 'return' ? maxReturn : maxProfit;
  const barHeight = (value: number) => Math.abs(value) / barMax * 108;
  const balanceLine = visibleMonths.map((month, index) => `${index ? 'L' : 'M'} ${pointX(index)} ${balanceY(month.balance)}`).join(' ');
  const balanceArea = balanceLine && visibleMonths.length ? `${balanceLine} L ${pointX(visibleMonths.length - 1)} ${plotBottom} L ${pointX(0)} ${plotBottom} Z` : '';
  const chartTitle = chartMode === 'balance' ? 'Evolución del patrimonio' : chartMode === 'return' ? 'Rentabilidad mensual' : 'Beneficio mensual';
  const chartDescription = chartMode === 'balance' ? 'Valor de la cartera al cierre de cada mes.' : chartMode === 'return' ? 'Rendimiento aplicado en cada cierre mensual.' : 'Resultado en euros generado durante cada mes.';

  const focusedNarrative = focusedMonth
    ? focusedMonth.increments > 0 && focusedMonth.decrements > 0
      ? `Durante ${focusedMonth.label} se registraron aportaciones por ${formatCurrency(focusedMonth.increments)} y retiradas por ${formatCurrency(focusedMonth.decrements)}. El cierre terminó con un beneficio de ${signedMoney(focusedMonth.profit)}.`
      : focusedMonth.increments > 0
        ? `${focusedMonth.label} incorporó ${formatCurrency(focusedMonth.increments)} de nuevo capital. El beneficio del mes fue ${signedMoney(focusedMonth.profit)}.`
        : focusedMonth.decrements > 0
          ? `${focusedMonth.label} incluyó una retirada de ${formatCurrency(focusedMonth.decrements)}. La posición restante cerró en ${formatCurrency(focusedMonth.balance)}.`
          : `${focusedMonth.label} no tuvo movimientos de capital. El resultado mensual fue ${signedMoney(focusedMonth.profit)} y el saldo final ${formatCurrency(focusedMonth.balance)}.`
    : 'Sin cierres publicados.';

  return (
    <main className="singular-report" ref={rootRef}>
      <header className="singular-mast">
        <div className="singular-brand"><span>PRIVATE PORTFOLIO SYSTEM · CODEX</span><h1>Singular</h1><p>Toda la cartera. Una sola lectura.</p></div>
        <div className="singular-mast-actions"><span>{report.clientCode}</span><button type="button" onClick={onDownload}>Descargar PDF</button></div>
      </header>

      <section className="singular-hero" aria-label="Resumen ejecutivo de cartera">
        <div className="singular-hero-balance"><span>SALDO DISPONIBLE</span><strong>{formatCurrency(visibleBalance)}</strong><p>{pending.length ? 'Incluye movimientos de capital posteriores al último cierre.' : `Actualizado al cierre de ${latestMonth?.label ?? 'la cartera'}.`}</p></div>
        <div className="singular-hero-primary"><span>Rentabilidad {latestMonth?.label ?? 'último mes'}</span><strong className={toneClass(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong><small>Rendimiento del último cierre</small></div>
        <div className="singular-hero-primary"><span>Beneficio {latestMonth?.label ?? 'último mes'}</span><strong className={toneClass(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong><small>Resultado generado en euros</small></div>
        <div className="singular-hero-secondary"><span>Beneficio acumulado</span><strong className={toneClass(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
        <div className="singular-hero-secondary"><span>TWR acumulado</span><strong>{signedPercent(twrPct)}</strong></div>
        <div className="singular-hero-secondary"><span>Rentabilidad total</span><strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div>
        <div className="singular-hero-secondary"><span>Capital neto aportado</span><strong>{formatCurrency(netContributed)}</strong></div>
      </section>

      <section className="singular-capital-map" aria-label="Composición del saldo">
        <header><span>COMPOSICIÓN DEL SALDO</span><p>Capital neto y beneficio acumulado</p></header>
        <div><i style={{ width: `${visibleBalance > 0 ? Math.max(3, Math.min(100, netContributed / visibleBalance * 100)) : 0}%` }} /><b style={{ width: `${visibleBalance > 0 ? Math.max(0, Math.min(100, report.beneficioTotal / visibleBalance * 100)) : 0}%` }} /></div>
        <footer><span><i />Capital neto <strong>{formatCurrency(netContributed)}</strong></span><span><i />Beneficio <strong>{signedMoney(report.beneficioTotal)}</strong></span><small>{months.length} cierres publicados · desde {months[0]?.label ?? '—'}</small></footer>
      </section>

      {pending.length ? <section className="singular-pending" aria-labelledby="singular-pending-title"><div><span>ACTUALIZACIÓN DE CAPITAL</span><h2 id="singular-pending-title">Movimientos posteriores al último cierre</h2><p>Se incorporan al saldo disponible. Su rentabilidad aparecerá cuando se publique el siguiente cierre.</p></div><div>{pending.map((movement, index) => <article key={`${movement.iso}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></article>)}</div></section> : null}

      <section className="singular-command" aria-label="Controles del análisis">
        <div className="singular-period-block"><span>PERIODO DE ANÁLISIS</span><strong>{periodStart ? `${monthLabel(periodStart, true)} — ${monthLabel(periodEnd, true)}` : 'Sin cierres'}</strong></div>
        <div className="singular-periods">{(['3m', '6m', '12m', 'all'] as const).map((option) => <button key={option} type="button" className={period === option ? 'is-active' : ''} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option === 'all' ? 'Todo' : option.toUpperCase()}</button>)}<button type="button" className={period === 'custom' ? 'is-active' : ''} aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>Personalizado</button></div>
        <div className="singular-mode-switch" role="group" aria-label="Vista del gráfico">{([{ key: 'balance', label: 'Patrimonio' }, { key: 'return', label: 'Rentabilidad' }, { key: 'profit', label: 'Beneficio' }] as const).map((mode) => <button key={mode.key} type="button" className={chartMode === mode.key ? 'is-active' : ''} aria-pressed={chartMode === mode.key} onClick={() => { setChartMode(mode.key); onAnalyticsEvent?.({ type: 'report_chart_change', label: `Singular ${mode.label}` }); }}>{mode.label}</button>)}</div>
        {period === 'custom' ? <div className="singular-custom"><label>Desde<select value={customStart} onChange={(event) => { const next = event.target.value; setCustomStart(next); if (next > customEnd) setCustomEnd(next); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => { const next = event.target.value; setCustomEnd(next); if (next < customStart) setCustomStart(next); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <section className="singular-analysis">
        <div className="singular-chart-shell">
          <header><div><span>LECTURA DINÁMICA</span><h2>{chartTitle}</h2><p>{chartDescription}</p></div><div><span>TWR del periodo visible</span><strong className={toneClass(periodTwr)}>{signedPercent(periodTwr * 100)}</strong></div></header>
          <div className="singular-chart-scroll" ref={chartScrollRef}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: chartWidth }} role="img" aria-labelledby="singular-chart-svg-title">
              <title id="singular-chart-svg-title">{chartTitle}. {chartDescription}</title>
              <defs><linearGradient id="singular-balance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4ca28a" stopOpacity=".28" /><stop offset="1" stopColor="#4ca28a" stopOpacity=".02" /></linearGradient></defs>
              {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1="56" x2={chartWidth - 48} y1={plotBottom - ratio * (plotBottom - plotTop)} y2={plotBottom - ratio * (plotBottom - plotTop)} className="singular-chart-grid" />{chartMode === 'balance' ? <text x="48" y={plotBottom - ratio * (plotBottom - plotTop) + 4} textAnchor="end" className="singular-chart-axis-label">{compactMoney(maxBalance * ratio)}</text> : null}</g>)}
              {chartMode !== 'balance' ? <><line x1="56" x2={chartWidth - 48} y1={centerY} y2={centerY} className="singular-chart-zero" /><text x="48" y={centerY + 4} textAnchor="end" className="singular-chart-axis-label">0</text><text x="48" y="55" textAnchor="end" className="singular-chart-axis-label">{chartMode === 'return' ? signedPercent(barMax) : compactMoney(barMax)}</text><text x="48" y="280" textAnchor="end" className="singular-chart-axis-label">{chartMode === 'return' ? signedPercent(-barMax) : compactMoney(-barMax)}</text></> : null}
              {focusedIndex >= 0 ? <rect x={pointX(focusedIndex) - 35} y="24" width="70" height="304" rx="8" className="singular-chart-focus-band" /> : null}
              {chartMode === 'balance' && balanceArea ? <path d={balanceArea} className="singular-chart-area" /> : null}
              {chartMode === 'balance' && balanceLine ? <path d={balanceLine} className="singular-chart-line" /> : null}
              {visibleMonths.map((month, index) => {
                const x = pointX(index);
                const value = barValue(month);
                const height = barHeight(value);
                const y = value >= 0 ? centerY - height : centerY;
                const isFocused = month.key === focusedMonth?.key;
                return <g key={month.key} ref={(node) => { if (node) chartGroupRefs.current.set(month.key, node); else chartGroupRefs.current.delete(month.key); }} className={isFocused ? 'is-focused' : ''} role="button" tabIndex={0} aria-label={`${month.label}. Saldo ${formatCurrency(month.balance)}. Beneficio ${signedMoney(month.profit)}. Rentabilidad ${signedPercent(month.returnPct)}`} onClick={() => setFocusedKey(month.key)} onFocus={() => setFocusedKey(month.key)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(1); } if (event.key === 'Enter' && month.breakdown) setOpenMonthKey((current) => current === month.key ? null : month.key); }} onMouseMove={(event) => setTooltip({ month, left: Math.min(window.innerWidth - 248, event.clientX + 12), top: Math.max(12, event.clientY - 116) })} onMouseLeave={() => setTooltip(null)}>
                  <rect x={x - 36} y="24" width="72" height="310" className="singular-chart-hit" />
                  {chartMode === 'balance' ? <circle cx={x} cy={balanceY(month.balance)} r={isFocused ? 5 : 3.5} className="singular-chart-point" /> : <rect x={x - 13} y={y} width="26" height={Math.max(1, height)} rx="3" className={`singular-chart-bar ${value < 0 ? 'is-negative' : 'is-positive'}`} />}
                  {month.increments > 0 ? <path d={`M ${x - (month.decrements > 0 ? 7 : 0) - 4} 312 l 4 -7 l 4 7 z`} className="singular-flow-in" /> : null}
                  {month.decrements > 0 ? <path d={`M ${x + (month.increments > 0 ? 7 : 0) - 4} 305 l 4 7 l 4 -7 z`} className="singular-flow-out" /> : null}
                  <text x={x} y="350" textAnchor="middle" className="singular-chart-month">{month.shortLabel}</text>
                  {isFocused ? <text x={x} y={chartMode === 'balance' ? Math.max(18, balanceY(month.balance) - 13) : value >= 0 ? Math.max(18, y - 11) : Math.min(300, y + height + 17)} textAnchor="middle" className="singular-chart-value">{chartMode === 'balance' ? compactMoney(month.balance) : chartMode === 'return' ? signedPercent(month.returnPct) : signedMoney(month.profit)}</text> : null}
                </g>;
              })}
              {!visibleMonths.length ? <text x={chartWidth / 2} y="180" textAnchor="middle" className="singular-chart-empty">Sin cierres publicados</text> : null}
            </svg>
          </div>
          <footer><span><i className="is-increment" />Aportación</span><span><i className="is-decrement" />Retirada</span><small>Selecciona un mes para abrir su lectura financiera.</small></footer>
          <table className="sr-only"><caption>Datos mensuales del gráfico</caption><thead><tr><th>Mes</th><th>Saldo</th><th>Beneficio</th><th>Rentabilidad</th></tr></thead><tbody>{visibleMonths.map((month) => <tr key={month.key}><td>{month.label}</td><td>{formatCurrency(month.balance)}</td><td>{signedMoney(month.profit)}</td><td>{signedPercent(month.returnPct)}</td></tr>)}</tbody></table>
        </div>

        <aside className="singular-month-card" aria-live="polite">
          {focusedMonth ? <><header><span>MES EN FOCO</span><h2>{focusedMonth.label}</h2><small>Cierre publicado</small></header><p className="singular-month-narrative">{focusedNarrative}</p><div className="singular-month-equation"><div><span>Saldo inicial</span><strong>{formatCurrency(focusedMonth.opening)}</strong></div><b>+</b><div><span>Aportaciones</span><strong>{formatCurrency(focusedMonth.increments)}</strong></div><b>−</b><div><span>Retiradas</span><strong>{formatCurrency(focusedMonth.decrements)}</strong></div><b>+</b><div><span>Beneficio</span><strong className={toneClass(focusedMonth.profit)}>{signedMoney(focusedMonth.profit)}</strong></div><b>=</b><div className="is-total"><span>Saldo final</span><strong>{formatCurrency(focusedMonth.balance)}</strong></div></div><div className="singular-month-return"><span>Rentabilidad del mes</span><strong className={toneClass(focusedMonth.returnPct)}>{signedPercent(focusedMonth.returnPct)}</strong></div>{focusedMonth.breakdown ? <button type="button" onClick={() => setOpenMonthKey((current) => current === focusedMonth.key ? null : focusedMonth.key)} aria-expanded={openMonthKey === focusedMonth.key}>{openMonthKey === focusedMonth.key ? 'Ocultar composición' : 'Ver composición del resultado'}</button> : <small className="singular-verified">Cierre sin tramos adicionales</small>}{openMonthKey === focusedMonth.key && focusedMonth.breakdown ? <div className="singular-month-breakdown"><div><span>Posición inicial</span><strong>{formatCurrency(focusedMonth.breakdown.initialCapital)}</strong><em>{signedPercent(focusedMonth.breakdown.initialReturnPct * 100)}</em><b>{signedMoney(focusedMonth.breakdown.initialProfit)}</b></div>{focusedMonth.breakdown.contributions.map((item, index) => <div key={`${item.iso}-${index}`}><span>Aportación {formatDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><em>{signedPercent(item.returnPct * 100)}</em><b>{signedMoney(item.profit)}</b></div>)}{(focusedMonth.breakdown.withdrawals ?? []).map((item, index) => <div key={`${item.iso}-${index}`}><span>Retirada {formatDate(item.iso)}</span><strong>{formatCurrency(item.amount)}</strong><em>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</em><b>{signedMoney(item.profit)}</b></div>)}<footer><span>Beneficio explicado</span><strong>{signedMoney(focusedMonth.breakdown.totalProfit)}</strong></footer></div> : null}</> : <p>Sin cierres publicados.</p>}
        </aside>
      </section>

      <section className="singular-signals" aria-label="Lecturas rápidas de la cartera">
        <article><span>CONTINUIDAD</span><strong>{positiveMonths} de {months.length}</strong><p>meses con beneficio positivo</p></article>
        <article><span>ACTIVIDAD DE CAPITAL</span><strong>{contributionCount} / {withdrawalCount}</strong><p>aportaciones / retiradas registradas</p></article>
        <article><span>CAPITAL PRODUCTIVO</span><strong>{formatCurrency(netContributed)}</strong><p>capital aportado menos capital retirado</p></article>
        <article><span>TRAZABILIDAD</span><strong>{(report.contributionBreakdowns ?? []).length}</strong><p>meses con composición detallada</p></article>
      </section>

      <section className="singular-ledger" aria-labelledby="singular-ledger-title">
        <header><div><span>REGISTRO DE CIERRES</span><h2 id="singular-ledger-title">Libro mensual</h2><p>Resultado, rentabilidad y conciliación de cada mes.</p></div><strong>{visibleMonths.length} {visibleMonths.length === 1 ? 'mes' : 'meses'}</strong></header>
        <div className="singular-ledger-head"><span>Mes</span><span>Saldo inicial</span><span>Aportaciones</span><span>Retiradas</span><span>Beneficio</span><span>Rentabilidad</span><span>Saldo final</span><span>Detalle</span></div>
        {visibleMonths.map((month) => {
          const isOpen = openMonthKey === month.key;
          return <article key={month.key} className={isOpen ? 'is-open' : ''}><button type="button" onClick={() => { setFocusedKey(month.key); if (month.breakdown) setOpenMonthKey((current) => current === month.key ? null : month.key); }} aria-expanded={month.breakdown ? isOpen : undefined}><span data-label="Mes">{month.shortLabel}</span><span data-label="Saldo inicial">{formatCurrency(month.opening)}</span><span data-label="Aportaciones" className="is-increment">{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</span><span data-label="Retiradas" className="is-decrement">{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</span><span data-label="Beneficio" className={toneClass(month.profit)}>{signedMoney(month.profit)}</span><span data-label="Rentabilidad" className={toneClass(month.returnPct)}>{signedPercent(month.returnPct)}</span><strong data-label="Saldo final">{formatCurrency(month.balance)}</strong><em>{month.breakdown ? (isOpen ? '−' : '+') : '✓'}</em></button>{isOpen && month.breakdown ? <div className="singular-ledger-detail"><header><span>Concepto</span><span>Capital</span><span>Rentabilidad aplicada</span><span>Beneficio generado</span></header><div><span>Posición inicial del mes</span><span>{formatCurrency(month.breakdown.initialCapital)}</span><span>{signedPercent(month.breakdown.initialReturnPct * 100)}</span><span>{signedMoney(month.breakdown.initialProfit)}</span></div>{month.breakdown.contributions.map((item, index) => <div key={`${item.iso}-${index}`}><span>Aportación incorporada el {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}{(month.breakdown.withdrawals ?? []).map((item, index) => <div key={`${item.iso}-${index}`}><span>Posición retirada el {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}<footer><span>Beneficio explicado</span><span>—</span><span>{Math.abs(month.breakdown.totalProfit - month.profit) < .01 ? 'Conciliado' : 'Revisar'}</span><span>{signedMoney(month.breakdown.totalProfit)}</span></footer></div> : null}</article>;
        })}
        {!visibleMonths.length ? <p className="singular-empty">Sin cierres publicados</p> : null}
      </section>

      <section className="singular-activity" aria-labelledby="singular-activity-title">
        <header><div><span>TRAZABILIDAD DEL CAPITAL</span><h2 id="singular-activity-title">Aportaciones y retiradas</h2><p>Cada movimiento con su atribución publicada cuando está disponible.</p></div><div><span>Capital aportado <strong>{formatCurrency(visibleContributed)}</strong></span><span>Capital retirado <strong>{formatCurrency(visibleWithdrawn)}</strong></span></div></header>
        <div className="singular-activity-head"><span>Fecha</span><span>Movimiento</span><span>Importe</span><span>Rentabilidad del tramo</span><span>Beneficio del tramo</span><span>Estado</span></div>
        {visibleAttributedMovements.map((movement, index) => <article key={`${movement.iso}-${movement.type}-${index}`} className={movement.pending ? 'is-pending' : ''}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{movement.pending ? '—' : movement.returnPct === undefined ? '—' : signedPercent(movement.returnPct * 100)}</span><span className={toneClass(movement.profit ?? 0)}>{movement.pending ? '—' : movement.profit === undefined ? '—' : signedMoney(movement.profit)}</span><em>{movement.pending ? 'En tránsito' : movement.returnPct === undefined ? 'Publicado' : 'Atribuido'}</em></article>)}
        {!visibleAttributedMovements.length ? <p className="singular-empty">Sin movimientos en el periodo</p> : null}
      </section>

      <footer className="singular-seal"><div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div><b>−</b><div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div><b>+</b><div><span>Beneficio acumulado</span><strong>{signedMoney(report.beneficioTotal)}</strong></div><b>=</b><div><span>Saldo disponible</span><strong>{formatCurrency(visibleBalance)}</strong></div><small>Identidad patrimonial · datos publicados y movimientos de capital visibles</small></footer>

      {tooltip ? <div className="singular-tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="tooltip"><strong>{tooltip.month.label}</strong><span>Saldo {formatCurrency(tooltip.month.balance)}</span><span>Beneficio {signedMoney(tooltip.month.profit)}</span><span>Rentabilidad {signedPercent(tooltip.month.returnPct)}</span>{tooltip.month.increments ? <span>Aportaciones +{formatCurrency(tooltip.month.increments)}</span> : null}{tooltip.month.decrements ? <span>Retiradas −{formatCurrency(tooltip.month.decrements)}</span> : null}</div> : null}
    </main>
  );
};
