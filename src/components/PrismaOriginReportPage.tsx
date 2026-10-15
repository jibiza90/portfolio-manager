import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './PrismaOriginReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface PrismaOriginReportPageProps {
  report: ReportData;
  pendingCashMovements?: PendingMovement[];
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

interface OriginMonth {
  key: string;
  label: string;
  shortLabel: string;
  opening: number;
  close: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type Period = '3m' | '6m' | '12m' | 'all';
type BridgeKind = 'opening' | 'increment' | 'decrement' | 'profit' | 'close';

interface BridgeEvent {
  id: string;
  monthKey: string;
  kind: BridgeKind;
  label: string;
  value: number;
  start: number;
  end: number;
  isTotal: boolean;
}

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
  const value = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

const signedPct = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000).toLocaleString('es-ES')} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0);

const niceMaximum = (value: number) => {
  const safe = Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

export const PrismaOriginReportPage: React.FC<PrismaOriginReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [focusKey, setFocusKey] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const pending = useMemo(() => pendingCashMovements
    .filter((row) => row.amount > 0 && Number.isFinite(row.amount))
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const contributed = report.incrementos + pendingIncrements;
  const withdrawn = report.decrementos + pendingDecrements;
  const netCapital = contributed - withdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;

  const months = useMemo<OriginMonth[]>(() => {
    const balances = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((row) => [monthToKey(row.month), row]));
    const valid = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    return valid.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const close = balances.get(row.key) ?? row.endBalance;
      const previous = index > 0 ? (balances.get(valid[index - 1].key) ?? valid[index - 1].endBalance) : undefined;
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        opening: previous ?? close - increments + decrements - row.profit,
        close,
        profit: row.profit,
        returnPct: index === valid.length - 1 ? report.rentabilidadUltimoMes : row.profitPct,
        increments,
        decrements,
        breakdown: breakdowns.get(row.key)
      };
    });
  }, [report]);

  const visibleMonths = useMemo(() => {
    if (period === 'all') return months;
    const count = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return months.slice(-count);
  }, [months, period]);

  useEffect(() => {
    const latest = visibleMonths[visibleMonths.length - 1];
    if (!visibleMonths.some((month) => month.key === focusKey)) setFocusKey(latest?.key ?? '');
  }, [focusKey, visibleMonths]);

  useEffect(() => {
    onPeriodChange?.(visibleMonths[0]?.key ?? '', visibleMonths[visibleMonths.length - 1]?.key ?? '', period === 'all');
  }, [onPeriodChange, period, visibleMonths]);

  useEffect(() => {
    const element = chartScrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [period, visibleMonths.length]);

  const focused = visibleMonths.find((month) => month.key === focusKey) ?? visibleMonths[visibleMonths.length - 1];
  const events = useMemo<BridgeEvent[]>(() => {
    if (!visibleMonths.length) return [];
    const result: BridgeEvent[] = [];
    let running = visibleMonths[0].opening;
    result.push({ id: 'opening', monthKey: visibleMonths[0].key, kind: 'opening', label: 'Inicio', value: running, start: 0, end: running, isTotal: true });
    visibleMonths.forEach((month) => {
      if (month.increments > 0) {
        result.push({ id: `${month.key}-in`, monthKey: month.key, kind: 'increment', label: 'Aportación', value: month.increments, start: running, end: running + month.increments, isTotal: false });
        running += month.increments;
      }
      if (month.decrements > 0) {
        result.push({ id: `${month.key}-out`, monthKey: month.key, kind: 'decrement', label: 'Retirada', value: -month.decrements, start: running, end: running - month.decrements, isTotal: false });
        running -= month.decrements;
      }
      result.push({ id: `${month.key}-profit`, monthKey: month.key, kind: 'profit', label: 'Resultado', value: month.profit, start: running, end: running + month.profit, isTotal: false });
      running += month.profit;
      result.push({ id: `${month.key}-close`, monthKey: month.key, kind: 'close', label: month.shortLabel, value: month.close, start: 0, end: month.close, isTotal: true });
      running = month.close;
    });
    if (pending.length) {
      const currentKey = visibleMonths[visibleMonths.length - 1].key;
      if (pendingIncrements > 0) result.push({ id: 'pending-in', monthKey: currentKey, kind: 'increment', label: 'Aportación posterior', value: pendingIncrements, start: running, end: running + pendingIncrements, isTotal: false });
      running += pendingIncrements;
      if (pendingDecrements > 0) result.push({ id: 'pending-out', monthKey: currentKey, kind: 'decrement', label: 'Retirada posterior', value: -pendingDecrements, start: running, end: running - pendingDecrements, isTotal: false });
      result.push({ id: 'today', monthKey: currentKey, kind: 'close', label: 'Saldo hoy', value: visibleBalance, start: 0, end: visibleBalance, isTotal: true });
    }
    return result;
  }, [pending.length, pendingDecrements, pendingIncrements, visibleBalance, visibleMonths]);

  const chart = useMemo(() => {
    if (!events.length) return null;
    const width = Math.max(1160, 150 + events.length * 72);
    const height = 540;
    const left = 96;
    const right = 54;
    const top = 54;
    const bottom = 458;
    const maximum = niceMaximum(Math.max(...events.flatMap((event) => [event.start, event.end]), 1) * 1.08);
    const minimum = Math.min(0, ...events.flatMap((event) => [event.start, event.end]));
    const domainMin = minimum < 0 ? -niceMaximum(Math.abs(minimum) * 1.08) : 0;
    const y = (value: number) => top + ((maximum - value) / Math.max(1, maximum - domainMin)) * (bottom - top);
    const step = (width - left - right) / Math.max(1, events.length);
    const x = (index: number) => left + step * (index + 0.5);
    const ticks = Array.from({ length: 6 }, (_, index) => domainMin + ((maximum - domainMin) / 5) * index);
    return { width, height, left, right, top, bottom, maximum, domainMin, y, x, step, ticks };
  }, [events]);

  const updatePeriod = (next: Period) => {
    setPeriod(next);
    onAnalyticsEvent?.({ type: 'report_period_change', label: `PRISMA ORIGEN ${next}` });
  };

  const focusIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === focused?.key));
  const moveFocus = (direction: -1 | 1) => {
    const next = visibleMonths[Math.min(visibleMonths.length - 1, Math.max(0, focusIndex + direction))];
    if (next) setFocusKey(next.key);
  };

  const compositionBase = Math.max(1, Math.abs(netCapital) + Math.abs(report.beneficioTotal));
  const periodMovements = report.movements.filter((movement) => visibleMonths.some((month) => movement.iso.startsWith(month.key)));

  return (
    <article className="origin-root" ref={rootRef}>
      <header className="origin-head">
        <div className="origin-brand"><span>PO</span><div><small>INFORME PATRIMONIAL</small><h1>PRISMA ORIGEN</h1><p>El puente exacto entre su capital y su patrimonio · {report.clientCode}</p></div></div>
        <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'PRISMA ORIGEN PDF' }); void onDownload?.(); }}>Descargar informe oficial</button>
      </header>

      <section className="origin-hero">
        <div className="origin-balance">
          <span>SALDO HOY</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <div className="origin-composition" aria-label="Composición del patrimonio">
            <i className="is-capital" style={{ width: `${Math.abs(netCapital) / compositionBase * 100}%` }} />
            <i className={report.beneficioTotal >= 0 ? 'is-profit' : 'is-loss'} style={{ width: `${Math.abs(report.beneficioTotal) / compositionBase * 100}%` }} />
          </div>
          <div className="origin-composition-labels"><span><i className="is-capital" />Capital neto {formatCurrency(netCapital)}</span><span><i className={report.beneficioTotal >= 0 ? 'is-profit' : 'is-loss'} />Beneficio {signedMoney(report.beneficioTotal)}</span></div>
        </div>
        <div className="origin-kpis">
          <div><span>Capital aportado</span><strong>{formatCurrency(contributed)}</strong></div>
          <div><span>Capital retirado</span><strong>{formatCurrency(withdrawn)}</strong></div>
          <div><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></div>
          <div><span>Rentabilidad total</span><strong className={tone(report.rentabilidad)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong></div>
          <div><span>TWR acumulado</span><strong className={tone(twrPct)}>{signedPct(twrPct)}</strong></div>
          <div><span>Último cierre · {months[months.length - 1]?.shortLabel ?? '—'}</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPct(report.rentabilidadUltimoMes)}</strong><em>{signedMoney(report.beneficioUltimoMes)}</em></div>
        </div>
      </section>

      {pending.length ? <section className="origin-pending"><div><small>CAPITAL POSTERIOR AL ÚLTIMO CIERRE</small><strong>Saldo actualizado con movimientos confirmados</strong><p>La rentabilidad se incorporará cuando se publique el siguiente cierre mensual.</p></div><ul>{pending.map((row) => <li key={`${row.iso}-${row.type}-${row.amount}`}><span>{dateLabel(row.iso)}</span><b>{row.type === 'increment' ? 'Aportación' : 'Retirada'}</b><strong>{row.type === 'increment' ? '+' : '−'}{formatCurrency(row.amount)}</strong></li>)}</ul></section> : null}

      <section className="origin-toolbar" aria-label="Periodo del puente patrimonial">
        <div><small>PERIODO DE ANÁLISIS</small><strong>{visibleMonths[0]?.shortLabel ?? '—'} — {visibleMonths[visibleMonths.length - 1]?.shortLabel ?? '—'}</strong></div>
        <div className="origin-periods">{(['3m', '6m', '12m', 'all'] as Period[]).map((item) => <button key={item} type="button" aria-pressed={period === item} className={period === item ? 'is-active' : ''} onClick={() => updatePeriod(item)}>{item === 'all' ? 'Todo el histórico' : item.replace('m', ' meses')}</button>)}</div>
        <label>Mes en foco<select value={focused?.key ?? ''} onChange={(event) => setFocusKey(event.target.value)}>{visibleMonths.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label>
      </section>

      <section className="origin-bridge-section" aria-labelledby="origin-bridge-title">
        <div className="origin-section-head"><div><small>IDENTIDAD CONTABLE VISUAL</small><h2 id="origin-bridge-title">De su capital al saldo actual, paso a paso</h2><p>Cada barra representa una aportación, retirada o resultado. Las barras oscuras son cierres mensuales verificados.</p></div><div className="origin-legend"><span><i className="is-total" />Saldo</span><span><i className="is-in" />Aportación</span><span><i className="is-out" />Retirada</span><span><i className="is-result" />Resultado</span></div></div>
        <div className="origin-chart-shell">
          <div className="origin-chart-scroll" ref={chartScrollRef}>
            {chart ? <svg className="origin-chart" width={chart.width} height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Puente patrimonial con saldos, movimientos y resultados" tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft') moveFocus(-1); if (event.key === 'ArrowRight') moveFocus(1); }}>
              <defs><linearGradient id="origin-total-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17233d" /><stop offset="1" stopColor="#30456f" /></linearGradient></defs>
              {chart.ticks.map((tick) => <g key={tick}><line x1={chart.left} x2={chart.width - chart.right} y1={chart.y(tick)} y2={chart.y(tick)} className="origin-grid" /><text x={chart.left - 14} y={chart.y(tick) + 4} textAnchor="end" className="origin-axis">{compactMoney(tick)}</text></g>)}
              {events.map((event, index) => {
                const x = chart.x(index);
                const yTop = chart.y(Math.max(event.start, event.end));
                const yBottom = chart.y(Math.min(event.start, event.end));
                const height = Math.max(3, yBottom - yTop);
                const isFocused = event.monthKey === focused?.key;
                const previous = events[index - 1];
                const connectorValue = event.isTotal ? event.end : event.start;
                return <g key={event.id} className={`origin-event is-${event.kind}${event.kind === 'profit' ? ` ${tone(event.value)}` : ''}${isFocused ? ' is-focused' : ''}`} role="button" tabIndex={0} aria-label={`${event.label}: ${event.isTotal ? formatCurrency(event.end) : signedMoney(event.value)}`} onMouseEnter={() => setFocusKey(event.monthKey)} onClick={() => setFocusKey(event.monthKey)} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') setFocusKey(event.monthKey); }}>
                  {isFocused ? <rect x={x - chart.step * .48} y={chart.top - 18} width={chart.step * .96} height={chart.bottom - chart.top + 58} rx="8" className="origin-focus-band" /> : null}
                  {index > 0 && previous ? <line x1={chart.x(index - 1) + 21} x2={x - 21} y1={chart.y(connectorValue)} y2={chart.y(connectorValue)} className="origin-connector" /> : null}
                  <rect x={x - 20} y={yTop} width="40" height={height} rx="5" className="origin-bar" />
                  <text x={x} y={Math.max(24, yTop - 10)} textAnchor="middle" className="origin-value">{event.isTotal ? compactMoney(event.end) : signedMoney(event.value)}</text>
                  <text x={x} y={chart.bottom + 26} textAnchor="middle" className="origin-event-label">{event.label}</text>
                  {event.kind === 'close' || event.kind === 'opening' ? <text x={x} y={chart.bottom + 45} textAnchor="middle" className="origin-event-month">{event.monthKey === 'opening' ? '' : monthLabel(event.monthKey, true)}</text> : null}
                  <title>{event.label} · {event.isTotal ? formatCurrency(event.end) : signedMoney(event.value)}</title>
                </g>;
              })}
            </svg> : <p className="origin-empty">Todavía no hay cierres publicados para construir el puente.</p>}
          </div>
        </div>
      </section>

      {focused ? <section className="origin-focus" aria-live="polite">
        <button type="button" aria-label="Mes anterior" onClick={() => moveFocus(-1)} disabled={focusIndex === 0}>←</button>
        <div className="origin-focus-month"><small>MES EN FOCO</small><strong>{focused.label}</strong><span>{signedPct(focused.returnPct)}</span></div>
        <dl><div><dt>Saldo inicial</dt><dd>{formatCurrency(focused.opening)}</dd></div><div><dt>Aportaciones</dt><dd>{focused.increments ? `+${formatCurrency(focused.increments)}` : '—'}</dd></div><div><dt>Retiradas</dt><dd>{focused.decrements ? `−${formatCurrency(focused.decrements)}` : '—'}</dd></div><div><dt>Resultado</dt><dd className={tone(focused.profit)}>{signedMoney(focused.profit)}</dd></div><div><dt>Saldo final</dt><dd>{formatCurrency(focused.close)}</dd></div></dl>
        <div className="origin-equation"><span>{formatCurrency(focused.opening)}</span><i>+</i><span>{formatCurrency(focused.increments)}</span><i>−</i><span>{formatCurrency(focused.decrements)}</span><i>{focused.profit >= 0 ? '+' : '−'}</i><span>{formatCurrency(Math.abs(focused.profit))}</span><i>=</i><strong>{formatCurrency(focused.close)}</strong></div>
        <button type="button" aria-label="Mes siguiente" onClick={() => moveFocus(1)} disabled={focusIndex === visibleMonths.length - 1}>→</button>
      </section> : null}

      <section className="origin-ledger" aria-labelledby="origin-ledger-title">
        <div className="origin-section-head"><div><small>CIERRES MENSUALES</small><h2 id="origin-ledger-title">Trazabilidad completa del periodo</h2><p>Seleccione un mes con movimientos para comprobar qué generó cada tramo de capital.</p></div></div>
        <div className="origin-table-wrap"><table><thead><tr><th aria-label="Detalle" /><th>Mes</th><th>Saldo inicial</th><th>Aportaciones</th><th>Retiradas</th><th>Resultado</th><th>Rentabilidad</th><th>Saldo final</th></tr></thead><tbody>{visibleMonths.map((month) => <React.Fragment key={month.key}><tr className={focusKey === month.key ? 'is-focused' : ''}><td><button type="button" aria-expanded={expandedKey === month.key} aria-label={`${expandedKey === month.key ? 'Ocultar' : 'Ver'} detalle de ${month.label}`} onClick={() => { setExpandedKey((current) => current === month.key ? null : month.key); setFocusKey(month.key); }}>{expandedKey === month.key ? '−' : '+'}</button></td><td><strong>{month.label}</strong>{month.breakdown ? <span>Desglose disponible</span> : null}</td><td>{formatCurrency(month.opening)}</td><td>{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</td><td>{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</td><td className={tone(month.profit)}>{signedMoney(month.profit)}</td><td className={tone(month.returnPct)}>{signedPct(month.returnPct)}</td><td><strong>{formatCurrency(month.close)}</strong></td></tr>{expandedKey === month.key ? <tr className="origin-detail-row"><td colSpan={8}>{month.breakdown ? <div className="origin-breakdown"><div><small>POSICIÓN INICIAL DEL MES</small><strong>{formatCurrency(month.breakdown.openingCapital ?? month.breakdown.initialCapital)}</strong><span>{signedPct(month.breakdown.initialReturnPct * 100)} · {signedMoney(month.breakdown.initialProfit)}</span></div>{month.breakdown.contributions.map((row) => <div key={`in-${row.iso}`}><small>APORTACIÓN · {dateLabel(row.iso)}</small><strong>{formatCurrency(row.amount)}</strong><span>{signedPct(row.returnPct * 100)} · {signedMoney(row.profit)}</span></div>)}{(month.breakdown.withdrawals ?? []).map((row) => <div key={`out-${row.iso}`}><small>RETIRADA · {dateLabel(row.iso)}</small><strong>{formatCurrency(row.amount)}</strong><span>{row.returnPct === undefined ? '—' : signedPct(row.returnPct * 100)} · {signedMoney(row.profit)}</span></div>)}<div className="is-total"><small>RESULTADO EXPLICADO</small><strong>{signedMoney(month.breakdown.totalProfit)}</strong><span>{Math.abs(month.breakdown.totalProfit - month.profit) < .01 ? 'Cuadra con el cierre publicado' : `Diferencia ${signedMoney(month.profit - month.breakdown.totalProfit)}`}</span></div></div> : <p className="origin-no-detail">Este cierre no tiene un desglose intrames publicado.</p>}</td></tr> : null}</React.Fragment>)}</tbody></table></div>
      </section>

      <section className="origin-movements" aria-labelledby="origin-movements-title">
        <div className="origin-section-head"><div><small>FLUJOS DE CAPITAL</small><h2 id="origin-movements-title">Aportaciones y retiradas</h2><p>Movimientos registrados dentro del periodo seleccionado.</p></div></div>
        <div className="origin-table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Rentabilidad específica</th></tr></thead><tbody>{periodMovements.length ? periodMovements.map((movement, index) => <tr key={`${movement.iso}-${index}`}><td>{dateLabel(movement.iso)}</td><td><b className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b></td><td className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</td><td>{movement.returnPct === undefined ? '—' : signedPct(movement.returnPct * 100)}</td></tr>) : <tr><td colSpan={4} className="origin-empty-cell">No hay movimientos registrados en este periodo.</td></tr>}</tbody></table></div>
      </section>

      <section className="origin-method"><div><small>TWR</small><h2>Rendimiento de la gestión</h2><strong>{signedPct(twrPct)}</strong><p>Encadena la rentabilidad de cada periodo y elimina el efecto de las aportaciones y retiradas.</p></div><div><small>RENTABILIDAD TOTAL</small><h2>Resultado sobre el capital neto</h2><strong>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong><p>Compara el beneficio acumulado con todo el capital aportado menos el capital retirado.</p></div></section>

      <footer className="origin-footer"><div><strong>PRISMA ORIGEN</strong><span>Informe patrimonial · {report.clientCode}</span></div><p>Datos actualizados el {new Date(report.createdAt).toLocaleDateString('es-ES')} · Diseño Claude Fable 5.1</p></footer>
    </article>
  );
};
