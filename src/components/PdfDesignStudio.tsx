import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import './PdfDesignStudio.css';

export type PdfDesignId = 'pdf1' | 'pdf2';

export interface PdfStudioMonth {
  key: string;
  label: string;
  closeLabel: string;
  profit: number;
  returnPct: number;
  endBalance: number;
}

export interface PdfStudioSummary {
  periodLabel: string;
  startBalance: number;
  endBalance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
}

interface PdfDesignStudioProps {
  report: ReportData;
  months: PdfStudioMonth[];
  movements: ReportData['movements'];
  breakdowns: NonNullable<ReportData['contributionBreakdowns']>;
  summary: PdfStudioSummary;
  selectedDesign: PdfDesignId;
  onDesignChange: (design: PdfDesignId) => void;
  loadCurrentPdf: () => Promise<{ blob: Blob; filename: string }>;
  onPdf2DownloaderReady?: (download: (() => Promise<void>) | null) => void;
  onDownloaded?: (details: {
    reportClientId: string;
    reportLabel: string;
    periodStart: string;
    periodEnd: string;
    filename: string;
    reportUpdatedAt: number;
  }) => void;
  periodStart: string;
  periodEnd: string;
}

const moneyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const wholeMoneyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const compactMoneyFormatter = new Intl.NumberFormat('es-ES', {
  notation: 'compact',
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 1
});

const formatMoney = (value: number) => moneyFormatter.format(Number.isFinite(value) ? value : 0);
const formatWholeMoney = (value: number) => wholeMoneyFormatter.format(Number.isFinite(value) ? value : 0);
const formatCompactMoney = (value: number) => compactMoneyFormatter.format(Number.isFinite(value) ? value : 0);
const formatSignedMoney = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Math.abs(safeValue) < 0.005) return formatMoney(0);
  return `${safeValue > 0 ? '+' : '-'}${formatMoney(Math.abs(safeValue))}`;
};
const formatSignedPercent = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Math.abs(safeValue) < 0.005) return '0,00%';
  return `${safeValue > 0 ? '+' : '-'}${Math.abs(safeValue).toFixed(2).replace('.', ',')}%`;
};

const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
};

