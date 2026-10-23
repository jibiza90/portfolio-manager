import React, { useMemo } from 'react';
import type { ReportData } from '../services/reportLinks';
import type { PdfStudioMonth, PdfStudioSummary } from './PdfDesignStudio';
import './Pdf3SignalDocument.css';

interface Pdf3SignalDocumentProps {
  report: ReportData;
  months: PdfStudioMonth[];
  movements: ReportData['movements'];
  breakdowns: NonNullable<ReportData['contributionBreakdowns']>;
  summary: PdfStudioSummary;
}

type MovementRow = ReportData['movements'][number] & { netCapital: number };

const money = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const wholeMoney = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const compactMoney = new Intl.NumberFormat('es-ES', {
  notation: 'compact',
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 1
});

const formatMoney = (value: number) => money.format(Number.isFinite(value) ? value : 0);
const formatWholeMoney = (value: number) => wholeMoney.format(Number.isFinite(value) ? value : 0);
const formatCompactMoney = (value: number) => compactMoney.format(Number.isFinite(value) ? value : 0);
const formatSignedMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatMoney(0);
  return `${safe > 0 ? '+' : '-'}${formatMoney(Math.abs(safe))}`;
};
const formatSignedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00%';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toFixed(2).replace('.', ',')}%`;
};
const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
};
const shortMonth = (month: PdfStudioMonth) => {
  const match = month.key.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month.label;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const label = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${match[1].slice(-2)}`;
};
const split = <T,>(rows: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
};
const niceCeiling = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 100000;
  const base = 10 ** Math.floor(Math.log10(value));
  const ratio = value / base;
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return step * base;
};

const PageChrome = ({
  report,
  page,
  total,
  section,
  period
}: {
  report: ReportData;
  page: number;
  total: number;
  section: string;
  period: string;
}) => (
  <>
    <header className="pdf3-page-header">
      <div className="pdf3-wordmark"><i aria-hidden="true" /><strong>PORTFOLIO MANAGER</strong><span>WEALTH STATEMENT</span></div>
      <div className="pdf3-header-context"><span>{section}</span><strong>{report.clientCode}</strong></div>
    </header>
    <footer className="pdf3-page-footer">
      <span>INFORME CONFIDENCIAL</span>
      <strong>{period}</strong>
      <b>{String(page).padStart(2, '0')}<i>/</i>{String(total).padStart(2, '0')}</b>
    </footer>
  </>
);

const BalanceTrajectory = ({ months }: { months: PdfStudioMonth[] }) => {
  if (months.length === 0) return <div className="pdf3-empty">Sin cierres mensuales en el periodo seleccionado.</div>;
  const width = 790;
  const height = 252;
  const left = 66;
  const right = 20;
  const top = 40;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = niceCeiling(Math.max(...months.map((month) => month.endBalance), 1));
  const points = months.map((month, index) => ({
    ...month,
    x: months.length === 1 ? left + plotWidth / 2 : left + index / (months.length - 1) * plotWidth,
    y: top + (1 - month.endBalance / max) * plotHeight
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${top + plotHeight} L ${points[0].x} ${top + plotHeight} Z`;
  const monthEvery = months.length <= 13 ? 1 : Math.ceil(months.length / 12);
  const valueEvery = months.length <= 8 ? 1 : Math.ceil(months.length / 7);

  return (
    <svg className="pdf3-balance-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolucion mensual del valor de cartera">
      <defs>
        <linearGradient id="pdf3-balance-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3e63dd" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3e63dd" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = top + ratio * plotHeight;
        return (
          <g key={ratio}>
            <line x1={left} y1={y} x2={width - right} y2={y} className="pdf3-chart-grid" />
            <text x={left - 11} y={y + 3} textAnchor="end" className="pdf3-chart-axis">{formatCompactMoney(max * (1 - ratio))}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#pdf3-balance-area)" />
      {points.length > 1 ? <path d={path} fill="none" className="pdf3-chart-line" /> : null}
      {points.map((point, index) => {
        const showMonth = index % monthEvery === 0 || index === points.length - 1;
        const showValue = index % valueEvery === 0 || index === points.length - 1;
        const labelY = index % 2 === 0 ? point.y - 13 : point.y + 21;
        return (
          <g key={point.key}>
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3.4} className={index === points.length - 1 ? 'pdf3-chart-point is-latest' : 'pdf3-chart-point'} />
            {showValue ? <text x={point.x} y={Math.max(15, Math.min(top + plotHeight - 5, labelY))} textAnchor="middle" className="pdf3-chart-value">{formatWholeMoney(point.endBalance)}</text> : null}
            {showMonth ? <text x={point.x} y={height - 13} textAnchor="middle" className="pdf3-chart-month">{shortMonth(point)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
};

const ReturnBars = ({ months }: { months: PdfStudioMonth[] }) => {
  if (months.length === 0) return <div className="pdf3-empty">Sin rentabilidad mensual en el periodo seleccionado.</div>;
  const visible = months.slice(-18);
  const width = 700;
  const height = 250;
  const left = 28;
  const right = 12;
  const top = 38;
  const bottom = 45;
  const maxAbs = Math.max(1, ...visible.map((month) => Math.abs(month.returnPct)));
  const hasNegative = visible.some((month) => month.returnPct < 0);
  const plotHeight = height - top - bottom;
  const baseline = hasNegative ? top + plotHeight / 2 : top + plotHeight;
  const barRange = hasNegative ? plotHeight / 2 - 8 : plotHeight - 8;
  const slot = (width - left - right) / visible.length;
  const barWidth = Math.min(25, slot * 0.5);

  return (
    <svg className="pdf3-return-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rentabilidad mensual TWR">
      <line x1={left} y1={baseline} x2={width - right} y2={baseline} className="pdf3-zero-line" />
      {visible.map((month, index) => {
        const h = Math.max(2, Math.abs(month.returnPct) / maxAbs * barRange);
        const x = left + slot * index + (slot - barWidth) / 2;
        const y = month.returnPct >= 0 ? baseline - h : baseline;
        const valueY = month.returnPct >= 0 ? Math.max(14, y - 7) : Math.min(height - 28, y + h + 13);
        return (
          <g key={month.key}>
            <rect x={x} y={y} width={barWidth} height={h} rx="3" className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'} />
            <text x={x + barWidth / 2} y={valueY} textAnchor="middle" className={month.returnPct >= 0 ? 'pdf3-bar-value is-positive' : 'pdf3-bar-value is-negative'}>{formatSignedPercent(month.returnPct)}</text>
            <text x={x + barWidth / 2} y={height - 12} textAnchor="middle" className="pdf3-chart-month">{shortMonth(month)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const ProfitDots = ({ months }: { months: PdfStudioMonth[] }) => {
  if (months.length === 0) return <div className="pdf3-empty">Sin beneficios mensuales en el periodo seleccionado.</div>;
  const visible = months.slice(-18);
  const width = 700;
  const height = 170;
  const left = 55;
  const right = 12;
  const top = 24;
  const bottom = 38;
  const values = visible.map((month) => month.profit);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(1, max - min);
  const zeroY = top + max / span * (height - top - bottom);
  const slot = (width - left - right) / visible.length;

  return (
    <svg className="pdf3-profit-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Beneficio mensual en euros">
      <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} className="pdf3-zero-line" />
      {visible.map((month, index) => {
        const x = left + slot * (index + 0.5);
        const y = top + (max - month.profit) / span * (height - top - bottom);
        return (
          <g key={month.key}>
            <line x1={x} y1={zeroY} x2={x} y2={y} className={month.profit >= 0 ? 'pdf3-profit-stem is-positive' : 'pdf3-profit-stem is-negative'} />
            <circle cx={x} cy={y} r="4.5" className={month.profit >= 0 ? 'pdf3-profit-dot is-positive' : 'pdf3-profit-dot is-negative'} />
            <text x={x} y={month.profit >= 0 ? Math.max(12, y - 9) : Math.min(height - 25, y + 16)} textAnchor="middle" className="pdf3-chart-value">{formatWholeMoney(month.profit)}</text>
            <text x={x} y={height - 10} textAnchor="middle" className="pdf3-chart-month">{shortMonth(month)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const MonthLedger = ({ rows }: { rows: PdfStudioMonth[] }) => (
  <div className="pdf3-ledger pdf3-month-ledger">
    <div className="pdf3-ledger-row pdf3-ledger-head"><span>Cierre</span><span>Beneficio</span><span>TWR mensual</span><span>Valor de cartera</span></div>
    {rows.map((month) => (
      <div className="pdf3-ledger-row" key={month.key}>
        <strong>{month.closeLabel}</strong>
        <span className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(month.profit)}</span>
        <span className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(month.returnPct)}</span>
        <b>{formatMoney(month.endBalance)}</b>
      </div>
    ))}
  </div>
);

const MovementLedger = ({ rows }: { rows: MovementRow[] }) => (
  <div className="pdf3-ledger pdf3-movement-ledger">
    <div className="pdf3-ledger-row pdf3-ledger-head"><span>Fecha</span><span>Movimiento</span><span>Importe</span><span>Capital neto</span></div>
    {rows.map((movement, index) => (
      <div className="pdf3-ledger-row" key={`${movement.iso}-${movement.amount}-${index}`}>
        <strong>{shortDate(movement.iso)}</strong>
        <span>{movement.type === 'increment' ? 'Aportaci\u00f3n' : 'Retirada'}</span>
        <span className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '-'}{formatMoney(movement.amount)}</span>
        <b>{formatMoney(movement.netCapital)}</b>
      </div>
    ))}
  </div>
);

const CapitalPulse = ({ rows }: { rows: MovementRow[] }) => {
  if (rows.length === 0) return <div className="pdf3-empty">No existen movimientos de capital dentro del periodo seleccionado.</div>;
  const width = 760;
  const height = 150;
  const left = 55;
  const right = 20;
  const top = 22;
  const bottom = 38;
  const min = Math.min(0, ...rows.map((row) => row.netCapital));
  const max = niceCeiling(Math.max(1, ...rows.map((row) => row.netCapital)));
  const span = Math.max(1, max - min);
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? left + (width - left - right) / 2 : left + index / (rows.length - 1) * (width - left - right),
    y: top + (max - row.netCapital) / span * (height - top - bottom)
  }));
  const path = points.reduce((result, point, index) => index === 0 ? `M ${point.x} ${point.y}` : `${result} H ${point.x} V ${point.y}`, '');
  const labelEvery = rows.length <= 10 ? 1 : Math.ceil(rows.length / 10);
  return (
    <svg className="pdf3-capital-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trayectoria del capital neto">
      <line x1={left} y1={top} x2={width - right} y2={top} className="pdf3-chart-grid" />
      <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="pdf3-chart-grid" />
      <text x={left - 9} y={top + 3} textAnchor="end" className="pdf3-chart-axis">{formatCompactMoney(max)}</text>
      <text x={left - 9} y={height - bottom + 3} textAnchor="end" className="pdf3-chart-axis">{formatCompactMoney(min)}</text>
      <path d={path} fill="none" className="pdf3-capital-line" />
      {points.map((point, index) => (
        <g key={`${point.iso}-${index}`}>
          <circle cx={point.x} cy={point.y} r="4" className={point.type === 'increment' ? 'pdf3-capital-point is-increment' : 'pdf3-capital-point is-decrement'} />
          {(index % labelEvery === 0 || index === points.length - 1) ? <text x={point.x} y={height - 11} textAnchor="middle" className="pdf3-chart-month">{shortDate(point.iso).slice(0, 6)}{point.iso.slice(2, 4)}</text> : null}
        </g>
      ))}
    </svg>
  );
};

const BreakdownModule = ({ breakdown }: { breakdown: NonNullable<ReportData['contributionBreakdowns']>[number] }) => {
  const withdrawals = breakdown.withdrawals ?? [];
  const opening = breakdown.openingCapital ?? breakdown.initialCapital + withdrawals.reduce((sum, row) => sum + row.amount, 0);
  return (
    <article className="pdf3-breakdown">
      <header>
        <div><span>MES CON MOVIMIENTOS</span><h3>{breakdown.month}</h3></div>
        <div><small>Beneficio explicado</small><strong className={breakdown.totalProfit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(breakdown.totalProfit)}</strong></div>
      </header>
      <div className="pdf3-breakdown-opening"><span>Saldo al inicio del mes</span><strong>{formatMoney(opening)}</strong></div>
      <div className="pdf3-breakdown-row is-head"><span>Tramo de capital</span><span>Importe</span><span>Rentabilidad</span><span>Beneficio</span></div>
      <div className="pdf3-breakdown-row">
        <strong>{withdrawals.length ? 'Capital mantenido hasta el cierre' : 'Posici\u00f3n inicial del mes'}</strong>
        <span>{formatMoney(breakdown.initialCapital)}</span>
        <span>{formatSignedPercent(breakdown.initialReturnPct * 100)}</span>
        <span className={breakdown.initialProfit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(breakdown.initialProfit)}</span>
      </div>
      {breakdown.contributions.map((row) => (
        <div className="pdf3-breakdown-row" key={`${row.iso}-${row.amount}`}>
          <strong>Aportaci&oacute;n incorporada el {shortDate(row.iso)}</strong>
          <span>{formatMoney(row.amount)}</span><span>{formatSignedPercent(row.returnPct * 100)}</span>
          <span className={row.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(row.profit)}</span>
        </div>
      ))}
      {withdrawals.map((row) => (
        <div className="pdf3-breakdown-row" key={`${row.iso}-${row.amount}-withdrawal`}>
          <strong>Capital retirado el {shortDate(row.iso)}</strong>
          <span>{formatMoney(row.amount)}</span><span>{row.returnPct === undefined ? '-' : formatSignedPercent(row.returnPct * 100)}</span>
          <span className={row.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(row.profit)}</span>
        </div>
      ))}
    </article>
  );
};

export const Pdf3SignalDocument = React.forwardRef<HTMLDivElement, Pdf3SignalDocumentProps>(({
  report,
  months,
  movements,
  breakdowns,
  summary
}, ref) => {
  const monthChunks = useMemo(() => months.length ? split(months, 17) : [[]], [months]);
  const movementRows = useMemo(() => {
    let netCapital = 0;
    return movements.map((movement) => {
      netCapital += movement.type === 'increment' ? movement.amount : -movement.amount;
      return { ...movement, netCapital };
    });
  }, [movements]);
  const movementChunks = useMemo(() => split(movementRows, 11), [movementRows]);
  const breakdownChunks = useMemo(() => split(breakdowns, 2), [breakdowns]);
  const capitalPages = Math.max(1, movementChunks.length);
  const totalPages = 2 + monthChunks.length + capitalPages + breakdownChunks.length + 1;
  const netCapital = summary.increments - summary.decrements;
  const historicalTwr = (report.twrYtd ?? 0) * 100;
  const bestMonth = months.reduce<PdfStudioMonth | null>((best, month) => !best || month.returnPct > best.returnPct ? month : best, null);
  const positiveMonths = months.filter((month) => month.returnPct > 0).length;
  const issuedAt = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const updatedAt = new Date(report.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  let page = 1;
  const pages: React.ReactNode[] = [];

  const addPage = (key: string, section: string, body: React.ReactNode, className = '') => {
    const current = page;
    page += 1;
    pages.push(
      <section className={`pdf-document-page pdf3-document-page ${className}`.trim()} data-pdf-page={current} key={key}>
        <PageChrome report={report} page={current} total={totalPages} section={section} period={summary.periodLabel} />
        <div className="pdf3-page-body">{body}</div>
      </section>
    );
  };

  addPage('overview', 'SITUACION PATRIMONIAL', (
    <>
      <div className="pdf3-overview-grid">
        <aside className="pdf3-index-rail">
          <span>PDF 3 / SIGNAL</span>
          <h1>Lectura<br />patrimonial.</h1>
          <p>Una visi&oacute;n precisa de la cartera, su rendimiento y sus movimientos de capital.</p>
          <div><small>PERIODO ANALIZADO</small><strong>{summary.periodLabel}</strong></div>
          <div><small>DOCUMENTO EMITIDO</small><strong>{issuedAt}</strong></div>
          <div><small>IDENTIFICADOR</small><strong>{report.clientCode}</strong></div>
        </aside>
        <main className="pdf3-overview-main">
          <section className="pdf3-balance-hero">
            <div><span>Valor actual de cartera</span><strong>{formatMoney(summary.endBalance)}</strong><small>Valor publicado al cierre del periodo</small></div>
            <div className={summary.profit >= 0 ? 'is-positive' : 'is-negative'}><span>Beneficio del periodo</span><strong>{formatSignedMoney(summary.profit)}</strong><small>{formatSignedPercent(summary.returnPct * 100)} TWR del periodo</small></div>
          </section>
          <section className="pdf3-signal-metrics">
            <article><span>Saldo inicial</span><strong>{formatMoney(summary.startBalance)}</strong><small>Punto de partida</small></article>
            <article><span>Capital neto</span><strong>{formatSignedMoney(netCapital)}</strong><small>Aportaciones menos retiradas</small></article>
            <article><span>TWR acumulado</span><strong className={historicalTwr >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(historicalTwr)}</strong><small>Historial publicado</small></article>
            <article><span>Rentabilidad total</span><strong className={report.rentabilidad >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(report.rentabilidad)}</strong><small>Sobre capital neto aportado</small></article>
          </section>
          <section className="pdf3-panel pdf3-overview-chart">
            <div className="pdf3-panel-title"><div><span>01 / TRAYECTORIA</span><h2>Evoluci&oacute;n del patrimonio</h2></div><p>Valor de cartera al cierre de cada mes.</p></div>
            <BalanceTrajectory months={months} />
          </section>
          <div className="pdf3-reading-strip">
            <span><i>01</i><strong>{formatMoney(summary.startBalance)}</strong><small>Saldo inicial</small></span>
            <b aria-hidden="true">&rarr;</b>
            <span><i>02</i><strong>{formatSignedMoney(netCapital)}</strong><small>Capital neto</small></span>
            <b aria-hidden="true">&rarr;</b>
            <span><i>03</i><strong>{formatSignedMoney(summary.profit)}</strong><small>Beneficio</small></span>
            <b aria-hidden="true">&rarr;</b>
            <span className="is-final"><i>04</i><strong>{formatMoney(summary.endBalance)}</strong><small>Valor final</small></span>
          </div>
        </main>
      </div>
    </>
  ), 'pdf3-overview-page');

  addPage('performance', 'RENDIMIENTO MENSUAL', (
    <>
      <div className="pdf3-page-intro">
        <div><span>02 / RENDIMIENTO</span><h1>Cada mes,<br />en su contexto.</h1></div>
        <p>Rentabilidad TWR y beneficio en euros: dos lecturas distintas del rendimiento de un mismo periodo.</p>
      </div>
      <div className="pdf3-performance-grid">
        <section className="pdf3-panel">
          <div className="pdf3-panel-title"><div><span>TWR MENSUAL</span><h2>Rentabilidad</h2></div><strong className={summary.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(summary.returnPct * 100)}</strong></div>
          <ReturnBars months={months} />
        </section>
        <section className="pdf3-panel">
          <div className="pdf3-panel-title"><div><span>RESULTADO ECONOMICO</span><h2>Beneficio mensual</h2></div><strong className={summary.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(summary.profit)}</strong></div>
          <ProfitDots months={months} />
        </section>
      </div>
      <section className="pdf3-performance-reading">
        <div><span>LECTURA DEL PERIODO</span><p>El TWR muestra el comportamiento de la inversi&oacute;n sin confundirlo con las entradas o salidas de capital.</p></div>
        <article><span>Mes con mayor rentabilidad</span><strong>{bestMonth ? shortMonth(bestMonth) : '-'}</strong><small>{bestMonth ? formatSignedPercent(bestMonth.returnPct) : '-'}</small></article>
        <article><span>Meses positivos</span><strong>{positiveMonths} de {months.length}</strong><small>Seg&uacute;n TWR mensual publicado</small></article>
        <article><span>Beneficio del periodo</span><strong className={summary.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(summary.profit)}</strong><small>{summary.periodLabel}</small></article>
      </section>
    </>
  ), 'pdf3-performance-page');

  monthChunks.forEach((chunk, index) => {
    addPage(`monthly-${index}`, 'REGISTRO MENSUAL', (
      <>
        <div className="pdf3-page-intro">
          <div><span>02 / RENDIMIENTO</span><h1>Registro mensual.</h1></div>
          <p>{monthChunks.length > 1 ? `Parte ${index + 1} de ${monthChunks.length}. ` : ''}Cierres publicados dentro del periodo seleccionado.</p>
        </div>
        <section className="pdf3-panel pdf3-monthly-section is-continuation">
          <div className="pdf3-panel-title"><div><span>CIERRES PUBLICADOS</span><h2>Detalle mensual</h2></div><p>{months.length} {months.length === 1 ? 'mes' : 'meses'} en el periodo</p></div>
          <MonthLedger rows={chunk} />
        </section>
      </>
    ), 'pdf3-ledger-page');
  });

  if (movementChunks.length === 0) {
    addPage('capital-empty', 'MOVIMIENTOS DE CAPITAL', (
      <>
        <div className="pdf3-page-intro"><div><span>03 / CAPITAL</span><h1>Capital<br />sin movimientos.</h1></div><p>El periodo seleccionado no contiene aportaciones ni retiradas.</p></div>
        <section className="pdf3-capital-totals">
          <article><span>Capital aportado</span><strong>{formatMoney(summary.increments)}</strong></article>
          <article><span>Capital retirado</span><strong>{formatMoney(summary.decrements)}</strong></article>
          <article><span>Capital neto</span><strong>{formatSignedMoney(netCapital)}</strong></article>
        </section>
        <section className="pdf3-panel pdf3-no-movements"><span>PERIODO SIN MOVIMIENTOS</span><h2>La evoluci&oacute;n observada corresponde al comportamiento de la cartera.</h2><p>Las aportaciones y retiradas se muestran separadas del beneficio para mantener una lectura financiera clara.</p></section>
      </>
    ), 'pdf3-capital-page');
  } else {
    movementChunks.forEach((chunk, index) => {
      addPage(`capital-${index}`, 'MOVIMIENTOS DE CAPITAL', (
        <>
          <div className="pdf3-page-intro"><div><span>03 / CAPITAL</span><h1>{index === 0 ? <>Cada movimiento,<br />con trazabilidad.</> : 'Registro de capital.'}</h1></div><p>{index === 0 ? 'Aportaciones y retiradas registradas dentro del periodo seleccionado.' : `Continuaci\u00f3n ${index + 1} de ${movementChunks.length}.`}</p></div>
          {index === 0 ? (
            <section className="pdf3-capital-totals">
              <article><span>Capital aportado</span><strong>{formatMoney(summary.increments)}</strong></article>
              <article><span>Capital retirado</span><strong>{formatMoney(summary.decrements)}</strong></article>
              <article><span>Capital neto</span><strong>{formatSignedMoney(netCapital)}</strong></article>
            </section>
          ) : null}
          <div className="pdf3-capital-layout">
            <section className="pdf3-panel">
              <div className="pdf3-panel-title"><div><span>REGISTRO</span><h2>Movimientos de capital</h2></div><p>{movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}</p></div>
              <MovementLedger rows={chunk} />
            </section>
            {index === 0 ? <section className="pdf3-panel pdf3-capital-pulse"><div className="pdf3-panel-title"><div><span>TRAYECTORIA</span><h2>Capital neto</h2></div><strong>{formatSignedMoney(netCapital)}</strong></div><CapitalPulse rows={movementRows} /></section> : null}
          </div>
          {index === 0 ? <aside className="pdf3-capital-note"><b>i</b><p><strong>Lectura financiera.</strong> Una aportaci&oacute;n o retirada modifica el capital invertido, pero no es beneficio ni p&eacute;rdida. El rendimiento se presenta de forma independiente.</p></aside> : null}
        </>
      ), 'pdf3-capital-page');
    });
  }

  breakdownChunks.forEach((chunk, index) => {
    addPage(`breakdown-${index}`, 'MESES CON MOVIMIENTOS', (
      <>
        <div className="pdf3-page-intro"><div><span>04 / EXPLICACION</span><h1>C&oacute;mo se gener&oacute;<br />el beneficio.</h1></div><p>Separaci&oacute;n del capital inicial y de cada movimiento con rentabilidad espec&iacute;fica.</p></div>
        <section className="pdf3-breakdown-list">{chunk.map((breakdown) => <BreakdownModule breakdown={breakdown} key={breakdown.month} />)}</section>
      </>
    ), 'pdf3-breakdown-page');
  });

  addPage('method', 'CRITERIO DE LECTURA', (
    <>
      <div className="pdf3-page-intro"><div><span>{breakdowns.length ? '05' : '04'} / CRITERIO</span><h1>Dos formas de leer<br />la rentabilidad.</h1></div><p>Indicadores complementarios, no intercambiables.</p></div>
      <section className="pdf3-method-comparison">
        <article>
          <span>01</span><div><small>RENDIMIENTO DE LA ESTRATEGIA</small><h2>TWR</h2><h3>Rentabilidad ponderada por el tiempo</h3></div>
          <p>Mide la evoluci&oacute;n de la cartera aislando el efecto de las aportaciones y retiradas. Permite conocer c&oacute;mo se han comportado las inversiones durante el periodo, independientemente de cu&aacute;ndo entr&oacute; o sali&oacute; capital.</p>
          <strong className={historicalTwr >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(historicalTwr)}</strong><small>TWR acumulado publicado</small>
        </article>
        <article>
          <span>02</span><div><small>RESULTADO SOBRE EL CAPITAL</small><h2>Rentabilidad total</h2><h3>Beneficio frente al capital neto aportado</h3></div>
          <p>Mide el resultado acumulado de la inversi&oacute;n en relaci&oacute;n con el capital neto aportado. Por ese motivo puede variar cuando se realizan nuevas aportaciones o retiradas de dinero.</p>
          <strong className={report.rentabilidad >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(report.rentabilidad)}</strong><small>Rentabilidad total publicada</small>
        </article>
      </section>
      <section className="pdf3-final-band">
        <div><span>Valor actual de cartera</span><strong>{formatMoney(summary.endBalance)}</strong></div>
        <div><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(report.beneficioTotal)}</strong></div>
        <div><span>Capital neto hist&oacute;rico</span><strong>{formatMoney(report.incrementos - report.decrementos)}</strong></div>
      </section>
      <section className="pdf3-document-record">
        <div><span>Usuario</span><strong>{report.clientCode}</strong></div>
        <div><span>Periodo</span><strong>{summary.periodLabel}</strong></div>
        <div><span>Datos actualizados</span><strong>{updatedAt}</strong></div>
        <div><span>Documento emitido</span><strong>{issuedAt}</strong></div>
      </section>
      <div className="pdf3-final-statement"><i aria-hidden="true" /><div><strong>PORTFOLIO MANAGER</strong><p>Informe patrimonial elaborado a partir de la informaci&oacute;n publicada para el usuario. Documento de lectura y seguimiento.</p></div></div>
    </>
  ), 'pdf3-method-page');

  return <div className="pdf3-document" ref={ref}>{pages}</div>;
});

Pdf3SignalDocument.displayName = 'Pdf3SignalDocument';
