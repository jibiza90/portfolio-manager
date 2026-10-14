import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './ActaReportPage.css';

interface ActaPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface ActaReportPageProps {
  report: ReportData;
  pendingCashMovements?: ActaPendingMovement[];
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

interface ActaMonth {
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
  ordinal: number;
}

type ActaPeriod = '3m' | '6m' | '12m' | 'all' | 'custom';

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
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const toneClass = (value: number) => value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral';

export const ActaReportPage: React.FC<ActaReportPageProps> = ({
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

  const months = useMemo<ActaMonth[]>(() => {
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const available = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(available[available.length - 1]?.month ?? '');

    return available.map((month, index) => {
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
        breakdown: breakdowns.get(key),
        ordinal: index + 1
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<ActaPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [openEntryKey, setOpenEntryKey] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ month: ActaMonth; left: number; top: number } | null>(null);
  const entryRefs = useRef(new Map<string, HTMLButtonElement>());

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey) ?? visibleMonths[visibleMonths.length - 1];
  const focusedIndex = focusedMonth ? visibleMonths.findIndex((month) => month.key === focusedMonth.key) : -1;
  const years = useMemo(() => Array.from(new Set(visibleMonths.map((month) => month.key.slice(0, 4)))), [visibleMonths]);
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setOpenEntryKey(null);
    setTooltip(null);
  }, [latestKey, months, report.clientId, report.createdAt]);

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusedKey)) {
      setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
      setOpenEntryKey(null);
    }
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  const focusEntry = useCallback((month: ActaMonth, scroll = false) => {
    setFocusedKey(month.key);
    if (scroll) {
      window.setTimeout(() => entryRefs.current.get(month.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
  }, []);

  const moveEntry = useCallback((direction: -1 | 1) => {
    if (!visibleMonths.length) return;
    const index = Math.max(0, visibleMonths.findIndex((month) => month.key === focusedMonth?.key));
    const next = visibleMonths[Math.max(0, Math.min(visibleMonths.length - 1, index + direction))];
    setFocusedKey(next.key);
    entryRefs.current.get(next.key)?.focus();
  }, [focusedMonth?.key, visibleMonths]);

  const toggleEntry = (month: ActaMonth) => {
    setFocusedKey(month.key);
    if (!month.breakdown) return;
    setOpenEntryKey((current) => current === month.key ? null : month.key);
  };

  const scrollToYear = (year: string) => {
    const month = visibleMonths.find((item) => item.key.startsWith(year));
    if (month) focusEntry(month, true);
  };

  const chartWidth = 760;
  const chartHeight = 160;
  const maxBalance = Math.max(...visibleMonths.map((month) => month.balance), 1) * 1.08;
  const pointX = (index: number) => visibleMonths.length <= 1 ? chartWidth / 2 : 24 + index * ((chartWidth - 48) / (visibleMonths.length - 1));
  const pointY = (value: number) => 136 - (Math.max(0, value) / maxBalance) * 104;
  const linePath = visibleMonths.map((month, index) => `${index ? 'L' : 'M'} ${pointX(index)} ${pointY(month.balance)}`).join(' ');
  const twrPct = (report.twrYtd ?? 0) * 100;
  const hasTotalReturn = report.rentabilidadDisponible !== false;

  const projectedPending = pending.map((movement, index) => {
    const prior = pending.slice(0, index).reduce((balance, item) => balance + (item.type === 'increment' ? item.amount : -item.amount), report.saldo);
    return { ...movement, projectedBalance: prior + (movement.type === 'increment' ? movement.amount : -movement.amount) };
  });

  return (
    <main className="acta-report" ref={rootRef}>
      <header className="acta-head">
        <div className="acta-title-block">
          <p>LIBRO DE CONCILIACIÓN · GROK 4.7</p>
          <h1>Acta</h1>
          <span>Cada cierre, con su comprobación.</span>
        </div>
        <div className="acta-head-month">
          <div><span>Beneficio del último mes</span><strong className={toneClass(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong></div>
          <div><span>Rentabilidad del último mes</span><strong className={toneClass(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong></div>
        </div>
        <div className="acta-head-actions"><span>{report.clientCode}</span><button type="button" onClick={onDownload}>Descargar PDF</button></div>
        <div className="acta-head-portfolio">
          <div><span>Saldo disponible</span><strong>{formatCurrency(visibleBalance)}</strong></div>
          <div><span>Beneficio acumulado</span><strong className={toneClass(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
          <div><span>TWR acumulado</span><strong>{signedPercent(twrPct)}</strong></div>
          <div><span>Rentabilidad total</span><strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div>
        </div>
      </header>

      <div className="acta-layout">
        <div className="acta-document">
          <section className="acta-equation" aria-label="Conciliación de cartera">
            <div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div><b>−</b>
            <div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div><b>+</b>
            <div><span>Beneficio acumulado</span><strong>{signedMoney(report.beneficioTotal)}</strong></div><b>=</b>
            <div><span>Saldo disponible</span><strong>{formatCurrency(visibleBalance)}</strong></div>
            {pending.length ? <small>Incluye movimientos en tránsito.</small> : null}
          </section>

          {pending.length ? (
            <section className="acta-pending" aria-labelledby="acta-pending-title">
              <header><div><span>ANEXO EN TRÁNSITO</span><h2 id="acta-pending-title">Actualización de capital</h2></div><strong>{pending.length} {pending.length === 1 ? 'movimiento' : 'movimientos'}</strong></header>
              {projectedPending.map((movement, index) => (
                <div key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><small>Saldo proyectado {formatCurrency(movement.projectedBalance)}</small></div>
              ))}
              <p>Posterior al último cierre. Sin rentabilidad hasta su publicación.</p>
            </section>
          ) : null}

          <section className="acta-controls" aria-label="Periodo del informe">
            <div className="acta-periods">
              {(['3m', '6m', '12m', 'all'] as const).map((option) => <button key={option} type="button" className={period === option ? 'is-active' : ''} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option === 'all' ? 'Todo' : option.toUpperCase()}</button>)}
              <button type="button" className={period === 'custom' ? 'is-active' : ''} aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>Personalizado</button>
            </div>
            {period === 'custom' ? <div className="acta-custom"><label>Desde<select value={customStart} onChange={(event) => setCustomStart(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
          </section>

          <nav className="acta-year-index" aria-label="Años del informe">
            <span>ÍNDICE</span>
            {years.map((year) => <button key={year} type="button" className={focusedMonth?.key.startsWith(year) ? 'is-active' : ''} onClick={() => scrollToYear(year)}>{year}</button>)}
          </nav>

          <section className="acta-chart" aria-labelledby="acta-chart-title">
            <header><div><span>ÍNDICE DE SALDOS</span><h2 id="acta-chart-title">Secuencia de cierres</h2></div><p>{visibleMonths[0]?.shortLabel ?? '—'} — {visibleMonths[visibleMonths.length - 1]?.shortLabel ?? '—'}</p></header>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-labelledby="acta-chart-svg-title">
              <title id="acta-chart-svg-title">Evolución del saldo final por cierre mensual</title>
              <line x1="24" y1="136" x2="736" y2="136" className="acta-chart-axis" />
              {focusedIndex >= 0 ? <line x1={pointX(focusedIndex)} y1="18" x2={pointX(focusedIndex)} y2="136" className="acta-chart-focus-guide" /> : null}
              {linePath ? <path d={linePath} className="acta-chart-line" /> : null}
              {visibleMonths.map((month, index) => {
                const x = pointX(index);
                const y = pointY(month.balance);
                return <g key={month.key} className={month.key === focusedMonth?.key ? 'is-focused' : ''} role="button" tabIndex={0} aria-label={`${month.label}, saldo final ${formatCurrency(month.balance)}`} onClick={() => focusEntry(month, true)} onFocus={() => setFocusedKey(month.key)} onMouseEnter={(event) => setTooltip({ month, left: Math.min(window.innerWidth - 230, event.clientX + 12), top: Math.max(12, event.clientY - 72) })} onMouseLeave={() => setTooltip(null)} onKeyDown={(event) => { if (event.key === 'Enter') focusEntry(month, true); }}>
                  <rect x={x - 13} y="12" width="26" height="132" className="acta-chart-hit" />
                  <circle cx={x} cy={y} r={month.key === focusedMonth?.key ? 4.5 : 3} />
                  {month.increments > 0 ? <line x1={x - (month.decrements > 0 ? 3 : 0)} y1="141" x2={x - (month.decrements > 0 ? 3 : 0)} y2="147" className="acta-flow-in" /> : null}
                  {month.decrements > 0 ? <line x1={x + (month.increments > 0 ? 3 : 0)} y1="141" x2={x + (month.increments > 0 ? 3 : 0)} y2="147" className="acta-flow-out" /> : null}
                </g>;
              })}
              {visibleMonths.length ? <><text x="24" y="156" className="acta-chart-caption">{visibleMonths[0].shortLabel}</text><text x="736" y="156" textAnchor="end" className="acta-chart-caption">{visibleMonths[visibleMonths.length - 1].shortLabel}</text><text x={pointX(0)} y={Math.max(14, pointY(visibleMonths[0].balance) - 9)} textAnchor="middle" className="acta-chart-value">{formatCurrency(visibleMonths[0].balance)}</text>{visibleMonths.length > 1 ? <text x={pointX(visibleMonths.length - 1)} y={Math.max(14, pointY(visibleMonths[visibleMonths.length - 1].balance) - 9)} textAnchor="middle" className="acta-chart-value">{formatCurrency(visibleMonths[visibleMonths.length - 1].balance)}</text> : <text x="380" y="128" textAnchor="middle" className="acta-chart-caption">Un solo cierre</text>}</> : <text x="380" y="84" textAnchor="middle" className="acta-chart-caption">Sin cierres publicados</text>}
            </svg>
            <table className="sr-only"><caption>Saldos mensuales del acta</caption><thead><tr><th>Mes</th><th>Saldo final</th></tr></thead><tbody>{visibleMonths.map((month) => <tr key={month.key}><td>{month.label}</td><td>{formatCurrency(month.balance)}</td></tr>)}</tbody></table>
          </section>

          <section className="acta-entries" aria-labelledby="acta-entries-title">
            <header><span>REGISTRO CRONOLÓGICO</span><h2 id="acta-entries-title">Asientos mensuales</h2><p>Cada cierre se presenta como una identidad contable verificable.</p></header>
            <div role="list" aria-keyshortcuts="ArrowUp ArrowDown Escape">
              {visibleMonths.map((month) => {
                const isOpen = openEntryKey === month.key;
                const isFocused = focusedMonth?.key === month.key;
                return (
                  <article key={month.key} role="listitem" className={`acta-entry${isFocused ? ' is-focused' : ''}${isOpen ? ' is-open' : ''}`}>
                    <button ref={(node) => { if (node) entryRefs.current.set(month.key, node); else entryRefs.current.delete(month.key); }} type="button" className="acta-entry-toggle" aria-expanded={month.breakdown ? isOpen : undefined} onClick={() => toggleEntry(month)} onFocus={() => setFocusedKey(month.key)} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); moveEntry(-1); } if (event.key === 'ArrowDown') { event.preventDefault(); moveEntry(1); } if (event.key === 'Escape') setOpenEntryKey(null); }}>
                      <span className="acta-entry-number">Asiento {String(month.ordinal).padStart(2, '0')}</span><strong className="acta-entry-month">{month.label}</strong>
                      <span className="acta-entry-cell"><small>Saldo inicial</small><b>{formatCurrency(month.opening)}</b></span>
                      <span className="acta-entry-cell"><small>Aportaciones</small><b>{formatCurrency(month.increments)}</b></span>
                      <span className="acta-entry-cell"><small>Retiradas</small><b>{formatCurrency(month.decrements)}</b></span>
                      <span className="acta-entry-cell"><small>Saldo final</small><b>{formatCurrency(month.balance)}</b></span>
                      <span className="acta-entry-result"><small>Beneficio del mes</small><b className={toneClass(month.profit)}>{signedMoney(month.profit)}</b><i>·</i><small>Rentabilidad del mes</small><b className={toneClass(month.returnPct)}>{signedPercent(month.returnPct)}</b></span>
                      <span className="acta-entry-action">{month.breakdown ? (isOpen ? 'Ocultar tramos' : 'Ver tramos') : 'Cierre verificado'}</span>
                    </button>
                    {isOpen && month.breakdown ? (
                      <div className="acta-entry-detail">
                        <div className="acta-detail-head"><span>Tramo</span><span>Capital</span><span>Rentabilidad aplicada</span><span>Beneficio del tramo</span></div>
                        <div><span>Posición inicial</span><span>{formatCurrency(month.breakdown.initialCapital)}</span><span>{signedPercent(month.breakdown.initialReturnPct * 100)}</span><span>{signedMoney(month.breakdown.initialProfit)}</span></div>
                        {month.breakdown.contributions.map((item, index) => <div key={`${item.iso}-${index}`}><span>Aportación {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}
                        {(month.breakdown.withdrawals ?? []).map((item, index) => <div key={`${item.iso}-${index}`}><span>Retirada {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}
                        <div className="acta-detail-total"><span>Suma de tramos</span><span>—</span><span>{Math.abs(month.breakdown.totalProfit - month.profit) < 0.01 ? 'Conciliado' : '—'}</span><span>{signedMoney(month.breakdown.totalProfit)}</span></div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!visibleMonths.length ? <p className="acta-empty">Sin cierres publicados</p> : null}
            </div>
          </section>

          <section className="acta-movements" aria-labelledby="acta-movements-title">
            <header><span>TESORERÍA</span><h2 id="acta-movements-title">Movimientos</h2></header>
            <div className="acta-movement-head"><span>Fecha</span><span>Tipo</span><span>Importe</span><span>Saldo tras movimiento</span></div>
            {projectedPending.map((movement, index) => <div className="acta-movement-row is-pending" key={`pending-${movement.iso}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}<small>Posterior al último cierre</small></span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{formatCurrency(movement.projectedBalance)}</span></div>)}
            {[...(report.movements ?? [])].sort((left, right) => right.iso.localeCompare(left.iso)).map((movement, index) => <div className="acta-movement-row" key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><span>{formatCurrency(movement.balance)}</span></div>)}
            {!pending.length && !(report.movements ?? []).length ? <p className="acta-empty">Sin movimientos de tesorería</p> : null}
          </section>

          <footer className="acta-colophon"><span>ACTA · {report.clientCode}</span><p>Documento de lectura. No modifica los datos publicados.</p><small>El PDF corresponde al informe oficial publicado.</small></footer>
        </div>

        <aside className="acta-margin" aria-label="Cifras de cartera completa">
          <span>CARTERA COMPLETA</span>
          <div><small>Saldo disponible</small><strong>{formatCurrency(visibleBalance)}</strong></div>
          <div><small>Beneficio acumulado</small><strong className={toneClass(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
          <div><small>TWR acumulado</small><strong>{signedPercent(twrPct)}</strong></div>
          <div><small>Rentabilidad total</small><strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div>
          <p>Estas cifras corresponden a la cartera completa y no cambian al filtrar el libro.</p>
          {focusedMonth ? (
            <section className="acta-margin-focus" aria-live="polite">
              <span>ASIENTO CONSULTADO</span>
              <strong>{focusedMonth.label}</strong>
              <small>Asiento {String(focusedMonth.ordinal).padStart(2, '0')} de {visibleMonths.length}</small>
              <dl>
                <div><dt>Saldo inicial</dt><dd>{formatCurrency(focusedMonth.opening)}</dd></div>
                <div><dt>Beneficio</dt><dd className={toneClass(focusedMonth.profit)}>{signedMoney(focusedMonth.profit)}</dd></div>
                <div><dt>Rentabilidad</dt><dd className={toneClass(focusedMonth.returnPct)}>{signedPercent(focusedMonth.returnPct)}</dd></div>
                <div><dt>Saldo final</dt><dd>{formatCurrency(focusedMonth.balance)}</dd></div>
              </dl>
            </section>
          ) : null}
        </aside>
      </div>

      {tooltip ? <div className="acta-tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="tooltip"><strong>{tooltip.month.label}</strong><span>Saldo final {formatCurrency(tooltip.month.balance)}</span></div> : null}
    </main>
  );
};