const monthCompact = (month: PdfStudioMonth) => {
  const match = month.key.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month.label;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const label = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${match[1].slice(-2)}`;
};

const splitIntoChunks = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const niceCeiling = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 100000;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
};

const PageHeader = ({ report, section }: { report: ReportData; section: string }) => (
  <header className="pdf2-page-header">
    <div className="pdf2-brand-lockup">
      <span className="pdf2-brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <div><strong>PORTFOLIO MANAGER</strong><small>Private investment reporting</small></div>
    </div>
    <div className="pdf2-page-context"><span>{section}</span><strong>{report.clientCode}</strong></div>
  </header>
);

const PageFooter = ({ report, page, total, periodLabel }: { report: ReportData; page: number; total: number; periodLabel: string }) => (
  <footer className="pdf2-page-footer">
    <span>Documento confidencial &middot; {report.clientCode}</span>
    <span>{periodLabel}</span>
    <strong>{String(page).padStart(2, '0')} / {String(total).padStart(2, '0')}</strong>
  </footer>
);

const PatrimonyChart = ({ months }: { months: PdfStudioMonth[] }) => {
  if (months.length === 0) return <div className="pdf2-chart-empty">Sin cierres mensuales en el periodo seleccionado.</div>;
  const width = 680;
  const height = 252;
  const left = 54;
  const right = 18;
  const top = 30;
  const bottom = 43;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = niceCeiling(Math.max(...months.map((month) => month.endBalance), 1));
  const points = months.map((month, index) => ({
    ...month,
    x: months.length === 1 ? left + plotWidth / 2 : left + (index / (months.length - 1)) * plotWidth,
    y: top + (1 - month.endBalance / maxValue) * plotHeight
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length > 1
    ? `M ${points[0].x} ${top + plotHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points[points.length - 1].x} ${top + plotHeight} Z`
    : '';
  const labelEvery = months.length <= 12 ? 1 : Math.ceil(months.length / 10);
  const valueEvery = months.length <= 10 ? 1 : Math.ceil(months.length / 7);

  return (
    <svg className="pdf2-patrimony-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolucion del valor de cartera">
      <defs>
        <linearGradient id="pdf2Area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d8c7d" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#1d8c7d" stopOpacity="0.015" />
        </linearGradient>
        <linearGradient id="pdf2Line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#244b63" />
          <stop offset="100%" stopColor="#1d8c7d" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = top + ratio * plotHeight;
        const value = maxValue * (1 - ratio);
        return (
          <g key={ratio}>
            <line x1={left} y1={y} x2={width - right} y2={y} className="pdf2-grid-line" />
            <text x={left - 9} y={y + 3} textAnchor="end" className="pdf2-axis-value">{formatCompactMoney(value)}</text>
          </g>
        );
      })}
      {area ? <path d={area} fill="url(#pdf2Area)" /> : null}
      {points.length > 1 ? <polyline points={line} fill="none" stroke="url(#pdf2Line)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {points.map((point, index) => {
        const showMonth = index % labelEvery === 0 || index === points.length - 1;
        const showValue = index % valueEvery === 0 || index === points.length - 1;
        const valueY = index % 2 === 0 ? point.y - 12 : point.y + 20;
        return (
          <g key={point.key}>
            <line x1={point.x} y1={point.y} x2={point.x} y2={top + plotHeight} className="pdf2-point-guide" />
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3.5} className={index === points.length - 1 ? 'is-latest' : ''} />
            {showValue ? <text x={point.x} y={Math.max(13, Math.min(top + plotHeight - 4, valueY))} textAnchor="middle" className="pdf2-point-value">{formatWholeMoney(point.endBalance)}</text> : null}
            {showMonth ? <text x={point.x} y={height - 13} textAnchor="middle" className="pdf2-axis-month">{monthCompact(point)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
};

const ReturnsChart = ({ months }: { months: PdfStudioMonth[] }) => {
  if (months.length === 0) return <div className="pdf2-chart-empty">Sin rentabilidad mensual en el periodo seleccionado.</div>;
  const visible = months.slice(-12);
  const width = 680;
  const height = 216;
  const left = 30;
  const right = 14;
  const top = 32;
  const bottom = 40;
  const plotHeight = height - top - bottom;
  const maxAbs = Math.max(1, ...visible.map((month) => Math.abs(month.returnPct)));
  const hasNegative = visible.some((month) => month.returnPct < 0);
  const baseline = hasNegative ? top + plotHeight / 2 : top + plotHeight;
  const availableHeight = hasNegative ? plotHeight / 2 - 7 : plotHeight - 8;
  const slot = (width - left - right) / visible.length;
  const barWidth = Math.min(34, slot * 0.54);

  return (
    <svg className="pdf2-returns-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rentabilidad mensual">
      <line x1={left} y1={baseline} x2={width - right} y2={baseline} className="pdf2-return-zero" />
      {visible.map((month, index) => {
        const barHeight = Math.max(2, Math.abs(month.returnPct) / maxAbs * availableHeight);
        const x = left + index * slot + (slot - barWidth) / 2;
        const y = month.returnPct >= 0 ? baseline - barHeight : baseline;
        const valueY = month.returnPct >= 0 ? Math.max(16, y - 7) : Math.min(height - 30, y + barHeight + 13);
        return (
          <g key={month.key}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx="5" className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'} />
            <text x={x + barWidth / 2} y={valueY} textAnchor="middle" className={month.returnPct >= 0 ? 'pdf2-return-value is-positive' : 'pdf2-return-value is-negative'}>{formatSignedPercent(month.returnPct)}</text>
            <text x={x + barWidth / 2} y={height - 13} textAnchor="middle" className="pdf2-axis-month">{monthCompact(month)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const MonthlyTable = ({ months }: { months: PdfStudioMonth[] }) => (
  <div className="pdf2-table pdf2-monthly-table">
    <div className="pdf2-table-row pdf2-table-head">
      <span>Fecha de cierre</span><span>Beneficio</span><span>Rentabilidad</span><span>Valor de cartera</span>
    </div>
    {months.map((month) => (
      <div className="pdf2-table-row" key={month.key}>
        <strong>{month.closeLabel}</strong>
        <span className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(month.profit)}</span>
        <span className={month.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(month.returnPct)}</span>
        <span>{formatMoney(month.endBalance)}</span>
      </div>
    ))}
  </div>
);

type PdfMovementRow = ReportData['movements'][number] & { netCapital: number };

const MovementTable = ({ rows }: { rows: PdfMovementRow[] }) => {
  return (
    <div className="pdf2-table pdf2-movement-table">
      <div className="pdf2-table-row pdf2-table-head">
        <span>Fecha</span><span>Movimiento</span><span>Importe</span><span>Capital neto</span>
      </div>
      {rows.map((movement, index) => (
        <div className="pdf2-table-row" key={`${movement.iso}-${movement.type}-${movement.amount}-${index}`}>
          <strong>{shortDate(movement.iso)}</strong>
          <span>{movement.type === 'increment' ? 'Aportaci\u00f3n' : 'Retirada'}</span>
          <span className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '-'}{formatMoney(movement.amount)}</span>
          <span>{formatMoney(movement.netCapital)}</span>
        </div>
      ))}
    </div>
  );
};

const CapitalPathChart = ({ rows }: { rows: PdfMovementRow[] }) => {
  if (rows.length === 0) return null;
  const width = 680;
  const height = 154;
  const left = 54;
  const right = 18;
  const top = 25;
  const bottom = 37;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minValue = Math.min(0, ...rows.map((row) => row.netCapital));
  const maxValue = niceCeiling(Math.max(1, ...rows.map((row) => row.netCapital)));
  const domain = Math.max(1, maxValue - minValue);
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? left + plotWidth / 2 : left + (index / (rows.length - 1)) * plotWidth,
    y: top + ((maxValue - row.netCapital) / domain) * plotHeight
  }));
  const stepPath = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    return `${path} H ${point.x} V ${point.y}`;
  }, '');
  const labelEvery = rows.length <= 8 ? 1 : Math.ceil(rows.length / 8);

  return (
    <section className="pdf2-capital-path">
      <div className="pdf2-capital-path-title"><span>TRAYECTORIA DEL CAPITAL NETO</span><strong>{formatSignedMoney(rows[rows.length - 1].netCapital)}</strong></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución del capital neto aportado">
        {[0, 0.5, 1].map((ratio) => {
          const value = maxValue - domain * ratio;
          const y = top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="pdf2-grid-line" />
              <text x={left - 9} y={y + 3} textAnchor="end" className="pdf2-axis-value">{formatCompactMoney(value)}</text>
            </g>
          );
        })}
        <path d={stepPath} fill="none" className="pdf2-capital-step" />
        {points.map((point, index) => {
          const showLabel = index % labelEvery === 0 || index === points.length - 1;
          return (
            <g key={`${point.iso}-${index}`}>
              <circle cx={point.x} cy={point.y} r="4" className={point.type === 'increment' ? 'is-increment' : 'is-decrement'} />
              {showLabel ? <text x={point.x} y={height - 12} textAnchor="middle" className="pdf2-axis-month">{shortDate(point.iso).slice(0, 6)}{point.iso.slice(2, 4)}</text> : null}
              {showLabel ? <text x={point.x} y={Math.max(13, point.y - 9)} textAnchor="middle" className="pdf2-point-value">{formatWholeMoney(point.netCapital)}</text> : null}
            </g>
          );
        })}
      </svg>
    </section>
  );
};

const BreakdownCard = ({ breakdown }: { breakdown: NonNullable<ReportData['contributionBreakdowns']>[number] }) => {
  const withdrawals = breakdown.withdrawals ?? [];
  const openingCapital = breakdown.openingCapital ?? breakdown.initialCapital + withdrawals.reduce((sum, item) => sum + item.amount, 0);
  return (
    <article className="pdf2-breakdown-card">
      <header>
        <div><span>MES CON MOVIMIENTOS</span><h3>{breakdown.month}</h3></div>
        <div><small>Beneficio explicado</small><strong className={breakdown.totalProfit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(breakdown.totalProfit)}</strong></div>
      </header>
      <div className="pdf2-breakdown-opening">
        <span>Saldo al inicio del mes</span><strong>{formatMoney(openingCapital)}</strong>
      </div>
      <div className="pdf2-breakdown-grid pdf2-breakdown-grid-head">
        <span>Tramo de capital</span><span>Importe</span><span>Rentabilidad</span><span>Beneficio</span>
      </div>
      <div className="pdf2-breakdown-grid">
        <strong>{withdrawals.length > 0 ? 'Capital mantenido hasta cierre' : 'Posici\u00f3n inicial del mes'}</strong>
        <span>{formatMoney(breakdown.initialCapital)}</span>
        <span>{formatSignedPercent(breakdown.initialReturnPct * 100)}</span>
        <span className={breakdown.initialProfit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(breakdown.initialProfit)}</span>
      </div>
      {breakdown.contributions.map((contribution) => (
        <div className="pdf2-breakdown-grid" key={`${contribution.iso}-${contribution.amount}`}>
          <strong>Aportaci&oacute;n incorporada el {shortDate(contribution.iso)}</strong>
          <span>{formatMoney(contribution.amount)}</span>
          <span>{formatSignedPercent(contribution.returnPct * 100)}</span>
          <span className={contribution.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(contribution.profit)}</span>
        </div>
      ))}
      {withdrawals.map((withdrawal) => (
        <div className="pdf2-breakdown-grid" key={`${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
          <strong>Capital retirado el {shortDate(withdrawal.iso)}</strong>
          <span>{formatMoney(withdrawal.amount)}</span>
          <span>{withdrawal.returnPct === undefined ? '-' : formatSignedPercent(withdrawal.returnPct * 100)}</span>
          <span className={withdrawal.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(withdrawal.profit)}</span>
        </div>
      ))}
    </article>
  );
};

