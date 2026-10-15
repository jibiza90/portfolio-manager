import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './EstacionesReportPage.css';

interface EstPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface EstacionesReportPageProps {
  report: ReportData;
  pendingCashMovements?: EstPendingMovement[];
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

interface EstMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  short: string;
  profit: number;
  returnPct: number;
  balance: number;
  opening: number;
  increments: number;
  decrements: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

interface EstYear {
  year: number;
  months: Array<EstMonth | null>;
  chainedPct: number;
  result: number;
  contributed: number;
  withdrawn: number;
  closing: number;
  lastMonth: number;
  incomplete: boolean;
}

type ChartMode = 'chained' | 'monthly';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthNumbers: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthNumbers[parts[0]];
  const year = Number(parts[parts.length - 1]);
  return month === undefined || !Number.isFinite(year) ? value : `${year}-${String(month + 1).padStart(2, '0')}`;
};

const dateLabel = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day).toLocaleDateString('es-ES') : iso;
};

const signedMoney = (value: number) => Math.abs(value) < .005
  ? formatCurrency(0)
  : `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;

const signedPct = (value: number, digits = 2) => Math.abs(value) < .005
  ? '0,00 %'
  : `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;

const compactMoney = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const tone = (value: number) => value > .005 ? 'is-positive' : value < -.005 ? 'is-negative' : 'is-neutral';
const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => rows
  .filter((row) => row.type === type)
  .reduce((sum, row) => sum + row.amount, 0);

const yearColor = (year: number, newest: number, index: number) => {
  if (year === newest) return '#E0A93C';
  return ['#C9D1DB', '#8E9AA8', '#687583', '#4C5865'][Math.min(index, 3)];
};

