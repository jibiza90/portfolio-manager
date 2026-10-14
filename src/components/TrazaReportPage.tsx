import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './TrazaReportPage.css';

interface TrazaPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface TrazaReportPageProps {
  report: ReportData;
  pendingCashMovements?: TrazaPendingMovement[];
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

interface TrazaMonth {
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

interface TrazaDocket {
  key: string;
  ordinal: number;
  iso: string;
  amount: number;
  monthKey: string;
  month?: TrazaMonth;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
  returnPct?: number;
  profit?: number;
}

type TrazaPeriod = '3m' | '6m' | '12m' | 'all' | 'custom';

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

const formatDate = (iso: string, long = false) => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', long
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : undefined);
};

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const toneClass = (value: number) => value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral';

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

const matchKey = (iso: string, amount: number) => `${iso}|${amount.toFixed(6)}`;

export const TrazaReportPage: React.FC<TrazaReportPageProps> = ({
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
  const twrPct = (report.twrYtd ?? 0) * 100;
  const hasTotalReturn = report.rentabilidadDisponible !== false;

  const months = useMemo<TrazaMonth[]>(() => {
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

  const dockets = useMemo<TrazaDocket[]>(() => {
    const contributionPools = new Map<string, Array<{
      breakdown: NonNullable<ReportData['contributionBreakdowns']>[number];
      returnPct: number;
      profit: number;
    }>>();
    (report.contributionBreakdowns ?? []).forEach((breakdown) => {
      breakdown.contributions.forEach((contribution) => {
        const key = matchKey(contribution.iso, contribution.amount);
        const values = contributionPools.get(key) ?? [];
        values.push({ breakdown, returnPct: contribution.returnPct, profit: contribution.profit });
        contributionPools.set(key, values);
      });
    });
    const monthMap = new Map(months.map((month) => [month.key, month]));
    return (report.movements ?? [])
      .filter((movement) => movement.type === 'increment')
      .sort((left, right) => left.iso.localeCompare(right.iso))
      .map((movement, index) => {
        const match = contributionPools.get(matchKey(movement.iso, movement.amount))?.shift();
        const monthKey = movement.iso.slice(0, 7);
        return {
          key: `${movement.iso}-${movement.amount.toFixed(6)}-${index}`,
          ordinal: index + 1,
          iso: movement.iso,
          amount: movement.amount,
          monthKey,
          month: monthMap.get(monthKey),
          breakdown: match?.breakdown,
          returnPct: match?.returnPct,
          profit: match?.profit
        };
      });
  }, [months, report.contributionBreakdowns, report.movements]);

  const latestMonthKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<TrazaPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestMonthKey);
  const [activeKey, setActiveKey] = useState(dockets[dockets.length - 1]?.key ?? '');
  const [showMonth, setShowMonth] = useState(false);
  const fileRef = useRef<HTMLElement>(null);
  const docketRefs = useRef(new Map<string, HTMLButtonElement>());

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const visibleDockets = useMemo(() => dockets.filter((docket) => !periodStart || (docket.monthKey >= periodStart && docket.monthKey <= periodEnd)), [dockets, periodEnd, periodStart]);
  const activeDocket = visibleDockets.find((docket) => docket.key === activeKey) ?? visibleDockets[visibleDockets.length - 1];
  const closedDocketCount = visibleDockets.filter((docket) => docket.returnPct !== undefined && docket.profit !== undefined).length;

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestMonthKey);
    setActiveKey(dockets[dockets.length - 1]?.key ?? '');
    setShowMonth(false);
  }, [dockets, latestMonthKey, months, report.clientId, report.createdAt]);

  useEffect(() => {
    if (visibleDockets.length && !visibleDockets.some((docket) => docket.key === activeKey)) {
      setActiveKey(visibleDockets[visibleDockets.length - 1].key);
      setShowMonth(false);
    }
  }, [activeKey, visibleDockets]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  const activateDocket = useCallback((docket: TrazaDocket, focusFile = false) => {
    setActiveKey(docket.key);
    setShowMonth(false);
    onAnalyticsEvent?.({ type: 'report_detail_open', label: `Traza expediente ${docket.ordinal}` });
    if (focusFile) window.setTimeout(() => fileRef.current?.focus(), 0);
  }, [onAnalyticsEvent]);

  const moveDocket = useCallback((direction: -1 | 1) => {
    if (!visibleDockets.length) return;
    const currentIndex = Math.max(0, visibleDockets.findIndex((docket) => docket.key === activeDocket?.key));
    const next = visibleDockets[Math.max(0, Math.min(visibleDockets.length - 1, currentIndex + direction))];
    setActiveKey(next.key);
    setShowMonth(false);
    docketRefs.current.get(next.key)?.focus();
  }, [activeDocket?.key, visibleDockets]);

  const projectedPending = pending.map((movement, index) => {
    const prior = pending.slice(0, index).reduce((balance, item) => balance + (item.type === 'increment' ? item.amount : -item.amount), report.saldo);
    return { ...movement, projectedBalance: prior + (movement.type === 'increment' ? movement.amount : -movement.amount) };
  });

  const withdrawalMatches = useMemo(() => {
    const pools = new Map<string, Array<{ returnPct?: number; profit: number }>>();
    (report.contributionBreakdowns ?? []).forEach((breakdown) => {
      (breakdown.withdrawals ?? []).forEach((withdrawal) => {
        const key = matchKey(withdrawal.iso, withdrawal.amount);
        const values = pools.get(key) ?? [];
        values.push({ returnPct: withdrawal.returnPct, profit: withdrawal.profit });
        pools.set(key, values);
      });
    });
    return (report.movements ?? [])
      .filter((movement) => movement.type === 'decrement' && (!periodStart || (movement.iso.slice(0, 7) >= periodStart && movement.iso.slice(0, 7) <= periodEnd)))
      .sort((left, right) => right.iso.localeCompare(left.iso))
      .map((movement, index) => ({ ...movement, key: `${movement.iso}-${index}`, match: pools.get(matchKey(movement.iso, movement.amount))?.shift() }));
  }, [periodEnd, periodStart, report.contributionBreakdowns, report.movements]);

  const movementMonths = useMemo(() => new Set((report.movements ?? []).map((movement) => movement.iso.slice(0, 7))), [report.movements]);
  const quietMonths = visibleMonths.filter((month) => !movementMonths.has(month.key));
  const activeInitialCapital = activeDocket?.breakdown?.initialCapital ?? activeDocket?.month?.opening ?? 0;
  const activeMonthProfit = activeDocket?.month?.profit ?? activeDocket?.breakdown?.totalProfit ?? 0;
  const barBase = Math.max(Math.abs(activeInitialCapital), Math.abs(activeDocket?.amount ?? 0), Math.abs(activeMonthProfit), 1);
  const barRows = activeDocket ? [
    { label: 'Posición inicial', value: activeInitialCapital, className: 'is-opening' },
    { label: 'Esta aportación', value: activeDocket.amount, className: 'is-contribution' },
    { label: 'Beneficio del mes', value: activeMonthProfit, className: activeMonthProfit < 0 ? 'is-negative' : 'is-profit' }
  ] : [];

  return (
    <main className="traza-report" ref={rootRef}>
      <header className="traza-head">
        <div><p>SEGUIMIENTO DE APORTACIONES · GROK 4.7</p><h1>Traza</h1><span>Qué hizo cada euro desde que entró.</span></div>
        <div className="traza-head-actions"><span>{report.clientCode}</span><button type="button" onClick={onDownload}>Descargar PDF</button></div>
      </header>

      <section className="traza-summary" aria-label="Resumen de cartera completa">
        <div><span>Saldo disponible</span><strong>{formatCurrency(visibleBalance)}</strong><small>Cartera completa</small></div>
        <div><span>Beneficio acumulado</span><strong className={toneClass(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong><small>Cartera completa</small></div>
        <div><span>TWR acumulado</span><strong>{signedPercent(twrPct)}</strong><small>Cartera completa</small></div>
        <div><span>Aportaciones registradas</span><strong>{dockets.length}</strong><small>Movimientos publicados</small></div>
      </section>

      {pending.length ? (
        <section className="traza-pending" aria-labelledby="traza-pending-title">
          <header><div><span>CAPITAL EN TRÁNSITO</span><h2 id="traza-pending-title">Actualización de capital</h2></div><strong>{pending.length} {pending.length === 1 ? 'movimiento' : 'movimientos'}</strong></header>
          <div>{projectedPending.map((movement, index) => <article key={`${movement.iso}-${movement.type}-${index}`}><time>{formatDate(movement.iso)}</time><b>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong><small>Saldo proyectado {formatCurrency(movement.projectedBalance)}</small></article>)}</div>
          <p>Posterior al último cierre. Sin rentabilidad hasta su publicación.</p>
        </section>
      ) : null}

      <section className="traza-controls" aria-label="Periodo del informe">
        <div><span>EXPEDIENTES DEL PERIODO</span><p>{periodStart ? `${monthLabel(periodStart, true)} — ${monthLabel(periodEnd, true)}` : 'Sin cierres publicados'}</p></div>
        <div className="traza-periods">
          {(['3m', '6m', '12m', 'all'] as const).map((option) => <button key={option} type="button" className={period === option ? 'is-active' : ''} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option === 'all' ? 'Todo' : option.toUpperCase()}</button>)}
          <button type="button" className={period === 'custom' ? 'is-active' : ''} aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>Personalizado</button>
        </div>
        {period === 'custom' ? <div className="traza-custom"><label>Desde<select value={customStart} onChange={(event) => setCustomStart(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <div className="traza-split">
        <section className="traza-docket" aria-labelledby="traza-docket-title">
          <header><span>ARCHIVO</span><h2 id="traza-docket-title">Aportaciones</h2><small>{visibleDockets.length} de {dockets.length}</small></header>
          <p className="traza-docket-status"><span><b>{closedDocketCount}</b> {closedDocketCount === 1 ? 'cerrado' : 'cerrados'}</span><span><b>{visibleDockets.length - closedDocketCount}</b> {visibleDockets.length - closedDocketCount === 1 ? 'pendiente' : 'pendientes'}</span></p>
          <div className="traza-docket-list" role="listbox" aria-label="Expedientes de aportaciones" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter">
            {visibleDockets.map((docket) => (
              <button
                key={docket.key}
                ref={(node) => { if (node) docketRefs.current.set(docket.key, node); else docketRefs.current.delete(docket.key); }}
                type="button"
                role="option"
                aria-selected={docket.key === activeDocket?.key}
                aria-controls="traza-active-file"
                className={docket.key === activeDocket?.key ? 'is-active' : ''}
                onClick={() => activateDocket(docket, true)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); moveDocket(-1); }
                  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); moveDocket(1); }
                  if (event.key === 'Enter') { event.preventDefault(); activateDocket(docket, true); }
                }}
              >
                <span>EXPEDIENTE {String(docket.ordinal).padStart(2, '0')}</span>
                <strong>{formatCurrency(docket.amount)}</strong>
                <small>{formatDate(docket.iso)} · {docket.returnPct === undefined ? 'Resultado por publicar' : signedMoney(docket.profit ?? 0)}</small>
                <em className={docket.returnPct === undefined ? 'is-pending' : 'is-closed'}>{docket.returnPct === undefined ? 'Pendiente' : 'Cerrado'}</em>
              </button>
            ))}
            {!visibleDockets.length ? <p>No hay aportaciones publicadas</p> : null}
          </div>
        </section>

        <span className="traza-split-rule" aria-hidden="true" />

        <section
          id="traza-active-file"
          className="traza-file"
          ref={fileRef}
          role="region"
          tabIndex={-1}
          aria-labelledby={activeDocket ? 'traza-file-title' : 'traza-empty-title'}
          onKeyDown={(event) => { if (event.key === 'Escape' && activeDocket) docketRefs.current.get(activeDocket.key)?.focus(); }}
        >
          {activeDocket ? (
            <>
              <header>
                <div><span>EXPEDIENTE {String(activeDocket.ordinal).padStart(2, '0')}</span><h2 id="traza-file-title">Aportación registrada</h2><p>{formatDate(activeDocket.iso, true)}</p></div>
                <small>{activeDocket.month?.label ?? monthLabel(activeDocket.monthKey)}</small>
              </header>
              <div className="traza-file-amount"><span>Importe aportado</span><strong>{formatCurrency(activeDocket.amount)}</strong></div>
              <div className={`traza-journey${activeDocket.returnPct === undefined ? ' is-pending' : ''}`} aria-label="Recorrido de la aportación seleccionada">
                <div><i>1</i><span>Entrada</span><strong>{formatDate(activeDocket.iso)}</strong></div>
                <b aria-hidden="true" />
                <div><i>2</i><span>Cierre del mes</span><strong>{activeDocket.returnPct === undefined ? 'Por publicar' : activeDocket.month?.label ?? monthLabel(activeDocket.monthKey)}</strong></div>
                <b aria-hidden="true" />
                <div><i>3</i><span>Valor del tramo</span><strong>{activeDocket.profit === undefined ? 'Por determinar' : formatCurrency(activeDocket.amount + activeDocket.profit)}</strong></div>
              </div>
              <div className="traza-file-yield" id="traza-yield-details" aria-describedby="traza-yield-note">
                <div><span>Rentabilidad aplicada</span><strong className={activeDocket.returnPct === undefined ? 'is-pending' : toneClass(activeDocket.returnPct)}>{activeDocket.returnPct === undefined ? 'Pendiente de cierre' : signedPercent(activeDocket.returnPct * 100)}</strong></div>
                <div><span>Beneficio de esta aportación</span><strong className={activeDocket.profit === undefined ? 'is-pending' : toneClass(activeDocket.profit)}>{activeDocket.profit === undefined ? 'Pendiente de cierre' : signedMoney(activeDocket.profit)}</strong></div>
              </div>
              {activeDocket.profit !== undefined ? <div className="traza-tranche-equation" aria-label="Conciliación del expediente"><span>{formatCurrency(activeDocket.amount)}</span><b>+</b><span className={toneClass(activeDocket.profit)}>{signedMoney(activeDocket.profit)}</span><b>=</b><strong>{formatCurrency(activeDocket.amount + activeDocket.profit)}</strong><small>Aportación + beneficio = valor del tramo al cierre del mes</small></div> : null}

              <section className="traza-month-context" aria-labelledby="traza-month-context-title">
                <div><span>CONTEXTO</span><h3 id="traza-month-context-title">Mes de entrada</h3></div>
                <svg viewBox="0 0 640 200" role="img" aria-labelledby="traza-bars-title">
                  <title id="traza-bars-title">Composición del mes en el que se registró la aportación</title>
                  {barRows.map((row, index) => {
                    const width = Math.max(row.value === 0 ? 0 : 4, Math.abs(row.value) / barBase * 430);
                    const y = 25 + index * 58;
                    return <g key={row.label} className={row.className}><text x="8" y={y + 19}>{row.label}</text><rect x="142" y={y} width={width} height="28" rx="2" /><text x={width > 365 ? 142 + width - 8 : 150 + width} y={y + 19} textAnchor={width > 365 ? 'end' : 'start'} className={width > 365 ? 'is-inside' : ''}>{row.label === 'Beneficio del mes' ? signedMoney(row.value) : formatCurrency(row.value)}</text></g>;
                  })}
                </svg>
                <div className="traza-bars-mobile" aria-hidden="true">
                  {barRows.map((row) => <div key={row.label}><header><span>{row.label}</span><strong>{row.label === 'Beneficio del mes' ? signedMoney(row.value) : formatCurrency(row.value)}</strong></header><i className={row.className}><b style={{ width: `${Math.max(row.value === 0 ? 0 : 2, Math.abs(row.value) / barBase * 100)}%` }} /></i></div>)}
                </div>
                <table className="sr-only"><caption>Contexto del mes de entrada</caption><tbody>{barRows.map((row) => <tr key={row.label}><th>{row.label}</th><td>{formatCurrency(row.value)}</td></tr>)}</tbody></table>
              </section>

              {activeDocket.breakdown ? <button type="button" className="traza-month-toggle" aria-expanded={showMonth} onClick={() => setShowMonth((current) => !current)}>{showMonth ? 'Ocultar el mes' : 'Ver el mes completo'}</button> : null}
              {showMonth && activeDocket.breakdown ? (
                <div className="traza-month-detail">
                  <div className="traza-month-detail-head"><span>Tramo</span><span>Capital</span><span>Rentabilidad aplicada</span><span>Beneficio</span></div>
                  <div><span>Posición inicial</span><span>{formatCurrency(activeDocket.breakdown.initialCapital)}</span><span>{signedPercent(activeDocket.breakdown.initialReturnPct * 100)}</span><span>{signedMoney(activeDocket.breakdown.initialProfit)}</span></div>
                  {activeDocket.breakdown.contributions.map((item, index) => <div key={`${item.iso}-${index}`}><span>Aportación {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}
                  {(activeDocket.breakdown.withdrawals ?? []).map((item, index) => <div key={`${item.iso}-${index}`}><span>Retirada {formatDate(item.iso)}</span><span>{formatCurrency(item.amount)}</span><span>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</span><span>{signedMoney(item.profit)}</span></div>)}
                  <div className="traza-month-detail-total"><span>Beneficio explicado</span><span>—</span><span>—</span><span>{signedMoney(activeDocket.breakdown.totalProfit)}</span></div>
                </div>
              ) : null}
              <p className="traza-file-note" id="traza-yield-note">La rentabilidad aplicada corresponde solo al tramo de esta aportación dentro del mes. No es la rentabilidad del mes ni el TWR.</p>
              {activeDocket.monthKey === latestMonthKey ? (
                <section className="traza-latest-context" aria-label="Cierre más reciente de la cartera">
                  <header><span>CIERRE MÁS RECIENTE</span><small>{activeDocket.month?.label ?? monthLabel(activeDocket.monthKey)}</small></header>
                  <div><span>Beneficio del último mes</span><strong className={toneClass(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong></div>
                  <div><span>Rentabilidad del último mes</span><strong className={toneClass(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong></div>
                  <div><span>Rentabilidad total</span><strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div>
                  <div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div>
                  <div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div>
                </section>
              ) : null}
            </>
          ) : (
            <div className="traza-empty-file">
              <span>ARCHIVO DE APORTACIONES</span><h2 id="traza-empty-title">No hay aportaciones publicadas</h2><p>La cartera sigue disponible en su lectura completa.</p>
              <dl>
                <div><dt>Saldo disponible</dt><dd>{formatCurrency(visibleBalance)}</dd></div><div><dt>Beneficio acumulado</dt><dd>{signedMoney(report.beneficioTotal)}</dd></div>
                <div><dt>TWR acumulado</dt><dd>{signedPercent(twrPct)}</dd></div><div><dt>Rentabilidad total</dt><dd>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</dd></div>
                <div><dt>Capital aportado</dt><dd>{formatCurrency(visibleContributed)}</dd></div><div><dt>Capital retirado</dt><dd>{formatCurrency(visibleWithdrawn)}</dd></div>
                <div><dt>Beneficio del último mes</dt><dd>{signedMoney(report.beneficioUltimoMes)}</dd></div><div><dt>Rentabilidad del último mes</dt><dd>{signedPercent(report.rentabilidadUltimoMes)}</dd></div>
              </dl>
            </div>
          )}
        </section>
      </div>

      <section className="traza-rest" aria-labelledby="traza-rest-title">
        <header><div><span>LECTURA COMPLETA</span><h2 id="traza-rest-title">Resto del historial</h2></div><p>Movimientos de salida y cierres sin movimientos de capital.</p></header>
        <div className="traza-rest-grid">
          <section className="traza-withdrawals" aria-labelledby="traza-withdrawals-title"><h3 id="traza-withdrawals-title">Retiradas</h3>
            <div className="traza-rest-head"><span>Fecha</span><span>Importe</span><span>Rentabilidad aplicada</span><span>Beneficio del tramo</span></div>
            {withdrawalMatches.map((withdrawal) => <div key={withdrawal.key}><time>{formatDate(withdrawal.iso)}</time><strong>{formatCurrency(withdrawal.amount)}</strong><span>{withdrawal.match?.returnPct === undefined ? '—' : signedPercent(withdrawal.match.returnPct * 100)}</span><span className={toneClass(withdrawal.match?.profit ?? 0)}>{withdrawal.match ? signedMoney(withdrawal.match.profit) : '—'}</span></div>)}
            {!withdrawalMatches.length ? <p>Sin retiradas en el periodo</p> : null}
          </section>
          <section className="traza-quiet" aria-labelledby="traza-quiet-title"><h3 id="traza-quiet-title">Meses sin movimientos</h3>
            <div className="traza-rest-head"><span>Mes</span><span>Saldo final</span><span>Beneficio</span><span>Rentabilidad</span></div>
            {quietMonths.map((month) => <div key={month.key}><time>{month.shortLabel}</time><strong>{formatCurrency(month.balance)}</strong><span className={toneClass(month.profit)}>{signedMoney(month.profit)}</span><span className={toneClass(month.returnPct)}>{signedPercent(month.returnPct)}</span></div>)}
            {!quietMonths.length ? <p>Todos los meses del periodo tienen movimientos</p> : null}
          </section>
        </div>
        <div className="traza-portfolio-close">
          <div><span>Beneficio del último mes</span><strong className={toneClass(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong></div>
          <div><span>Rentabilidad del último mes</span><strong className={toneClass(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</strong></div>
          <div><span>Rentabilidad total</span><strong>{hasTotalReturn ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div>
          <div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div>
          <div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div>
        </div>
      </section>

      <footer className="traza-seal"><div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong></div><b>−</b><div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong></div><b>+</b><div><span>Beneficio acumulado</span><strong>{signedMoney(report.beneficioTotal)}</strong></div><b>=</b><div><span>Saldo</span><strong>{formatCurrency(visibleBalance)}</strong></div></footer>
    </main>
  );
};
