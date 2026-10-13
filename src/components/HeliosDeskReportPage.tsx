import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './HeliosDeskReportPage.css';

interface HeliosPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface HeliosDeskReportPageProps {
  report: ReportData;
  pendingCashMovements?: HeliosPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface HeliosMonth {
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

type PeriodPreset = 'all' | '12m' | '6m' | '3m' | 'custom';

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

const compactMoney = (value: number) => `${new Intl.NumberFormat('es-ES', {
  notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  maximumFractionDigits: 0
}).format(value)} €`;

const sumMovements = (
  movements: Array<{ type: string; amount: number }>,
  type: 'increment' | 'decrement'
) => movements.filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const niceCeiling = (value: number) => {
  if (value <= 0) return 10000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

export const HeliosDeskReportPage: React.FC<HeliosDeskReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
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

  const months = useMemo<HeliosMonth[]>(() => {
    const breakdowns = new Map(
      (report.contributionBreakdowns ?? []).map((breakdown) => [monthToKey(breakdown.month), breakdown])
    );
    const available = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(available[available.length - 1]?.month ?? '');

    return available.map((month) => {
      const key = monthToKey(month.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(movements, 'increment');
      const decrements = sumMovements(movements, 'decrement');
      const profit = Number.isFinite(month.profit) ? month.profit : 0;
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const breakdown = breakdowns.get(key);
      // The ledger opening is derived from the published close so every row reconciles exactly.
      const opening = balance - profit - increments + decrements;
      const returnPct = key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
        ? report.rentabilidadUltimoMes
        : Number.isFinite(month.profitPct) ? month.profitPct : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        balance,
        opening,
        profit,
        returnPct,
        increments,
        decrements,
        movements,
        breakdown
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setExpandedMonths(new Set());
    setIsFullscreen(false);
  }, [latestKey, months, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  useEffect(() => {
    if (!visibleMonths.length) return;
    if (!visibleMonths.some((month) => month.key === focusedKey)) {
      setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
    }
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    const scroller = chartScrollRef.current;
    if (!scroller) return undefined;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [period, visibleMonths.length]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [isFullscreen]);

  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey)
    ?? visibleMonths[visibleMonths.length - 1];
  const focusedIndex = visibleMonths.findIndex((month) => month.key === focusedMonth?.key);
  const periodLabel = visibleMonths.length
    ? `${visibleMonths[0].shortLabel} — ${visibleMonths[visibleMonths.length - 1].shortLabel}`
    : 'Sin cierres publicados';

  const chart = useMemo(() => {
    const width = Math.max(960, visibleMonths.length * 76);
    const height = 360;
    const left = 72;
    const right = width - 28;
    const top = 30;
    const bottom = 292;
    const maxValue = niceCeiling(Math.max(1, ...visibleMonths.map((month) => month.balance)) * 1.08);
    const x = (index: number) => visibleMonths.length === 1
      ? (left + right) / 2
      : left + index / (visibleMonths.length - 1) * (right - left);
    const y = (value: number) => bottom - Math.max(0, value) / maxValue * (bottom - top);
    const points = visibleMonths.map((month, index) => ({ month, x: x(index), y: y(month.balance) }));
    const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const area = points.length
      ? `${line} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`
      : '';
    return { width, height, left, right, top, bottom, maxValue, points, line, area };
  }, [visibleMonths]);

  const maxProfit = Math.max(1, ...visibleMonths.map((month) => Math.abs(month.profit)));
  const firstMonth = months[0]?.label ?? 'el primer cierre';
  const focusedGeometry = chart.points.find((point) => point.month.key === focusedMonth?.key);

  const focusMonth = useCallback((key: string, source: string) => {
    setFocusedKey(key);
    onAnalyticsEvent?.({ type: 'helios_month_focus', label: key, metadata: { source } });
  }, [onAnalyticsEvent]);

  const stepFocus = (direction: -1 | 1) => {
    const month = visibleMonths[focusedIndex + direction];
    if (month) focusMonth(month.key, 'keyboard');
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    focusMonth(key, 'monthly-ledger');
  };

  const kpis = [
    { label: 'Saldo disponible', value: formatCurrency(visibleBalance), tone: 'hero', help: pending.length ? `${pending.length} movimiento${pending.length === 1 ? '' : 's'} posterior${pending.length === 1 ? '' : 'es'} al cierre incluido${pending.length === 1 ? '' : 's'}.` : 'Valor actual de la cartera.' },
    { label: `Beneficio ${months[months.length - 1]?.label ?? 'último mes'}`, value: signedMoney(report.beneficioUltimoMes), tone: report.beneficioUltimoMes >= 0 ? 'positive' : 'negative', help: 'Resultado generado durante el último mes publicado.' },
    { label: `Rentabilidad ${months[months.length - 1]?.label ?? 'último mes'}`, value: signedPercent(report.rentabilidadUltimoMes), tone: report.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative', help: 'Rentabilidad TWR del último cierre mensual.' },
    { label: 'Beneficio acumulado', value: signedMoney(report.beneficioTotal), tone: report.beneficioTotal >= 0 ? 'positive' : 'negative', help: 'Resultado total generado desde el inicio.' },
    { label: 'TWR acumulado', value: signedPercent((report.twrYtd ?? 0) * 100), tone: (report.twrYtd ?? 0) >= 0 ? 'positive' : 'negative', help: `Rendimiento de la estrategia desde ${firstMonth}, aislando movimientos de capital.` },
    { label: 'Rentabilidad total', value: report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad), tone: report.rentabilidad >= 0 ? 'positive' : 'negative', help: 'Beneficio acumulado en relación con el capital neto aportado.' },
    { label: 'Capital aportado', value: formatCurrency(visibleContributed), tone: 'increment', help: 'Suma de todas las aportaciones registradas.' },
    { label: 'Capital retirado', value: formatCurrency(visibleWithdrawn), tone: 'decrement', help: 'Suma de todas las retiradas registradas.' }
  ];

  return (
    <div className={`helios-report ${isFullscreen ? 'has-fullscreen-chart' : ''}`} ref={rootRef} role="document">
      <header className="helios-header">
        <div>
          <small>JIGSA CAPITAL · PRIVATE OFFICE</small>
          <h1>HELIOS</h1>
          <p>El escritorio matinal del patrimonio</p>
        </div>
        <div className="helios-header-actions">
          <span><small>Cuenta patrimonial</small><strong>{report.clientCode}</strong></span>
          <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'helios_pdf_download', label: periodLabel }); void onDownload?.(); }}><b>↓</b> Descargar PDF</button>
        </div>
      </header>

      <div className="helios-layout">
        <aside className="helios-rail" aria-label="Posición patrimonial">
          {kpis.map((kpi) => <article className={`helios-kpi is-${kpi.tone}`} key={kpi.label} tabIndex={0} title={kpi.help}><small>{kpi.label}</small><strong>{kpi.value}</strong><p>{kpi.help}</p></article>)}
        </aside>

        <main className="helios-main">
          {pending.length ? <section className="helios-pending" role="status">
            <div><i /><span><small>Capital en tránsito</small><strong>{pending.length} movimiento{pending.length === 1 ? '' : 's'} incorporado{pending.length === 1 ? '' : 's'} al saldo</strong><p>Se consolidará con rentabilidad cuando se publique el próximo cierre.</p></span></div>
            <div>{pending.map((movement, index) => <span key={`${movement.iso}-${index}`}><small>{formatDate(movement.iso)} · {movement.type === 'increment' ? 'Aportación' : 'Retirada'}</small><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></span>)}</div>
          </section> : null}

          <section className="helios-period" aria-label="Periodo del informe">
            <div><small>Periodo de lectura</small><strong>{periodLabel}</strong><p>{visibleMonths.length} cierres mensuales auditables</p></div>
            <div className="helios-period-controls" role="group" aria-label="Seleccionar periodo">
              {([['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses'], ['all', 'Todo']] as Array<[PeriodPreset, string]>).map(([value, label]) => <button type="button" key={value} className={period === value ? 'is-active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
              <button type="button" className={period === 'custom' ? 'is-active' : ''} aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>Personalizado</button>
            </div>
            {period === 'custom' ? <div className="helios-custom-period"><label>Desde<select value={customStart} onChange={(event) => setCustomStart(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
          </section>

          <section className={`helios-custody ${isFullscreen ? 'is-fullscreen' : ''}`} aria-label="Línea de custodia patrimonial">
            <header className="helios-section-heading"><div><small>Línea de custodia</small><h2>Evolución del patrimonio</h2><p>Saldo de cierre, movimientos de capital y rendimiento mensual en una única lectura.</p></div><button type="button" onClick={() => { setIsFullscreen((value) => !value); onAnalyticsEvent?.({ type: 'chart_expand_request', label: 'Helios linea de custodia' }); }}>{isFullscreen ? '✕ Cerrar' : '⛶ Ampliar'}</button></header>
            {visibleMonths.length ? <div className="helios-chart-grid">
              <nav className="helios-spine" aria-label="Espina cronológica">{visibleMonths.map((month) => <button type="button" key={month.key} className={month.key === focusedMonth?.key ? 'is-active' : ''} aria-pressed={month.key === focusedMonth?.key} onClick={() => focusMonth(month.key, 'spine')}><i /><span>{month.shortLabel}</span></button>)}</nav>
              <div className="helios-chart-zone">
                <div className="helios-chart-hud" aria-live="polite"><span><small>Mes observado</small><strong>{focusedMonth?.label}</strong></span><span><small>Saldo final</small><strong>{formatCurrency(focusedMonth?.balance ?? 0)}</strong></span><span><small>Beneficio</small><strong className={(focusedMonth?.profit ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedMonth?.profit ?? 0)}</strong></span><span><small>TWR mensual</small><strong className={(focusedMonth?.returnPct ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(focusedMonth?.returnPct ?? 0)}</strong></span></div>
                <div className="helios-chart-scroll" ref={chartScrollRef}>
                  <svg className="helios-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} style={{ minWidth: `${chart.width}px` }} role="application" tabIndex={0} aria-label={`Evolución patrimonial de ${periodLabel}. Utiliza las flechas para cambiar de mes.`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } }}>
                    <defs><linearGradient id="helios-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8c6d2f" stopOpacity=".18" /><stop offset="1" stopColor="#8c6d2f" stopOpacity="0" /></linearGradient></defs>
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => { const y = chart.bottom - ratio * (chart.bottom - chart.top); return <g className="helios-gridline" key={ratio}><line x1={chart.left} x2={chart.right} y1={y} y2={y} /><text x={chart.left - 12} y={y + 4} textAnchor="end">{compactMoney(chart.maxValue * ratio)}</text></g>; })}
                    <path className="helios-chart-area" d={chart.area} />
                    <path className="helios-chart-line" d={chart.line} />
                    {chart.points.flatMap((point) => point.month.movements.map((movement, index) => { const offset = (index - (point.month.movements.length - 1) / 2) * 24; return <g key={`${movement.iso}-${index}`} className={`helios-flow ${movement.type === 'increment' ? 'is-increment' : 'is-decrement'}`} transform={`translate(${point.x + offset} ${point.y})`}><line y1="-8" y2="-38" /><path d={movement.type === 'increment' ? 'M -6 -31 L 0 -42 L 6 -31 Z' : 'M -6 -42 L 0 -31 L 6 -42 Z'} /><text y="-49" textAnchor="middle">{movement.type === 'increment' ? '+' : '−'}{compactMoney(movement.amount)}</text></g>; }))}
                    {focusedGeometry ? <g className="helios-crosshair" transform={`translate(${focusedGeometry.x} 0)`}><line y1={chart.top} y2={chart.bottom} /></g> : null}
                    {chart.points.map((point) => <g key={point.month.key} role="button" tabIndex={0} aria-label={`${point.month.label}: saldo ${formatCurrency(point.month.balance)}`} onClick={() => focusMonth(point.month.key, 'chart-point')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusMonth(point.month.key, 'chart-keyboard'); } }}><circle className={point.month.key === focusedMonth?.key ? 'helios-point is-active' : 'helios-point'} cx={point.x} cy={point.y} r={point.month.key === focusedMonth?.key ? 6 : 4} /><text className="helios-value-label" x={point.x} y={point.y + (chart.points.indexOf(point) % 2 ? 24 : -15)} textAnchor="middle">{compactMoney(point.month.balance)}</text><text className="helios-month-label" x={point.x} y={chart.bottom + 34} textAnchor="middle">{point.month.shortLabel}</text></g>)}
                  </svg>
                </div>
                <div className="helios-chart-legend"><span><i className="is-balance" />Saldo de cierre</span><span><i className="is-increment" />▲ Aportación</span><span><i className="is-decrement" />▼ Retirada</span>{pending.length ? <span><i className="is-pending" />Capital en tránsito</span> : null}</div>
              </div>
            </div> : <div className="helios-empty"><b>H</b><h3>La mesa está preparada</h3><p>La evolución aparecerá tras el primer cierre mensual publicado.</p></div>}
            {isFullscreen ? <span className="helios-fullscreen-hint">Usa las flechas para recorrer los meses · Pulsa ESC para salir</span> : null}
          </section>

          <section className="helios-returns" aria-label="Rentabilidad mensual">
            <header className="helios-section-heading"><div><small>Rendimiento registrado</small><h2>Rentabilidad mensual</h2><p>Magnitud y signo de cada cierre de inversión.</p></div></header>
            <div className="helios-histogram" style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(48px, 1fr))` }}>{visibleMonths.map((month) => <button type="button" key={month.key} className={month.key === focusedMonth?.key ? 'is-active' : ''} onClick={() => focusMonth(month.key, 'histogram')} aria-label={`${month.label}: ${signedPercent(month.returnPct)}`}><span>{signedPercent(month.returnPct)}</span><i className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'} style={{ height: `${Math.max(4, Math.abs(month.returnPct) / Math.max(1, ...visibleMonths.map((item) => Math.abs(item.returnPct))) * 48)}px` }} /><small>{month.shortLabel}</small></button>)}</div>
          </section>

          <section className="helios-month-rail" aria-label="Raíl mensual">{visibleMonths.map((month) => <button type="button" key={month.key} className={month.key === focusedMonth?.key ? 'is-active' : ''} onClick={() => focusMonth(month.key, 'month-rail')}><small>{month.shortLabel}</small><strong>{formatCurrency(month.balance)}</strong><span className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.profit)}</span></button>)}</section>

          <section className="helios-ledger" aria-label="Detalle mensual auditado">
            <header className="helios-section-heading"><div><small>Registro mensual</small><h2>Cierres conciliados</h2><p>Saldo inicial, movimientos, beneficio y posición final de cada periodo.</p></div></header>
            <div className="helios-table" role="table">
              <div className="helios-table-head" role="row"><span role="columnheader">Mes</span><span role="columnheader">Saldo inicial</span><span role="columnheader">Aportaciones</span><span role="columnheader">Retiradas</span><span role="columnheader">Beneficio</span><span role="columnheader">TWR mes</span><span role="columnheader">Saldo final</span><span role="columnheader">Detalle</span></div>
              <div role="rowgroup">{[...visibleMonths].reverse().map((month) => {
                const canExpand = Boolean(month.breakdown || month.movements.length);
                const isExpanded = expandedMonths.has(month.key);
                const reconciled = Math.abs(month.opening + month.increments - month.decrements + month.profit - month.balance) <= 0.02;
                return <React.Fragment key={month.key}><button type="button" role="row" className={`helios-table-row ${month.key === focusedMonth?.key ? 'is-active' : ''}`} onClick={() => canExpand ? toggleMonth(month.key) : focusMonth(month.key, 'ledger-row')} aria-expanded={canExpand ? isExpanded : undefined}><span role="cell" data-label="Mes"><strong>{month.label}</strong>{month.movements.length ? <small>{month.movements.length} movimiento{month.movements.length === 1 ? '' : 's'}</small> : null}</span><span role="cell" data-label="Saldo inicial">{formatCurrency(month.opening)}</span><span role="cell" data-label="Aportaciones" className="is-increment">{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</span><span role="cell" data-label="Retiradas" className="is-decrement">{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</span><span role="cell" data-label="Beneficio" className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.profit)}</span><span role="cell" data-label="TWR mes" className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(month.returnPct)}</span><span role="cell" data-label="Saldo final"><strong>{formatCurrency(month.balance)}</strong></span><span role="cell" data-label="Detalle" className="helios-detail-toggle">{canExpand ? (isExpanded ? '−' : '+') : '·'}</span></button>{isExpanded ? <div className="helios-breakdown" role="row"><div><small>Conciliación del cierre</small><strong className={reconciled ? 'is-positive' : 'is-negative'}>{reconciled ? 'Conciliado ✓' : 'Revisar cierre'}</strong></div><div className="helios-breakdown-equation"><span>Inicial <b>{formatCurrency(month.opening)}</b></span><i>+</i><span>Aportaciones <b>{formatCurrency(month.increments)}</b></span><i>−</i><span>Retiradas <b>{formatCurrency(month.decrements)}</b></span><i>+</i><span>Beneficio <b>{signedMoney(month.profit)}</b></span><i>=</i><span>Final <b>{formatCurrency(month.balance)}</b></span></div>{month.breakdown ? <div className="helios-tranches"><article><small>Posición inicial del mes</small><strong>{formatCurrency(month.breakdown.initialCapital)}</strong><span>{signedPercent(month.breakdown.initialReturnPct * 100)} · {signedMoney(month.breakdown.initialProfit)}</span></article>{month.breakdown.contributions.map((contribution, index) => <article key={`${contribution.iso}-${index}`}><small>Aportación incorporada el {formatDate(contribution.iso)}</small><strong>+{formatCurrency(contribution.amount)}</strong><span>{signedPercent(contribution.returnPct * 100)} · {signedMoney(contribution.profit)}</span></article>)}{(month.breakdown.withdrawals ?? []).map((withdrawal, index) => <article key={`${withdrawal.iso}-${index}`}><small>Posición retirada el {formatDate(withdrawal.iso)}</small><strong>−{formatCurrency(withdrawal.amount)}</strong><span>{withdrawal.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(withdrawal.returnPct * 100)} · ${signedMoney(withdrawal.profit)}`}</span></article>)}</div> : <div className="helios-tranches">{month.movements.map((movement, index) => <article key={`${movement.iso}-${index}`}><small>{movement.type === 'increment' ? 'Aportación' : 'Retirada'} · {formatDate(movement.iso)}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>Movimiento consolidado</span></article>)}</div>}</div> : null}</React.Fragment>;
              })}</div>
            </div>
          </section>
        </main>
      </div>

      <footer className="helios-footer">
        <div><small>Ecuación de custodia</small><p><span>Capital neto <strong>{formatCurrency(visibleNetCapital)}</strong></span><b>+</b><span>Beneficio acumulado <strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong></span><b>=</b><span>Saldo disponible <strong>{formatCurrency(visibleBalance)}</strong></span></p></div>
        <p>El TWR muestra la evolución de la estrategia aislando aportaciones y retiradas. Diseño: <strong>GLM 5.3MAX</strong>.</p>
      </footer>
    </div>
  );
};