interface Pdf2DocumentProps {
  report: ReportData;
  months: PdfStudioMonth[];
  movements: ReportData['movements'];
  breakdowns: NonNullable<ReportData['contributionBreakdowns']>;
  summary: PdfStudioSummary;
}

const Pdf2Document = React.forwardRef<HTMLDivElement, Pdf2DocumentProps>(({ report, months, movements, breakdowns, summary }, ref) => {
  const monthlyChunks = useMemo(() => {
    if (months.length === 0) return [];
    return [months.slice(0, 13), ...splitIntoChunks(months.slice(13), 20)];
  }, [months]);
  const movementRows = useMemo(() => {
    let netCapital = 0;
    return movements.map((movement) => {
      netCapital += movement.type === 'increment' ? movement.amount : -movement.amount;
      return { ...movement, netCapital };
    });
  }, [movements]);
  const movementChunks = useMemo(() => {
    if (movementRows.length === 0) return [];
    return [movementRows.slice(0, 6), ...splitIntoChunks(movementRows.slice(6), 14)];
  }, [movementRows]);
  const breakdownChunks = useMemo(() => splitIntoChunks(breakdowns, 2), [breakdowns]);
  const monthlyPages = Math.max(1, monthlyChunks.length);
  const movementPages = movements.length > 0 ? Math.max(1, movementChunks.length) : 0;
  const breakdownPages = breakdowns.length > 0 ? Math.max(1, breakdownChunks.length) : 0;
  const totalPages = 2 + Math.max(0, monthlyPages - 1) + movementPages + breakdownPages + 1;
  const breakdownSectionNumber = movementPages > 0 ? 4 : 3;
  const methodologySectionNumber = 3 + (movementPages > 0 ? 1 : 0) + (breakdownPages > 0 ? 1 : 0);
  const issuedAt = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const updatedAt = new Date(report.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const historicalTwr = (report.twrYtd ?? 0) * 100;
  const netCapital = summary.increments - summary.decrements;
  const reconciledClosingBalance = summary.startBalance + netCapital + summary.profit;
  const hasExactPeriodReconciliation = Math.abs(reconciledClosingBalance - summary.endBalance) < 1;
  let pageNumber = 1;
  const pages: React.ReactNode[] = [];

  const wrapPage = (key: string, section: string, content: React.ReactNode, extraClass = '') => {
    const currentPage = pageNumber;
    pageNumber += 1;
    pages.push(
      <section className={`pdf2-document-page ${extraClass}`.trim()} id={`pdf2-page-${currentPage}`} data-pdf2-page={currentPage} key={key}>
        <PageHeader report={report} section={section} />
        <div className="pdf2-page-content">{content}</div>
        <PageFooter report={report} page={currentPage} total={totalPages} periodLabel={summary.periodLabel} />
      </section>
    );
  };

  wrapPage('executive', 'Visi\u00f3n ejecutiva', (
    <>
      <div className="pdf2-cover-heading">
        <div><span>INFORME PATRIMONIAL</span><h1>Patrimonio<br />en perspectiva.</h1></div>
        <div className="pdf2-cover-meta"><span>Periodo analizado</span><strong>{summary.periodLabel}</strong><small>Emitido el {issuedAt}</small></div>
      </div>
      <section className="pdf2-hero-balance">
        <div><span>Valor de cartera al cierre</span><strong>{formatMoney(summary.endBalance)}</strong><small>Usuario {report.clientCode}</small></div>
        <div className={summary.profit >= 0 ? 'is-positive' : 'is-negative'}><span>Beneficio del periodo</span><strong>{formatSignedMoney(summary.profit)}</strong><small>{formatSignedPercent(summary.returnPct * 100)} TWR del periodo</small></div>
      </section>
      <section className="pdf2-executive-metrics">
        <article><span>Saldo inicial</span><strong>{formatMoney(summary.startBalance)}</strong><small>Punto de partida del periodo</small></article>
        <article><span>Capital neto</span><strong>{formatMoney(netCapital)}</strong><small>{formatMoney(summary.increments)} aportado &middot; {formatMoney(summary.decrements)} retirado</small></article>
        <article><span>TWR acumulado</span><strong className={historicalTwr >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(historicalTwr)}</strong><small>Historial publicado de la cartera</small></article>
      </section>
      <section className="pdf2-section pdf2-cover-chart">
        <div className="pdf2-section-title"><div><span>01 / EVOLUCI&Oacute;N</span><h2>Trayectoria del patrimonio</h2></div><p>Valor de cartera registrado al cierre de cada mes.</p></div>
        <PatrimonyChart months={months} />
      </section>
      <section className="pdf2-period-equation">
        <span>Lectura del periodo</span>
        {hasExactPeriodReconciliation ? (
          <>
            <div><strong>{formatMoney(summary.startBalance)}</strong><i>+</i><strong>{formatMoney(netCapital)}</strong><i>{summary.profit >= 0 ? '+' : '-'}</i><strong>{formatMoney(Math.abs(summary.profit))}</strong><i>=</i><b>{formatMoney(summary.endBalance)}</b></div>
            <small>Saldo inicial + capital neto {summary.profit >= 0 ? '+ beneficio' : '- p\u00e9rdida'} = valor de cartera al cierre.</small>
          </>
        ) : (
          <>
            <div className="pdf2-period-reading"><strong>{formatMoney(summary.startBalance)}</strong><i aria-hidden="true">&rarr;</i><b>{formatMoney(summary.endBalance)}</b></div>
            <small>El valor de cierre corresponde al registro mensual publicado. Los movimientos de capital y el beneficio se presentan por separado.</small>
          </>
        )}
      </section>
    </>
  ), 'pdf2-cover-page');

  wrapPage('performance', 'Rendimiento mensual', (
    <>
      <div className="pdf2-editorial-heading"><span>02 / RENDIMIENTO</span><h1>El rendimiento,<br />mes a mes.</h1><p>La rentabilidad TWR separa el comportamiento de la inversi&oacute;n del efecto de las aportaciones y retiradas.</p></div>
      <section className="pdf2-section pdf2-return-section">
        <div className="pdf2-section-title"><div><span>&Uacute;LTIMOS CIERRES DEL PERIODO</span><h2>Rentabilidad mensual</h2></div><strong className={summary.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(summary.returnPct * 100)}<small>TWR acumulado del periodo</small></strong></div>
        <ReturnsChart months={months} />
      </section>
      <section className="pdf2-section pdf2-ledger-section">
        <div className="pdf2-section-title"><div><span>REGISTRO DE CIERRES</span><h2>Detalle mensual</h2></div><p>{months.length} {months.length === 1 ? 'mes analizado' : 'meses analizados'}</p></div>
        <MonthlyTable months={monthlyChunks[0] ?? []} />
      </section>
    </>
  ));

  monthlyChunks.slice(1).forEach((chunk, index) => {
    wrapPage(`monthly-${index}`, 'Continuaci\u00f3n mensual', (
      <>
        <div className="pdf2-editorial-heading is-compact"><span>02 / RENDIMIENTO</span><h1>Registro mensual.</h1><p>Continuaci&oacute;n cronol&oacute;gica del periodo seleccionado.</p></div>
        <section className="pdf2-section pdf2-ledger-section is-continuation">
          <div className="pdf2-section-title"><div><span>CIERRES PUBLICADOS</span><h2>Detalle mensual</h2></div><p>Parte {index + 2} de {monthlyChunks.length}</p></div>
          <MonthlyTable months={chunk} />
        </section>
      </>
    ));
  });

  movementChunks.forEach((chunk, index) => {
    wrapPage(`movements-${index}`, 'Capital aportado y retirado', (
      <>
        <div className={`pdf2-editorial-heading${index > 0 ? ' is-compact' : ''}`}><span>03 / CAPITAL</span><h1>{index === 0 ? <>El capital,<br />con trazabilidad.</> : 'Registro de capital.'}</h1><p>{index === 0 ? <>Cada aportaci&oacute;n y retirada registrada dentro del periodo seleccionado.</> : `Continuación ${index + 1} de ${movementChunks.length}.`}</p></div>
        {index === 0 ? (
          <section className="pdf2-capital-summary">
            <article><span>Capital aportado</span><strong>{formatMoney(summary.increments)}</strong></article>
            <article><span>Capital retirado</span><strong>{formatMoney(summary.decrements)}</strong></article>
            <article><span>Capital neto</span><strong>{formatSignedMoney(netCapital)}</strong></article>
          </section>
        ) : null}
        <section className="pdf2-section pdf2-movements-section">
          <div className="pdf2-section-title"><div><span>MOVIMIENTOS DEL PERIODO</span><h2>Registro de capital</h2></div><p>{movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}</p></div>
          <MovementTable rows={chunk} />
        </section>
        {index === 0 ? <CapitalPathChart rows={movementRows} /> : null}
        {index === 0 ? <aside className="pdf2-reading-note"><span aria-hidden="true">i</span><p><strong>C&oacute;mo leer esta p&aacute;gina.</strong> Los movimientos cambian el capital invertido, pero no se contabilizan como beneficio o p&eacute;rdida. Por eso la rentabilidad se presenta por separado.</p></aside> : null}
      </>
    ));
  });

  breakdownChunks.forEach((chunk, index) => {
    wrapPage(`breakdowns-${index}`, 'Meses con movimientos', (
      <>
        <div className="pdf2-editorial-heading is-compact"><span>{String(breakdownSectionNumber).padStart(2, '0')} / EXPLICACI&Oacute;N</span><h1>C&oacute;mo se gener&oacute;<br />el resultado.</h1><p>Desglose de los meses en los que el capital cambi&oacute; durante el periodo.</p></div>
        <section className="pdf2-breakdowns">
          {chunk.map((breakdown) => <BreakdownCard breakdown={breakdown} key={breakdown.month} />)}
        </section>
      </>
    ));
  });

  wrapPage('methodology', 'Criterio de lectura', (
    <>
      <div className="pdf2-editorial-heading"><span>{String(methodologySectionNumber).padStart(2, '0')} / CRITERIO</span><h1>Una lectura clara<br />del rendimiento.</h1><p>Dos indicadores complementarios explican el comportamiento de la cartera y el resultado sobre el capital aportado.</p></div>
      <section className="pdf2-method-grid">
        <article>
          <span>01</span><h2>TWR</h2><h3>Rentabilidad ponderada por el tiempo</h3>
          <p>Mide la evoluci&oacute;n de la cartera aislando el efecto de las aportaciones y retiradas. Permite conocer c&oacute;mo se han comportado las inversiones durante el periodo, independientemente de cu&aacute;ndo entr&oacute; o sali&oacute; capital.</p>
          <strong className={historicalTwr >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(historicalTwr)}</strong><small>TWR acumulado publicado</small>
        </article>
        <article>
          <span>02</span><h2>Rentabilidad total</h2><h3>Resultado sobre el capital neto aportado</h3>
          <p>Mide el resultado acumulado de la inversi&oacute;n en relaci&oacute;n con el capital neto aportado. Puede variar cuando se realizan nuevas aportaciones o retiradas de dinero.</p>
          <strong className={report.rentabilidad >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPercent(report.rentabilidad)}</strong><small>Rentabilidad total publicada</small>
        </article>
      </section>
      <section className="pdf2-closing-summary">
        <div><span>Valor de cartera</span><strong>{formatMoney(summary.endBalance)}</strong></div>
        <div><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedMoney(report.beneficioTotal)}</strong></div>
        <div><span>Capital neto hist&oacute;rico</span><strong>{formatMoney(report.incrementos - report.decrementos)}</strong></div>
      </section>
      <section className="pdf2-document-record">
        <div><span>Usuario</span><strong>{report.clientCode}</strong></div>
        <div><span>Periodo</span><strong>{summary.periodLabel}</strong></div>
        <div><span>Datos actualizados</span><strong>{updatedAt}</strong></div>
        <div><span>Documento emitido</span><strong>{issuedAt}</strong></div>
      </section>
      <div className="pdf2-closing-statement"><span>PORTFOLIO MANAGER</span><p>Informaci&oacute;n patrimonial presentada a partir de los datos publicados para el usuario. Documento de lectura y seguimiento.</p></div>
    </>
  ), 'pdf2-closing-page');

  return <div className="pdf2-document" ref={ref}>{pages}</div>;
});