export const EstacionesReportPage: React.FC<EstacionesReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const pending = useMemo(() => pendingCashMovements.filter((row) => row.amount > 0), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleNet = report.incrementos + pendingIncrements - report.decrementos - pendingDecrements;

  const records = useMemo<EstMonth[]>(() => {
    const balances = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((row) => [monthToKey(row.month), row]));
    const stats = report.monthlyStats.filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return stats.map((row, index) => {
      const [year, monthNumber] = row.key.split('-').map(Number);
      const month = monthNumber - 1;
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balances.get(row.key) ?? row.endBalance;
      const previous = index > 0 ? (balances.get(stats[index - 1].key) ?? stats[index - 1].endBalance) : undefined;
      return {
        key: row.key,
        year,
        month,
        label: `${MONTHS[month]} ${year}`,
        short: MONTHS[month],
        profit: row.profit,
        returnPct: index === stats.length - 1 ? report.rentabilidadUltimoMes : row.profitPct,
        balance,
        opening: previous ?? balance - row.profit - increments + decrements,
        increments,
        decrements,
        breakdown: breakdowns.get(row.key)
      };
    });
  }, [report]);

  const years = useMemo<EstYear[]>(() => {
    const unique = [...new Set(records.map((row) => row.year))].sort((a, b) => a - b);
    return unique.map((year) => {
      const yearRows = records.filter((row) => row.year === year);
      const months: Array<EstMonth | null> = Array(12).fill(null);
      yearRows.forEach((row) => { months[row.month] = row; });
      const movements = report.movements.filter((row) => Number(row.iso.slice(0, 4)) === year);
      const chainedPct = (yearRows.reduce((factor, row) => factor * (1 + row.returnPct / 100), 1) - 1) * 100;
      const last = yearRows[yearRows.length - 1];
      return {
        year,
        months,
        chainedPct,
        result: yearRows.reduce((sum, row) => sum + row.profit, 0),
        contributed: sumType(movements, 'increment'),
        withdrawn: sumType(movements, 'decrement'),
        closing: last?.balance ?? 0,
        lastMonth: last?.month ?? 0,
        incomplete: (last?.month ?? 11) < 11
      };
    });
  }, [records, report.movements]);

  const newestYear = years[years.length - 1]?.year ?? new Date().getFullYear();
  const [activeYears, setActiveYears] = useState<Set<number>>(() => new Set(years.map((year) => year.year)));
  const [mode, setMode] = useState<ChartMode>('chained');
  const [hoverMonth, setHoverMonth] = useState(records[records.length - 1]?.month ?? 0);
  const [selected, setSelected] = useState<EstMonth | null>(null);

  useEffect(() => {
    setActiveYears((current) => current.size ? current : new Set(years.map((year) => year.year)));
  }, [years]);

  const visibleYears = years.filter((year) => activeYears.has(year.year));
  useEffect(() => {
    const selectedYears = years.filter((year) => activeYears.has(year.year));
    if (!selectedYears.length) return;
    const start = `${selectedYears[0].year}-01`;
    const last = selectedYears[selectedYears.length - 1];
    const end = `${last.year}-${String(last.lastMonth + 1).padStart(2, '0')}`;
    onPeriodChange?.(start, end, selectedYears.length === years.length);
  }, [activeYears, onPeriodChange, years]);

  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const chart = useMemo(() => {
    const width = 1380;
    const height = 430;
    const left = 76;
    const right = 56;
    const top = 34;
    const bottom = 58;
    const series = visibleYears.map((year) => {
      let cumulative = 0;
      const values = year.months.map((month) => {
        if (!month) return null;
        cumulative = (1 + cumulative / 100) * (1 + month.returnPct / 100) * 100 - 100;
        return mode === 'chained' ? cumulative : month.returnPct;
      });
      return { ...year, values };
    });
    const allValues = series.flatMap((year) => year.values.filter((value): value is number => value !== null));
    const raw = Math.max(1, ...allValues.map((value) => Math.abs(value))) * 1.15;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const maximum = (normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const x = (month: number) => left + month * ((width - left - right) / 11);
    const y = (value: number) => top + ((maximum - value) / (maximum * 2)) * (height - top - bottom);
    const path = (values: Array<number | null>) => values.reduce((result, value, month) => value === null
      ? result
      : `${result}${result && values[month - 1] !== null ? ' L' : ' M'} ${x(month).toFixed(2)} ${y(value).toFixed(2)}`, '');
    return { width, height, left, right, top, bottom, maximum, x, y, path, series, ticks: [maximum, maximum / 2, 0, -maximum / 2, -maximum] };
  }, [mode, visibleYears]);

  const maxProfit = Math.max(1, ...records.map((row) => Math.abs(row.profit)));
  const maxReturn = Math.max(1, ...records.map((row) => Math.abs(row.returnPct)));
  const focusedValues = chart.series.map((year, index) => ({
    year: year.year,
    value: year.values[hoverMonth],
    color: yearColor(year.year, newestYear, chart.series.length - 1 - index)
  })).filter((row) => row.value !== null).sort((a, b) => Number(b.value) - Number(a.value));

  const toggleYear = (year: number) => {
    setActiveYears((current) => {
      const next = new Set(current);
      if (next.has(year)) {
        if (next.size === 1) return current;
        next.delete(year);
      } else next.add(year);
      return next;
    });
    onAnalyticsEvent?.({ type: 'report_year_toggle', label: `ESTACIONES ${year}` });
  };

  const openMonth = (year: EstYear, monthIndex: number) => {
    const month = year.months[monthIndex];
    if (!month) return;
    setSelected(month);
    onAnalyticsEvent?.({ type: 'report_month_detail', label: `ESTACIONES ${month.key}` });
  };

  const selectedYear = selected ? years.find((year) => year.year === selected.year) : undefined;
  const selectedCalculated = selected ? selected.opening + selected.increments - selected.decrements + selected.profit : 0;
  const selectedDifference = selected ? selected.balance - selectedCalculated : 0;

  return (
    <article className="est-root" ref={rootRef}>
      <header className="est-head">
        <div><span>OBSERVATORIO PATRIMONIAL</span><h1>ESTACIONES</h1><p>Sus años, uno sobre otro · {report.clientCode}</p></div>
        <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'ESTACIONES PDF' }); void onDownload?.(); }}>Descargar informe oficial</button>
      </header>

      <section className="est-summary" aria-label="Resumen de cartera completa">
        <div className="is-primary"><span>Saldo hoy</span><strong>{formatCurrency(visibleBalance)}</strong><small>Cartera completa</small></div>
        <div><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong><small>Cartera completa</small></div>
        <div><span>TWR acumulado</span><strong className={tone(report.twrYtd ?? 0)}>{signedPct((report.twrYtd ?? 0) * 100)}</strong><small>Oficial publicado</small></div>
        <div><span>Rentabilidad total</span><strong className={tone(report.rentabilidad)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong><small>Sobre capital neto</small></div>
        <div><span>Capital neto</span><strong>{formatCurrency(visibleNet)}</strong><small>Aportado menos retirado</small></div>
        <div><span>Último mes</span><strong className={tone(report.rentabilidadUltimoMes)}>{signedPct(report.rentabilidadUltimoMes)}</strong><small>{signedMoney(report.beneficioUltimoMes)}</small></div>
      </section>

      {pending.length ? <section className="est-pending"><div><span>CAPITAL POSTERIOR AL ÚLTIMO CIERRE</span><strong>{pending.length} movimiento{pending.length === 1 ? '' : 's'} incorporado{pending.length === 1 ? '' : 's'} al saldo visible</strong></div><b>{pendingIncrements ? `+${formatCurrency(pendingIncrements)}` : ''}{pendingIncrements && pendingDecrements ? ' · ' : ''}{pendingDecrements ? `−${formatCurrency(pendingDecrements)}` : ''}</b></section> : null}

      <section className="est-controls" aria-label="Años visibles y tipo de rentabilidad">
        <div><span>Años visibles</span>{years.map((year) => <button type="button" key={year.year} aria-pressed={activeYears.has(year.year)} className={activeYears.has(year.year) ? 'is-active' : ''} onClick={() => toggleYear(year.year)}>{year.year}{year.year === newestYear ? <small>En curso</small> : null}</button>)}</div>
        <div role="radiogroup" aria-label="Modo del gráfico"><button role="radio" aria-checked={mode === 'chained'} className={mode === 'chained' ? 'is-active' : ''} onClick={() => setMode('chained')}>Encadenado</button><button role="radio" aria-checked={mode === 'monthly'} className={mode === 'monthly' ? 'is-active' : ''} onClick={() => setMode('monthly')}>Mensual</button></div>
      </section>

      <section className="est-section est-overlay-section">
        <div className="est-section-head"><div><span>LECTURA COMPARADA</span><h2>{mode === 'chained' ? 'Trayectoria acumulada de cada año' : 'Rentabilidad mes a mes'}</h2><p>{mode === 'chained' ? 'Cada línea empieza desde cero y encadena los porcentajes publicados del año.' : 'Compara el porcentaje publicado de cada mes en el mismo punto del calendario.'}</p></div><div className="est-legend">{chart.series.map((year, index) => <span key={year.year}><i style={{ background: yearColor(year.year, newestYear, chart.series.length - 1 - index) }} />{year.year}{year.year === newestYear ? ' · en curso' : ''}</span>)}</div></div>
        {chart.series.length ? <div className="est-overlay-wrap">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Comparación ${mode === 'chained' ? 'encadenada' : 'mensual'} por años`} tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setHoverMonth((value) => Math.max(0, value - 1)); if (event.key === 'ArrowRight') setHoverMonth((value) => Math.min(11, value + 1)); }}>
            <defs><linearGradient id="est-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E0A93C" stopOpacity=".18" /><stop offset="1" stopColor="#E0A93C" stopOpacity="0" /></linearGradient></defs>
            {chart.ticks.map((tick) => <g key={tick}><line x1={chart.left} x2={chart.width - chart.right} y1={chart.y(tick)} y2={chart.y(tick)} className={tick === 0 ? 'est-zero' : 'est-grid'} /><text x={chart.left - 14} y={chart.y(tick) + 4} textAnchor="end">{signedPct(tick, 1)}</text></g>)}
            <rect x={chart.x(hoverMonth) - 38} y={chart.top} width="76" height={chart.height - chart.top - chart.bottom} className="est-hover-column" />
            {MONTHS.map((month, index) => <g key={month} role="button" tabIndex={0} aria-label={`Ver ${month}`} onMouseEnter={() => setHoverMonth(index)} onFocus={() => setHoverMonth(index)} onClick={() => { const year = [...chart.series].reverse().find((item) => item.months[index]); if (year) openMonth(year, index); }}><rect x={chart.x(index) - 43} y={chart.top} width="86" height={chart.height - chart.top - chart.bottom} fill="transparent" /><text x={chart.x(index)} y={chart.height - 18} textAnchor="middle">{month}</text></g>)}
            {chart.series.map((year, index) => { const color = yearColor(year.year, newestYear, chart.series.length - 1 - index); const focused = year.values[hoverMonth]; return <g key={year.year} className={`est-year-line${year.year === newestYear ? ' is-current' : ''}`}><path d={chart.path(year.values)} style={{ stroke: color }} />{year.values.map((value, month) => value === null ? null : <circle key={month} cx={chart.x(month)} cy={chart.y(value)} r={hoverMonth === month ? 5 : 3} style={{ stroke: color }}><title>{year.year} · {MONTHS[month]} · {signedPct(value)}</title></circle>)}{focused !== null ? <text className="est-focus-value" x={chart.x(hoverMonth)} y={chart.y(focused) + (index % 2 === 0 ? -13 : 20)} textAnchor="middle" style={{ fill: color }}>{year.year} · {signedPct(focused)}</text> : null}</g>; })}
          </svg>
          <div className="est-month-readout"><div><span>Mes enfocado</span><strong>{MONTHS[hoverMonth]}</strong><small>{mode === 'chained' ? 'Rentabilidad encadenada hasta este mes' : 'Rentabilidad publicada del mes'}</small></div>{focusedValues.map((row) => <div key={row.year}><span><i style={{ background: row.color }} />{row.year}</span><strong className={tone(Number(row.value))}>{signedPct(Number(row.value))}</strong></div>)}</div>
        </div> : <div className="est-empty">Sin cierres publicados.</div>}
      </section>

      <section className="est-section">
        <div className="est-section-head"><div><span>RADIOGRAFÍA ANUAL</span><h2>Doce meses, la misma escala</h2><p>Las barras usan una escala común para poder comparar los resultados en euros entre años.</p></div><div className="est-flow-key"><span><i className="is-inflow" />Aportación</span><span><i className="is-outflow" />Retirada</span></div></div>
        <div className="est-year-cards">{visibleYears.map((year) => <article key={year.year} className={year.year === newestYear ? 'is-current' : ''}>
          <header><div><span>{year.year}{year.incomplete ? ` · hasta ${MONTHS[year.lastMonth]}` : ''}</span><strong className={tone(year.chainedPct)}>{signedPct(year.chainedPct)}</strong><small>Rentabilidad encadenada · derivada</small></div><b>{formatCurrency(year.closing)}<small>Saldo al cierre</small></b></header>
          <div className="est-bars" aria-label={`Resultados mensuales de ${year.year}`}>{year.months.map((month, index) => <button type="button" key={index} disabled={!month} className={`${hoverMonth === index ? 'is-hovered' : ''}${month ? ` ${tone(month.profit)}` : ''}`} onMouseEnter={() => setHoverMonth(index)} onFocus={() => setHoverMonth(index)} onClick={() => openMonth(year, index)} aria-label={month ? `${month.label}: ${signedMoney(month.profit)}, ${signedPct(month.returnPct)}` : `${MONTHS[index]} sin cierre`}><span className="est-bar-value">{month ? compactMoney(month.profit) : '—'}</span><i><b style={{ height: month ? `${Math.max(3, Math.abs(month.profit) / maxProfit * 72)}%` : '2px' }} /></i><small>{MONTHS[index]}</small>{month?.increments ? <em className="is-inflow" /> : null}{month?.decrements ? <em className="is-outflow" /> : null}</button>)}</div>
          <footer><span>Resultado <b className={tone(year.result)}>{signedMoney(year.result)}</b></span><span>Aportado <b>{formatCurrency(year.contributed)}</b></span><span>Retirado <b>{formatCurrency(year.withdrawn)}</b></span></footer>
        </article>)}</div>
      </section>

      <section className="est-section" id="est-calendar">
        <div className="est-section-head"><div><span>MAPA AÑO × MES</span><h2>Rentabilidad mensual publicada</h2><p>Pase el cursor para sincronizar todos los gráficos. Pulse cualquier cifra para abrir su detalle completo.</p></div></div>
        <div className="est-calendar-wrap"><table className="est-calendar"><thead><tr><th>Año</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}<th>Encadenado <small>Derivado</small></th></tr></thead><tbody>{visibleYears.map((year) => <tr key={year.year} className={year.year === newestYear ? 'is-current' : ''}><th>{year.year}{year.year === newestYear ? <small>En curso</small> : null}</th>{year.months.map((month, index) => { const strength = month ? .08 + .32 * Math.abs(month.returnPct) / maxReturn : 0; return <td key={index} className={`${hoverMonth === index ? 'is-hovered' : ''}${month ? ` ${tone(month.returnPct)}` : ''}`} style={month ? { backgroundColor: month.returnPct >= 0 ? `rgba(79,191,138,${strength})` : `rgba(224,100,92,${strength})` } : undefined}><button type="button" disabled={!month} onMouseEnter={() => setHoverMonth(index)} onFocus={() => setHoverMonth(index)} onClick={() => openMonth(year, index)}>{month ? signedPct(month.returnPct) : '—'}{month?.increments ? <i className="is-inflow" /> : null}{month?.decrements ? <i className="is-outflow" /> : null}</button></td>; })}<td className={tone(year.chainedPct)}><strong>{signedPct(year.chainedPct)}</strong></td></tr>)}</tbody></table></div>
      </section>

      <footer className="est-footer"><div><strong>ESTACIONES</strong><span>Observatorio patrimonial · {report.clientCode}</span></div><p>Datos actualizados el {new Date(report.createdAt).toLocaleDateString('es-ES')} · Diseño Claude Fable 5.1</p></footer>

      <div className={`est-detail-backdrop${selected ? ' is-open' : ''}`} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }} aria-hidden={!selected}>
        <aside className="est-detail" role="dialog" aria-modal="false" aria-label={selected ? `Detalle de ${selected.label}` : 'Detalle mensual'}>
          {selected ? <><header><div><span>DETALLE MENSUAL</span><h2>{selected.label}</h2><p>{selected.year === newestYear ? 'Año en curso' : `Ejercicio ${selected.year}`}</p></div><button ref={closeRef} type="button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}>×</button></header>
          <div className="est-detail-metrics"><div><span>Saldo inicial</span><strong>{formatCurrency(selected.opening)}</strong></div><div><span>Aportaciones</span><strong>{formatCurrency(selected.increments)}</strong></div><div><span>Retiradas</span><strong>{formatCurrency(selected.decrements)}</strong></div><div><span>Resultado</span><strong className={tone(selected.profit)}>{signedMoney(selected.profit)}</strong></div><div><span>Rentabilidad</span><strong className={tone(selected.returnPct)}>{signedPct(selected.returnPct)}</strong></div><div><span>Saldo final</span><strong>{formatCurrency(selected.balance)}</strong></div></div>
          {selected.breakdown ? <section className="est-tranches"><h3>Composición del resultado</h3><div><span>Posición inicial</span><b>{formatCurrency(selected.breakdown.openingCapital ?? selected.breakdown.initialCapital)}</b><em>{signedPct(selected.breakdown.initialReturnPct * 100)}</em><strong>{signedMoney(selected.breakdown.initialProfit)}</strong></div>{selected.breakdown.contributions.map((item) => <div key={`inc-${item.iso}`}><span>Aportación {dateLabel(item.iso)}</span><b>{formatCurrency(item.amount)}</b><em>{signedPct(item.returnPct * 100)}</em><strong>{signedMoney(item.profit)}</strong></div>)}{(selected.breakdown.withdrawals ?? []).map((item) => <div key={`dec-${item.iso}`}><span>Retirada {dateLabel(item.iso)}</span><b>{formatCurrency(item.amount)}</b><em>{item.returnPct === undefined ? '—' : signedPct(item.returnPct * 100)}</em><strong>{signedMoney(item.profit)}</strong></div>)}</section> : <p className="est-detail-empty">Este mes no tiene desglose intrames publicado.</p>}
          <div className={`est-reconciliation${Math.abs(selectedDifference) < .01 ? ' is-ok' : ' is-warning'}`}><span>{Math.abs(selectedDifference) < .01 ? 'CIERRE CONCILIADO' : 'DIFERENCIA DE CONCILIACIÓN'}</span><strong>{formatCurrency(selectedCalculated)} {Math.abs(selectedDifference) < .01 ? '=' : 'vs.'} {formatCurrency(selected.balance)}</strong>{Math.abs(selectedDifference) >= .01 ? <small>{signedMoney(selectedDifference)}</small> : null}</div>
          <section className="est-compare"><h3>El mismo mes en otros años</h3>{years.filter((year) => year.year !== selected.year && year.months[selected.month]).map((year) => <div key={year.year}><span>{year.year}</span><strong className={tone(year.months[selected.month]?.returnPct ?? 0)}>{signedPct(year.months[selected.month]?.returnPct ?? 0)}</strong><small>{signedMoney(year.months[selected.month]?.profit ?? 0)}</small></div>)}{years.filter((year) => year.year !== selected.year && year.months[selected.month]).length === 0 ? <p>No hay otro cierre comparable para {selected.short}.</p> : null}</section>
          <section className="est-year-movements"><h3>Movimientos de {selectedYear?.year}</h3>{report.movements.filter((row) => Number(row.iso.slice(0, 4)) === selected.year).map((row, index) => <div key={`${row.iso}-${index}`}><span>{dateLabel(row.iso)}</span><b>{row.type === 'increment' ? 'Aportación' : 'Retirada'}</b><strong>{row.type === 'increment' ? '+' : '−'}{formatCurrency(row.amount)}</strong></div>)}</section>
          </> : null}
        </aside>
      </div>
    </article>
  );
};
