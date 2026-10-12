import React, { useEffect, useMemo, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './AuraQuantumReportPage.css';

interface AuraPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AuraQuantumReportPageProps {
  report: ReportData;
  pendingCashMovements?: AuraPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface AuraMonth {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  openingBalance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  netFlow: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type AuraPeriod = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom';
type AuraChartMode = 'dual' | 'balance' | 'return';

const monthLookup: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8,
  septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  const label = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
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

const compactCurrency = (value: number) => new Intl.NumberFormat('es-ES', {
  notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  maximumFractionDigits: Math.abs(value) >= 100000 ? 1 : 0
}).format(value);

const sumMovements = (movements: ReportData['movements'], type: 'increment' | 'decrement') => (
  movements.filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0)
);

export const AuraQuantumReportPage: React.FC<AuraQuantumReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const months = useMemo<AuraMonth[]>(() => {
    const breakdowns = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const stats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = stats.length ? monthToKey(stats[stats.length - 1].month) : '';

    return stats.map((item) => {
      const key = monthToKey(item.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(movements, 'increment');
      const decrements = sumMovements(movements, 'decrement');
      const balance = Number.isFinite(item.endBalance) ? item.endBalance : 0;
      const profit = Number.isFinite(item.profit) ? item.profit : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        balance,
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(item.profitPct) ? item.profitPct : 0,
        increments,
        decrements,
        netFlow: increments - decrements,
        openingBalance: balance - profit - increments + decrements,
        movements,
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<AuraPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [chartMode, setChartMode] = useState<AuraChartMode>('dual');
  const [focusedMonthKey, setFocusedMonthKey] = useState(latestKey);
  const [expandedMonthKey, setExpandedMonthKey] = useState(latestKey);
  const [showTwrExplanation, setShowTwrExplanation] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedMonthKey(latestKey);
    setExpandedMonthKey(latestKey);
  }, [latestKey, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!isChartExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsChartExpanded(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [isChartExpanded]);

  const visibleMonths = useMemo(() => {
    if (period === 'all') return months;
    if (period === '3m' || period === '6m' || period === '12m') {
      return months.slice(-Number(period.replace('m', '')));
    }
    if (period === 'ytd') {
      const latestYear = latestKey.slice(0, 4);
      return months.filter((month) => month.key.startsWith(latestYear));
    }
    return months.filter((month) => month.key >= customStart && month.key <= customEnd);
  }, [customEnd, customStart, latestKey, months, period]);

  useEffect(() => {
    if (!visibleMonths.length) return;
    if (!visibleMonths.some((month) => month.key === focusedMonthKey)) {
      const nextKey = visibleMonths[visibleMonths.length - 1].key;
      setFocusedMonthKey(nextKey);
      setExpandedMonthKey(nextKey);
    }
  }, [focusedMonthKey, visibleMonths]);

  const focusedMonth = months.find((month) => month.key === focusedMonthKey)
    ?? visibleMonths[visibleMonths.length - 1]
    ?? months[months.length - 1];
  const focusedIndex = visibleMonths.findIndex((month) => month.key === focusedMonth?.key);
  const pendingIncrements = pendingCashMovements.filter((item) => item.type === 'increment').reduce((sum, item) => sum + item.amount, 0);
  const pendingDecrements = pendingCashMovements.filter((item) => item.type === 'decrement').reduce((sum, item) => sum + item.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const capitalContributed = report.incrementos + pendingIncrements;
  const capitalWithdrawn = report.decrementos + pendingDecrements;
  const netCapital = capitalContributed - capitalWithdrawn;
  const isReconciled = Math.abs(netCapital + report.beneficioTotal - visibleBalance) <= 0.02;
  const twrPct = (report.twrYtd ?? 0) * 100;
  const totalReturnPct = report.rentabilidadDisponible === false ? null : report.rentabilidad;
  const periodNetFlow = visibleMonths.reduce((sum, month) => sum + month.netFlow, 0);
  const periodBenefit = visibleMonths.reduce((sum, month) => sum + month.profit, 0);
  const periodTwr = visibleMonths.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1;
  const firstRegisteredIso = [...(report.movements ?? []).map((item) => item.iso), ...(months[0] ? [`${months[0].key}-01`] : [])].sort()[0];
  const periodRange = visibleMonths.length
    ? `${visibleMonths[0].shortLabel} — ${visibleMonths[visibleMonths.length - 1].shortLabel}`
    : 'Sin cierres publicados';

  const chartGeometry = useMemo(() => {
    const width = 1200;
    const height = 420;
    const left = 72;
    const right = 1140;
    const top = 38;
    const balanceBottom = 274;
    const returnBaseline = 344;
    const returnSpan = 48;
    const maxBalance = Math.max(1, ...visibleMonths.map((month) => Math.max(0, month.balance))) * 1.08;
    const barValues = visibleMonths.map((month) => chartMode === 'return' ? month.returnPct : month.profit);
    const maxBar = Math.max(0.01, ...barValues.map((value) => Math.abs(value)));
    const points = visibleMonths.map((month, index) => {
      const x = visibleMonths.length === 1
        ? (left + right) / 2
        : left + index / (visibleMonths.length - 1) * (right - left);
      const y = balanceBottom - Math.max(0, month.balance) / maxBalance * (balanceBottom - top);
      const barValue = barValues[index] ?? 0;
      const barHeight = Math.max(2, Math.abs(barValue) / maxBar * returnSpan);
      return { month, x, y, barValue, barHeight };
    });
    const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${balanceBottom} L ${points[0].x} ${balanceBottom} Z`
      : '';
    return { width, height, left, right, top, balanceBottom, returnBaseline, maxBalance, points, linePath, areaPath };
  }, [chartMode, visibleMonths]);

  const focusMonth = (key: string, source: string) => {
    setFocusedMonthKey(key);
    setExpandedMonthKey(key);
    onAnalyticsEvent?.({ type: 'aura_month_focus', label: key, metadata: { source } });
  };

  const changePeriod = (nextPeriod: AuraPeriod) => {
    setPeriod(nextPeriod);
    onAnalyticsEvent?.({ type: 'aura_period_change', label: nextPeriod });
  };

  const stepMonth = (direction: -1 | 1) => {
    const next = visibleMonths[focusedIndex + direction];
    if (next) focusMonth(next.key, 'navigation');
  };

  const toggleBreakdown = (key: string) => {
    setExpandedMonthKey((current) => current === key ? '' : key);
    setFocusedMonthKey(key);
    onAnalyticsEvent?.({ type: 'aura_breakdown_expand', label: key });
  };

  const renderMonthBreakdown = (month: AuraMonth) => {
    const breakdown = month.breakdown;
    if (!breakdown) {
      return <p className="aura-no-tranches">Este cierre no necesita desglose adicional: el capital permaneció íntegro durante todo el ciclo.</p>;
    }
    return (
      <div className="aura-tranche-grid">
        <article>
          <span>Posición inicial del mes</span>
          <strong>{formatCurrency(breakdown.initialCapital)}</strong>
          <small>{signedPercent(breakdown.initialReturnPct * 100)} · {signedMoney(breakdown.initialProfit)}</small>
        </article>
        {breakdown.contributions.map((item, index) => (
          <article key={`contribution-${item.iso}-${index}`}>
            <span>Aportación incorporada el {formatDate(item.iso)}</span>
            <strong>{formatCurrency(item.amount)}</strong>
            <small>{signedPercent(item.returnPct * 100)} · {signedMoney(item.profit)}</small>
          </article>
        ))}
        {(breakdown.withdrawals ?? []).map((item, index) => (
          <article key={`withdrawal-${item.iso}-${index}`}>
            <span>Posición retirada el {formatDate(item.iso)}</span>
            <strong>{formatCurrency(item.amount)}</strong>
            <small>{item.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(item.returnPct * 100)} · ${signedMoney(item.profit)}`}</small>
          </article>
        ))}
        <article className="is-total">
          <span>Beneficio explicado</span>
          <strong>{signedMoney(breakdown.totalProfit)}</strong>
          <small>Resultado conciliado de todos los tramos</small>
        </article>
      </div>
    );
  };

  return (
    <div className="aura-report" ref={rootRef} role="document">
      <header className="aura-header">
        <div className="aura-identity">
          <span className="aura-sigil" aria-hidden="true"><i /><b>AQ</b></span>
          <div><strong>AURA QUANTUM</strong><small>Private Banking Terminal · Sovereign Ledger</small></div>
        </div>
        <div className="aura-header-meta">
          <span><small>Cuenta verificada</small><strong>{report.clientCode}</strong></span>
          <span><small>Sellado temporal</small><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></span>
          <button type="button" onClick={() => void onDownload?.()}><span>PDF vectorial</span><b aria-hidden="true">↓</b></button>
        </div>
      </header>

      <section className="aura-executive" aria-label="Resumen ejecutivo">
        <article className="aura-balance-monolith">
          <div><span>Saldo actual</span><i className={isReconciled ? 'is-verified' : 'is-review'}>{isReconciled ? 'Reconciliado' : 'Revisión necesaria'}</i></div>
          <strong>{formatCurrency(visibleBalance)}{pendingCashMovements.length ? <sup>*</sup> : null}</strong>
          <small>{pendingCashMovements.length ? 'Incluye movimientos posteriores al último cierre publicado' : 'Posición consolidada al último cierre publicado'}</small>
          <em aria-hidden="true" />
        </article>
        <article className="aura-pulse-card">
          <span>Rentabilidad · {months[months.length - 1]?.label ?? 'Último cierre'}</span>
          <strong className={report.rentabilidadUltimoMes >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(report.rentabilidadUltimoMes)}</strong>
          <small>TWR del último mes cerrado</small>
          <b aria-hidden="true">01</b>
        </article>
        <article className="aura-pulse-card">
          <span>Beneficio · {months[months.length - 1]?.label ?? 'Último cierre'}</span>
          <strong className={report.beneficioUltimoMes >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioUltimoMes)}</strong>
          <small>Resultado generado durante el mes</small>
          <b aria-hidden="true">02</b>
        </article>
      </section>

      {pendingCashMovements.length ? (
        <section className="aura-pending" aria-label="Movimientos posteriores al cierre">
          <div><i aria-hidden="true" /><span><strong>Capital actualizado después del cierre</strong><small>La rentabilidad se incorporará cuando se publique el próximo cierre mensual.</small></span></div>
          <div className="aura-pending-list">{pendingCashMovements.map((item, index) => <span key={`${item.iso}-${item.type}-${index}`}><small>{formatDate(item.iso)}</small><strong className={item.type === 'increment' ? 'is-positive' : 'is-negative'}>{item.type === 'increment' ? '+' : '−'}{formatCurrency(item.amount)}</strong></span>)}</div>
        </section>
      ) : null}

      <section className="aura-capital-core" aria-label="Atribución patrimonial">
        <article><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong><small>Desde {firstRegisteredIso ? formatDate(firstRegisteredIso) : 'el inicio'}</small></article>
        <article><span>TWR acumulado</span><strong className={twrPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(twrPct)}</strong><small>Rendimiento puro de la estrategia</small></article>
        <article><span>Rentabilidad total</span><strong className={(totalReturnPct ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{totalReturnPct === null ? 'No aplicable' : signedPercent(totalReturnPct)}</strong><small>Beneficio sobre capital neto</small></article>
        <article><span>Capital aportado</span><strong>{formatCurrency(capitalContributed)}</strong><small>Total histórico registrado</small></article>
        <article><span>Capital retirado</span><strong>{formatCurrency(capitalWithdrawn)}</strong><small>Total histórico registrado</small></article>
      </section>

      <section className="aura-twr-bridge">
        <div className="aura-twr-copy"><span>Protocolo de lectura</span><h2>Dos rentabilidades. Dos preguntas distintas.</h2><p>El TWR mide cómo se comportó la estrategia aislando aportaciones y retiradas. La rentabilidad total compara el beneficio acumulado con el capital neto aportado.</p><button type="button" aria-expanded={showTwrExplanation} onClick={() => { setShowTwrExplanation((value) => !value); onAnalyticsEvent?.({ type: 'aura_twr_modal_open', label: showTwrExplanation ? 'close' : 'open' }); }}>{showTwrExplanation ? 'Cerrar explicación' : '¿Por qué pueden diferir?'}</button></div>
        <div className="aura-twr-comparison" aria-label="Comparación de rentabilidades">
          <div><span>TWR</span><strong>{signedPercent(twrPct)}</strong><i><b style={{ width: `${Math.min(100, Math.max(4, Math.abs(twrPct) / Math.max(Math.abs(twrPct), Math.abs(totalReturnPct ?? 0), 0.01) * 100))}%` }} /></i></div>
          <div><span>Rentabilidad total</span><strong>{totalReturnPct === null ? '—' : signedPercent(totalReturnPct)}</strong><i><b style={{ width: `${totalReturnPct === null ? 0 : Math.min(100, Math.max(4, Math.abs(totalReturnPct) / Math.max(Math.abs(twrPct), Math.abs(totalReturnPct), 0.01) * 100))}%` }} /></i></div>
        </div>
        {showTwrExplanation ? <div className="aura-twr-explanation"><strong>Ejemplo directo</strong><p>Si la cartera gana un 5 % y después entra capital nuevo, ese ingreso aumenta el saldo pero no convierte el 5 % en una rentabilidad mayor. El TWR conserva el rendimiento de la inversión; la rentabilidad total refleja el beneficio frente a todo el capital neto aportado.</p></div> : null}
      </section>

      <section className="aura-period-control" aria-label="Seleccionar periodo del informe">
        <div><span>Horizonte analítico</span><strong>{periodRange}</strong></div>
        <div className="aura-period-buttons" role="group" aria-label="Periodo">
          {([['3m', '3M'], ['6m', '6M'], ['12m', '12M'], ['ytd', 'YTD'], ['all', 'Todo'], ['custom', 'Personalizado']] as Array<[AuraPeriod, string]>).map(([value, label]) => <button type="button" key={value} className={period === value ? 'is-active' : ''} aria-pressed={period === value} onClick={() => changePeriod(value)}>{label}</button>)}
        </div>
        {period === 'custom' ? <div className="aura-custom-period"><label><span>Desde</span><select value={customStart} onChange={(event) => { const value = event.target.value; setCustomStart(value); if (value > customEnd) setCustomEnd(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label><span>Hasta</span><select value={customEnd} onChange={(event) => { const value = event.target.value; setCustomEnd(value); if (value < customStart) setCustomStart(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <section className={`aura-quantum-canvas ${isChartExpanded ? 'is-expanded' : ''}`} aria-label="Lienzo cuántico de evolución patrimonial">
        <div className="aura-canvas-header">
          <div><span>Instrumento dinámico</span><h2>Lienzo cuántico patrimonial</h2><p>Saldo, rendimiento y flujos de capital sincronizados en una única lectura.</p></div>
          <div className="aura-canvas-actions"><div role="group" aria-label="Vista del gráfico">{([['dual', 'Síntesis'], ['balance', 'Saldo'], ['return', 'TWR']] as Array<[AuraChartMode, string]>).map(([value, label]) => <button type="button" key={value} className={chartMode === value ? 'is-active' : ''} aria-pressed={chartMode === value} onClick={() => setChartMode(value)}>{label}</button>)}</div><button type="button" className="aura-expand-chart" onClick={() => { setIsChartExpanded((value) => !value); onAnalyticsEvent?.({ type: 'aura_fullscreen_toggle', label: isChartExpanded ? 'close' : 'open' }); }}>{isChartExpanded ? 'Cerrar' : 'Ampliar'} <span aria-hidden="true">{isChartExpanded ? '×' : '↗'}</span></button></div>
        </div>

        {visibleMonths.length ? (
          <div className="aura-chart-stage">
            <svg viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} role="img" aria-label={`Evolución patrimonial de ${periodRange}`} preserveAspectRatio="none">
              <defs><linearGradient id="auraArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2ec4b6" stopOpacity="0.34" /><stop offset="1" stopColor="#2ec4b6" stopOpacity="0.01" /></linearGradient><linearGradient id="auraLine" x1="0" x2="1"><stop offset="0" stopColor="#d4af37" /><stop offset="0.5" stopColor="#f2d887" /><stop offset="1" stopColor="#2ec4b6" /></linearGradient><filter id="auraGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => { const y = chartGeometry.balanceBottom - ratio * (chartGeometry.balanceBottom - chartGeometry.top); return <g key={ratio}><line className="aura-grid-line" x1={chartGeometry.left} x2={chartGeometry.right} y1={y} y2={y} /><text className="aura-axis-value" x={chartGeometry.left - 14} y={y + 4} textAnchor="end">{compactCurrency(chartGeometry.maxBalance * ratio)} €</text></g>; })}
              {chartMode !== 'return' ? <><path className="aura-area-path" d={chartGeometry.areaPath} /><path className="aura-balance-path" d={chartGeometry.linePath} /></> : null}
              <line className="aura-zero-line" x1={chartGeometry.left} x2={chartGeometry.right} y1={chartGeometry.returnBaseline} y2={chartGeometry.returnBaseline} />
              {chartGeometry.points.map((point, index) => {
                const selected = point.month.key === focusedMonth?.key;
                const showLabel = visibleMonths.length <= 12 || index % Math.ceil(visibleMonths.length / 10) === 0 || index === visibleMonths.length - 1;
                const barY = point.barValue >= 0 ? chartGeometry.returnBaseline - point.barHeight : chartGeometry.returnBaseline;
                return <g key={point.month.key} className={selected ? 'is-selected' : ''} role="button" tabIndex={0} aria-label={`${point.month.label}: saldo ${formatCurrency(point.month.balance)}, beneficio ${signedMoney(point.month.profit)}, rentabilidad ${signedPercent(point.month.returnPct)}`} onClick={() => focusMonth(point.month.key, 'chart')} onFocus={() => setFocusedMonthKey(point.month.key)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusMonth(point.month.key, 'keyboard'); } }}>
                  {selected ? <line className="aura-focus-laser" x1={point.x} x2={point.x} y1={chartGeometry.top - 10} y2={chartGeometry.returnBaseline + 56} /> : null}
                  {chartMode !== 'balance' ? <rect className={point.barValue >= 0 ? 'aura-profit-bar is-positive' : 'aura-profit-bar is-negative'} x={point.x - Math.max(5, 15 - visibleMonths.length / 3)} y={barY} width={Math.max(10, 30 - visibleMonths.length / 1.6)} height={point.barHeight} rx="4" /> : null}
                  {chartMode !== 'return' ? <circle className="aura-chart-point" cx={point.x} cy={point.y} r={selected ? 7 : 4} /> : null}
                  {point.month.increments > 0 ? <path className="aura-flow-marker is-in" d={`M ${point.x - 6} ${point.y + 22} L ${point.x} ${point.y + 12} L ${point.x + 6} ${point.y + 22} Z`} /> : null}
                  {point.month.decrements > 0 ? <path className="aura-flow-marker is-out" d={`M ${point.x - 6} ${point.y - 22} L ${point.x} ${point.y - 12} L ${point.x + 6} ${point.y - 22} Z`} /> : null}
                  {showLabel ? <text className="aura-axis-month" x={point.x} y={chartGeometry.returnBaseline + 44} textAnchor="middle">{point.month.shortLabel}</text> : null}
                </g>;
              })}
            </svg>

            {focusedMonth ? <aside className="aura-chart-capsule" aria-live="polite"><div><span>Mes enfocado</span><strong>{focusedMonth.label}</strong></div><dl><div><dt>Saldo final</dt><dd>{formatCurrency(focusedMonth.balance)}</dd></div><div><dt>TWR mensual</dt><dd className={focusedMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(focusedMonth.returnPct)}</dd></div><div><dt>Beneficio</dt><dd className={focusedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedMonth.profit)}</dd></div><div><dt>Flujo neto</dt><dd>{signedMoney(focusedMonth.netFlow)}</dd></div></dl></aside> : null}
            <div className="aura-chart-legend"><span><i className="is-balance" />Saldo</span><span><i className="is-profit" />{chartMode === 'return' ? 'TWR mensual' : 'Beneficio mensual'}</span><span><i className="is-in" />Aportación</span><span><i className="is-out" />Retirada</span></div>
            <div className="aura-minimap" aria-label="Minimapa temporal">{visibleMonths.map((month) => <button type="button" key={month.key} className={month.key === focusedMonth?.key ? 'is-active' : ''} aria-label={`Enfocar ${month.label}`} onClick={() => focusMonth(month.key, 'minimap')}><i style={{ height: `${Math.max(12, Math.abs(month.returnPct) / Math.max(...visibleMonths.map((item) => Math.abs(item.returnPct)), 0.01) * 100)}%` }} /></button>)}</div>
            {isChartExpanded ? <small className="aura-expanded-hint">ESC para cerrar · Pulsa cualquier punto para auditarlo</small> : null}
          </div>
        ) : <div className="aura-empty-state"><span aria-hidden="true">AQ</span><h3>Custodia inicial</h3><p>Los cierres mensuales aparecerán aquí cuando estén publicados.</p></div>}
      </section>

      {visibleMonths.length ? (
        <section className="aura-reconciliation" aria-label="Mesa de conciliación mensual">
          <div className="aura-section-heading"><div><span>Matriz de auditoría</span><h2>Mesa de conciliación mensual</h2><p>Cada fila demuestra cómo se forma el saldo final al céntimo.</p></div><nav aria-label="Cambiar mes auditado"><button type="button" disabled={focusedIndex <= 0} onClick={() => stepMonth(-1)}>← <span>Anterior</span></button><strong>{focusedIndex + 1} / {visibleMonths.length}</strong><button type="button" disabled={focusedIndex < 0 || focusedIndex >= visibleMonths.length - 1} onClick={() => stepMonth(1)}><span>Siguiente</span> →</button></nav></div>
          <div className="aura-table" role="table" aria-label="Conciliación de cierres mensuales">
            <div className="aura-table-head" role="row"><span role="columnheader">Periodo</span><span role="columnheader">Saldo inicial</span><span role="columnheader">Aportaciones</span><span role="columnheader">Retiradas</span><span role="columnheader">Beneficio</span><span role="columnheader">TWR mes</span><span role="columnheader">Saldo final</span></div>
            <div role="rowgroup">
              {[...visibleMonths].reverse().map((month) => {
                const expanded = expandedMonthKey === month.key;
                const selected = focusedMonth?.key === month.key;
                const difference = month.balance - month.openingBalance - month.increments + month.decrements - month.profit;
                return <React.Fragment key={month.key}><div className={`aura-table-row ${selected ? 'is-selected' : ''}`} role="row" onClick={() => toggleBreakdown(month.key)}><span role="cell" data-label="Periodo"><button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Cerrar' : 'Abrir'} detalle de ${month.label}`}><i>{expanded ? '−' : '+'}</i><strong>{month.label}</strong>{month.movements.length ? <small>Con movimientos</small> : null}</button></span><span role="cell" data-label="Saldo inicial">{formatCurrency(month.openingBalance)}</span><span role="cell" data-label="Aportaciones" className="is-positive">{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</span><span role="cell" data-label="Retiradas" className="is-negative">{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</span><span role="cell" data-label="Beneficio" className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.profit)}</span><span role="cell" data-label="TWR mes" className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(month.returnPct)}</span><span role="cell" data-label="Saldo final"><strong>{formatCurrency(month.balance)}</strong></span></div>{expanded ? <div className="aura-table-detail" role="row"><div role="cell" aria-label={`Desglose de ${month.label}`}><div className="aura-month-equation"><span><small>Saldo inicial</small><strong>{formatCurrency(month.openingBalance)}</strong></span><b>+</b><span><small>Aportaciones</small><strong>{formatCurrency(month.increments)}</strong></span><b>−</b><span><small>Retiradas</small><strong>{formatCurrency(month.decrements)}</strong></span><b>+</b><span><small>Beneficio</small><strong>{signedMoney(month.profit)}</strong></span><b>=</b><span className="is-final"><small>Saldo final</small><strong>{formatCurrency(month.balance)}</strong></span><em className={Math.abs(difference) <= 0.02 ? 'is-ok' : 'is-review'}>{Math.abs(difference) <= 0.02 ? 'Conciliación exacta' : `Ajuste ${formatCurrency(difference)}`}</em></div>{renderMonthBreakdown(month)}</div></div> : null}</React.Fragment>;
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="aura-movements" aria-label="Registro cronológico de movimientos">
        <div className="aura-section-heading"><div><span>Tesorería</span><h2>Registro cronológico de movimientos</h2><p>Aportaciones y retiradas incluidas dentro del horizonte seleccionado.</p></div><strong>{report.movements.filter((movement) => visibleMonths.some((month) => movement.iso.startsWith(month.key))).length} movimientos</strong></div>
        <div className="aura-movement-list">{report.movements.filter((movement) => visibleMonths.some((month) => movement.iso.startsWith(month.key))).sort((left, right) => right.iso.localeCompare(left.iso)).map((movement, index) => <article key={`${movement.iso}-${movement.type}-${index}`}><span className={movement.type === 'increment' ? 'is-in' : 'is-out'}>{movement.type === 'increment' ? '↑' : '↓'}</span><div><strong>{movement.type === 'increment' ? 'Aportación de capital' : 'Retirada de capital'}</strong><small>{formatDate(movement.iso)}</small></div><strong className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><small>Capital acumulado tras el movimiento: {formatCurrency(movement.balance)}</small></article>)}</div>
        {!report.movements.some((movement) => visibleMonths.some((month) => movement.iso.startsWith(month.key))) ? <p className="aura-no-movements">No hay aportaciones ni retiradas dentro del periodo visible.</p> : null}
      </section>

      <section className="aura-global-equation" aria-label="Conciliación integral">
        <div><span>Conciliación integral verificada</span><h2>El saldo se explica. No se interpreta.</h2></div>
        <div><span><small>Capital neto</small><strong>{formatCurrency(netCapital)}</strong></span><b>+</b><span><small>Beneficio acumulado</small><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong></span><b>=</b><span className="is-total"><small>Saldo actual</small><strong>{formatCurrency(visibleBalance)}</strong></span></div>
        <i className={isReconciled ? 'is-ok' : 'is-review'}>{isReconciled ? 'Cuadre exacto al céntimo' : 'Revisar conciliación'}</i>
      </section>

      <footer className="aura-footer"><span>AURA QUANTUM · JIGSA PRIVATE OFFICE</span><small>Terminal interactivo construido exclusivamente con cierres publicados y movimientos de capital registrados.</small></footer>
    </div>
  );
};