Pdf2Document.displayName = 'Pdf2Document';

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

export const PdfDesignStudio: React.FC<PdfDesignStudioProps> = ({
  report,
  months,
  movements,
  breakdowns,
  summary,
  selectedDesign,
  onDesignChange,
  loadCurrentPdf,
  onPdf2DownloaderReady,
  onDownloaded,
  periodStart,
  periodEnd
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.86);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdf1Url, setPdf1Url] = useState<string | null>(null);
  const [pdf1Filename, setPdf1Filename] = useState('informe-actual.pdf');
  const [pdf1Loading, setPdf1Loading] = useState(false);
  const [pdf1Error, setPdf1Error] = useState<string | null>(null);
  const [exportState, setExportState] = useState<{ busy: boolean; current: number; total: number }>({ busy: false, current: 0, total: 0 });

  const fitToWidth = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = Math.max(320, viewport.clientWidth - 52);
    setScale(Math.max(0.38, Math.min(1.18, available / 794)));
  }, []);

  useEffect(() => {
    fitToWidth();
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fitToWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToWidth, selectedDesign]);

  useEffect(() => {
    if (selectedDesign !== 'pdf1') return undefined;
    let active = true;
    let nextUrl: string | null = null;
    setPdf1Loading(true);
    setPdf1Error(null);
    void loadCurrentPdf()
      .then(({ blob, filename }) => {
        if (!active) return;
        nextUrl = URL.createObjectURL(blob);
        setPdf1Url(nextUrl);
        setPdf1Filename(filename);
      })
      .catch(() => {
        if (active) setPdf1Error('No se pudo preparar la vista previa del PDF actual.');
      })
      .finally(() => {
        if (active) setPdf1Loading(false);
      });
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [selectedDesign, loadCurrentPdf, summary.periodLabel]);

  const pdf2Pages = documentRef.current?.querySelectorAll<HTMLElement>('.pdf2-document-page').length ?? 0;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || selectedDesign !== 'pdf2') return undefined;
    const updateCurrentPage = () => {
      const pages = Array.from(viewport.querySelectorAll<HTMLElement>('.pdf2-document-page'));
      if (pages.length === 0) return;
      const viewportTop = viewport.getBoundingClientRect().top + 110;
      let bestPage = 1;
      let bestDistance = Number.POSITIVE_INFINITY;
      pages.forEach((page, index) => {
        const distance = Math.abs(page.getBoundingClientRect().top - viewportTop);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = index + 1;
        }
      });
      setCurrentPage(bestPage);
    };
    viewport.addEventListener('scroll', updateCurrentPage, { passive: true });
    updateCurrentPage();
    return () => viewport.removeEventListener('scroll', updateCurrentPage);
  }, [selectedDesign, scale, pdf2Pages]);

  const downloadPdf2 = useCallback(async () => {
    const documentNode = documentRef.current;
    if (!documentNode || exportState.busy) return;
    const pages = Array.from(documentNode.querySelectorAll<HTMLElement>('.pdf2-document-page'));
    if (pages.length === 0) return;
    setExportState({ busy: true, current: 0, total: pages.length });
    try {
      const [{ jsPDF }, html2canvasModule] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const html2canvas = html2canvasModule.default;
      await document.fonts?.ready;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const exportHost = document.createElement('div');
      exportHost.className = 'pdf-studio pdf2-export-host';
      document.body.appendChild(exportHost);
      try {
        for (let index = 0; index < pages.length; index += 1) {
          setExportState({ busy: true, current: index + 1, total: pages.length });
          const exportPage = pages[index].cloneNode(true) as HTMLElement;
          exportPage.removeAttribute('id');
          exportPage.style.transform = 'none';
          exportPage.style.boxShadow = 'none';
          exportPage.style.margin = '0';
          exportHost.replaceChildren(exportPage);
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          const canvas = await html2canvas(exportPage, {
            backgroundColor: '#f6f2e9',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 794,
            height: 1123,
            windowWidth: 1440,
            scrollX: 0,
            scrollY: 0
          });
          if (index > 0) doc.addPage('a4', 'portrait');
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
        }
      } finally {
        exportHost.remove();
      }
      const filename = `informe-atlas-${report.clientCode}-${periodStart || 'todo'}-${periodEnd || 'todo'}.pdf`;
      const blob = doc.output('blob');
      triggerBlobDownload(blob, filename);
      onDownloaded?.({
        reportClientId: report.clientId,
        reportLabel: `${report.clientCode} - PDF 2 ATLAS`,
        periodStart: periodStart || 'todo',
        periodEnd: periodEnd || 'todo',
        filename,
        reportUpdatedAt: report.createdAt
      });
    } finally {
      setExportState({ busy: false, current: 0, total: 0 });
    }
  }, [exportState.busy, onDownloaded, periodEnd, periodStart, report]);

  useEffect(() => {
    onPdf2DownloaderReady?.(downloadPdf2);
    return () => onPdf2DownloaderReady?.(null);
  }, [downloadPdf2, onPdf2DownloaderReady]);

  const goToPage = (nextPage: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const pages = Array.from(viewport.querySelectorAll<HTMLElement>('.pdf2-document-page'));
    const clamped = Math.max(1, Math.min(pages.length, nextPage));
    pages[clamped - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(clamped);
  };

  const toggleFullscreen = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await viewer.requestFullscreen();
      window.setTimeout(fitToWidth, 80);
    }
  };

  const handlePrimaryDownload = () => {
    if (selectedDesign === 'pdf1') {
      if (!pdf1Url) return;
      const anchor = document.createElement('a');
      anchor.href = pdf1Url;
      anchor.download = pdf1Filename;
      anchor.click();
      return;
    }
    void downloadPdf2();
  };

  return (
    <section className="pdf-studio" ref={viewerRef} aria-label="Disenos PDF">
      <header className="pdf-studio-header">
        <div><span>LABORATORIO EDITORIAL &middot; DEMO1</span><h1>Dise&ntilde;os PDF</h1><p>Vista previa fiel del documento que recibir&aacute; el cliente.</p></div>
        <div className="pdf-studio-designs" role="tablist" aria-label="Seleccionar diseno PDF">
          <button type="button" role="tab" aria-selected={selectedDesign === 'pdf1'} className={selectedDesign === 'pdf1' ? 'is-active' : ''} onClick={() => onDesignChange('pdf1')}><span>PDF 1</span><strong>Actual</strong><small>Informe oficial existente</small></button>
          <button type="button" role="tab" aria-selected={selectedDesign === 'pdf2'} className={selectedDesign === 'pdf2' ? 'is-active' : ''} onClick={() => onDesignChange('pdf2')}><span>PDF 2</span><strong>ATLAS</strong><small>Dise&ntilde;ado por Codex &middot; GPT-5</small></button>
        </div>
      </header>

      <div className="pdf-studio-toolbar">
        <div className="pdf-studio-document-name"><span>{selectedDesign === 'pdf1' ? 'PDF 1 / ACTUAL' : 'PDF 2 / ATLAS PATRIMONIAL'}</span><strong>{summary.periodLabel}</strong></div>
        {selectedDesign === 'pdf2' ? (
          <div className="pdf-studio-pagination" aria-label="Navegacion de paginas">
            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Pagina anterior">&larr;</button>
            <span>P&aacute;gina <strong>{currentPage}</strong> de <strong>{pdf2Pages || 1}</strong></span>
            <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= (pdf2Pages || 1)} aria-label="Pagina siguiente">&rarr;</button>
          </div>
        ) : <span className="pdf-studio-pagination">Documento actual</span>}
        <div className="pdf-studio-actions">
          {selectedDesign === 'pdf2' ? (
            <>
              <button type="button" onClick={() => setScale((value) => Math.max(0.38, value - 0.1))} aria-label="Reducir zoom">&minus;</button>
              <span>{Math.round(scale * 100)}%</span>
              <button type="button" onClick={() => setScale((value) => Math.min(1.4, value + 0.1))} aria-label="Aumentar zoom">+</button>
              <button type="button" onClick={fitToWidth}>Ajustar</button>
            </>
          ) : null}
          <button type="button" onClick={() => void toggleFullscreen()}>Pantalla completa</button>
          <button type="button" className="is-primary" onClick={handlePrimaryDownload} disabled={selectedDesign === 'pdf1' ? !pdf1Url : exportState.busy}>
            {exportState.busy ? `Generando ${exportState.current}/${exportState.total}` : 'Descargar PDF'}
          </button>
        </div>
      </div>

      <div className={`pdf-studio-viewport is-${selectedDesign}`} ref={viewportRef}>
        {selectedDesign === 'pdf1' ? (
          <div className="pdf1-preview">
            {pdf1Loading ? <div className="pdf-studio-state"><span className="pdf-studio-loader" /><strong>Preparando PDF 1</strong><p>Generando la vista previa del informe actual.</p></div> : null}
            {pdf1Error ? <div className="pdf-studio-state is-error"><strong>No se pudo mostrar el documento</strong><p>{pdf1Error}</p></div> : null}
            {pdf1Url && !pdf1Loading ? <iframe src={`${pdf1Url}#toolbar=0&navpanes=0&view=FitH`} title="Vista previa PDF 1 actual" /> : null}
          </div>
        ) : (
          <div className="pdf2-preview-stack" style={{ '--pdf-scale': scale } as React.CSSProperties}>
            <Pdf2Document ref={documentRef} report={report} months={months} movements={movements} breakdowns={breakdowns} summary={summary} />
          </div>
        )}
      </div>
    </section>
  );
};
