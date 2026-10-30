import React, { useMemo } from 'react';
import type { ReportData } from '../services/reportLinks';
import type { PdfStudioMonth, PdfStudioSummary } from './PdfDesignStudio';
import { buildCapitalModel, type FlowMonth } from './capitalModel';
import './Pdf4Document.css';
import { esNumberFormat, NUMBER_LOCALE, withGrouping } from '../utils/format';

interface Pdf4DocumentProps {
  report: ReportData;
  months: PdfStudioMonth[];
  movements: ReportData['movements'];
  breakdowns: NonNullable<ReportData['contributionBreakdowns']>;
  summary: PdfStudioSummary;
}

// A4 vertical a 96 ppp.
export const PDF4_PAGE_WIDTH = 794;
export const PDF4_PAGE_HEIGHT = 1123;

const CLOSINGS_PER_PAGE = 24;
const MOVEMENTS_PER_PAGE = 24;
const LOTS_PER_PAGE = 5;
const BREAKDOWNS_PER_PAGE = 3;

const money2 = esNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
const money0 = esNumberFormat({ minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true });
// es-ES no agrupa las cifras de 4 digitos: se fuerza el punto de miles.
const group = (formatted: string) => formatted.replace(/^(-?)(\d{1,3})(\d{3})(?=[,]|$)/, '$1$2.$3');
const eur = (value: number) => `${group(money2.format(Number.isFinite(value) ? value : 0))} €`;
const eur0 = (value: number) => `${group(money0.format(Number.isFinite(value) ? value : 0))} €`;
const signedEur = (value: number) => (Math.abs(value) < 0.005 ? eur(0) : `${value > 0 ? '+' : '−'}${eur(Math.abs(value))}`);
const signedPct = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '−'}${Math.abs(safe).toLocaleString(NUMBER_LOCALE, withGrouping({ minimumFractionDigits: 2, maximumFractionDigits: 2 }))} %`;
};
const compactEur = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString(NUMBER_LOCALE, withGrouping({ maximumFractionDigits: 1 }))} M€`;
  if (abs >= 10000) return `${Math.round(value / 1000)}k €`;
  if (abs >= 1000) return `${(value / 1000).toLocaleString(NUMBER_LOCALE, withGrouping({ maximumFractionDigits: 1 }))}k €`;
  return `${Math.round(value)} €`;
};
const longDate = (iso: string) => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const shortDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
};
const chunk = <T,>(rows: T[], size: number) => {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
};
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
};

interface ClosingRow {
  key: string;
  label: string;
  start: number;
  increments: number;
  decrements: number;
  profit: number;
  returnPct: number;
  end: number;
  capital: number;
}

// ---------- graficos (SVG, se imprimen nitidos) ----------

const BalanceChart: React.FC<{ rows: ClosingRow[] }> = ({ rows }) => {
  const width = 682;
  const height = 330;
  const pad = { top: 16, right: 58, bottom: 30, left: 4 };
  if (rows.length === 0) return null;
  const values = rows.flatMap((row) => [row.end, row.capital]);
  // Eje ajustado a los datos para que la evolucion se lea bien.
  const top = Math.max(...values) * 1.08;
  const bottom = Math.max(0, Math.min(...values) * 0.85);
  const span = Math.max(1, top - bottom);
  const x = (index: number) => pad.left + (rows.length === 1 ? (width - pad.left - pad.right) / 2 : (index / (rows.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - (value - bottom) / span) * (height - pad.top - pad.bottom);
  const ticks = [0, 1, 2, 3].map((index) => bottom + (span * index) / 3);
  const line = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row.end).toFixed(1)}`).join(' ');
  const area = `${line} L${x(rows.length - 1).toFixed(1)},${y(bottom)} L${x(0).toFixed(1)},${y(bottom)} Z`;
  const capital = rows.map((row, index) => `${index ? `L${x(index).toFixed(1)},${y(rows[index - 1].capital).toFixed(1)} L` : 'M'}${x(index).toFixed(1)},${y(row.capital).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  const last = rows[rows.length - 1];
  return (
    <svg className="p4-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución del patrimonio y del capital aportado">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="p4-grid" />
          <text x={width - pad.right + 8} y={y(tick) + 4} className="p4-axis">{compactEur(tick)}</text>
        </g>
      ))}
      <path d={area} className="p4-area" />
      <path d={capital} className="p4-capital-line" />
      <path d={line} className="p4-balance-line" />
      <circle cx={x(rows.length - 1)} cy={y(last.end)} r={4.5} className="p4-dot" />
      {rows.map((row, index) => ((index % labelEvery === 0 && rows.length - 1 - index >= labelEvery / 2) || index === rows.length - 1 ? (
        <text key={row.key} x={x(index)} y={height - 8} textAnchor="middle" className="p4-axis">{row.label}</text>
      ) : null))}
    </svg>
  );
};

const MonthlyBars: React.FC<{ rows: ClosingRow[]; mode: 'pct' | 'eur' }> = ({ rows, mode }) => {
  const width = 682;
  const height = 250;
  const pad = { top: 22, right: 58, bottom: 26, left: 4 };
  if (rows.length === 0) return null;
  const value = (row: ClosingRow) => (mode === 'pct' ? row.returnPct : row.profit);
  const values = rows.map(value);
  const top = niceMax(Math.max(0, ...values) * 1.1);
  const low = Math.min(0, ...values);
  const span = Math.max(0.0001, top - low);
  const y = (v: number) => pad.top + (1 - (v - low) / span) * (height - pad.top - pad.bottom);
  const slot = (width - pad.left - pad.right) / rows.length;
  const barWidth = Math.max(4, Math.min(26, slot * 0.58));
  const labelEvery = Math.max(1, Math.ceil(rows.length / 12));
  const showValues = rows.length <= 16;
  return (
    <svg className="p4-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === 'pct' ? 'Rentabilidad de cada mes' : 'Beneficio de cada mes'}>
      {[...(low < 0 ? [low] : []), 0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="p4-grid" />
          <text x={width - pad.right + 8} y={y(tick) + 4} className="p4-axis">{mode === 'pct' ? `${tick.toLocaleString(NUMBER_LOCALE, withGrouping({ maximumFractionDigits: 1 }))} %` : compactEur(tick)}</text>
        </g>
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="p4-zero" />
      {rows.map((row, index) => {
        const v = value(row);
        const cx = pad.left + slot * index + slot / 2;
        const isLast = index === rows.length - 1;
        return (
          <g key={row.key}>
            <rect x={cx - barWidth / 2} y={Math.min(y(v), y(0))} width={barWidth} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={2} className={`p4-bar${v < 0 ? ' is-negative' : ''}${isLast ? ' is-last' : ''}`} />
            {showValues ? <text x={cx} y={(v >= 0 ? y(v) : y(0)) - 6} textAnchor="middle" className="p4-bar-label">{mode === 'pct' ? row.returnPct.toLocaleString(NUMBER_LOCALE, withGrouping({ minimumFractionDigits: 1, maximumFractionDigits: 1 })) : compactEur(row.profit)}</text> : null}
            {(index % labelEvery === 0 && rows.length - 1 - index >= labelEvery / 2) || isLast ? <text x={cx} y={height - 6} textAnchor="middle" className="p4-axis">{row.label.split(' ')[0]}</text> : null}
          </g>
        );
      })}
    </svg>
  );
};

const Composition: React.FC<{ contributed: number; withdrawn: number; profit: number; balance: number }> = ({ contributed, withdrawn, profit, balance }) => {
  const width = 682;
  const height = 300;
  const pad = { top: 30, bottom: 34 };
  const steps = [
    { label: 'Aportado', from: 0, to: contributed, text: eur0(contributed), kind: 'in' },
    { label: 'Retirado', from: contributed, to: contributed - withdrawn, text: withdrawn ? `−${eur0(withdrawn)}` : eur0(0), kind: 'out' },
    { label: 'Beneficio', from: contributed - withdrawn, to: contributed - withdrawn + profit, text: signedEur(profit).replace(/,\d\d €$/, ' €'), kind: profit >= 0 ? 'gain' : 'out' },
    { label: 'Valor actual', from: 0, to: balance, text: eur0(balance), kind: 'total' }
  ];
  const top = niceMax(Math.max(...steps.map((step) => Math.max(step.from, step.to))) * 1.08);
  const y = (v: number) => pad.top + (1 - v / top) * (height - pad.top - pad.bottom);
  const slot = width / steps.length;
  const barWidth = slot * 0.46;
  return (
    <svg className="p4-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Composición del valor actual">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="p4-zero" />
      {steps.map((step, index) => {
        const cx = slot * index + slot / 2;
        const yTop = y(Math.max(step.from, step.to));
        return (
          <g key={step.label}>
            {index < steps.length - 1 ? <line x1={cx + barWidth / 2} x2={cx + slot - barWidth / 2} y1={y(step.to)} y2={y(step.to)} className="p4-connector" /> : null}
            <rect x={cx - barWidth / 2} y={yTop} width={barWidth} height={Math.max(2, Math.abs(y(step.from) - y(step.to)))} rx={3} className={`p4-step is-${step.kind}`} />
            <text x={cx} y={yTop - 9} textAnchor="middle" className="p4-step-value">{step.text}</text>
            <text x={cx} y={height - 10} textAnchor="middle" className="p4-axis is-strong">{step.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

const LotBar: React.FC<{ capital: number; withdrawn: number; profit: number; max: number }> = ({ capital, withdrawn, profit, max }) => {
  const share = (value: number) => `${Math.max(0, (value / Math.max(1, max)) * 100)}%`;
  return (
    <div className="p4-lot-bar" aria-hidden="true">
      <i className="is-capital" style={{ width: share(capital) }} />
      <i className={profit >= 0 ? 'is-gain' : 'is-loss'} style={{ width: share(Math.abs(profit)) }} />
      {withdrawn > 0.005 ? <i className="is-withdrawn" style={{ width: share(withdrawn) }} /> : null}
    </div>
  );
};

// ---------- documento ----------

export const Pdf4Document = React.forwardRef<HTMLDivElement, Pdf4DocumentProps>(({ report, months, movements, breakdowns, summary }, ref) => {
  const openingCapital = Math.max(0, report.saldo + report.decrementos - report.incrementos - report.beneficioTotal);

  const closings = useMemo<ClosingRow[]>(() => months.map((month, index) => {
    const monthMovements = movements.filter((movement) => movement.iso.slice(0, 7) === month.key);
    const increments = monthMovements.filter((movement) => movement.type === 'increment').reduce((sum, movement) => sum + movement.amount, 0);
    const decrements = monthMovements.filter((movement) => movement.type === 'decrement').reduce((sum, movement) => sum + movement.amount, 0);
    const capital = openingCapital + movements
      .filter((movement) => movement.iso.slice(0, 7) <= month.key)
      .reduce((sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount), 0);
    const start = index > 0 ? months[index - 1].endBalance : Math.max(0, month.endBalance - month.profit - increments + decrements);
    return { key: month.key, label: month.label, start, increments, decrements, profit: month.profit, returnPct: month.returnPct, end: month.endBalance, capital };
  }), [months, movements, openingCapital]);

  const lots = useMemo(() => {
    const flowMonths: FlowMonth[] = months.map((month) => ({
      key: month.key, label: month.label, returnPct: month.returnPct, profit: month.profit, balance: month.endBalance, hasClose: true
    }));
    return buildCapitalModel(report, flowMonths, []).lots.filter((lot) => !lot.pending);
  }, [months, report]);

  const movementRows = useMemo(() => {
    let net = openingCapital;
    return [...movements].sort((left, right) => left.iso.localeCompare(right.iso)).map((movement) => {
      net += movement.type === 'increment' ? movement.amount : -movement.amount;
      return { ...movement, net };
    });
  }, [movements, openingCapital]);

  const closingPages = chunk([...closings].reverse(), CLOSINGS_PER_PAGE);
  const lotPages = chunk(lots, LOTS_PER_PAGE);
  const movementPages = chunk(movementRows, MOVEMENTS_PER_PAGE);
  const breakdownPages = chunk(breakdowns, BREAKDOWNS_PER_PAGE);
  const totalPages = 2 + Math.max(1, closingPages.length) + lotPages.length + Math.max(1, movementPages.length) + breakdownPages.length + 1;

  const twrPct = (report.twrYtd ?? 0) * 100;
  const contributed = report.incrementos;
  const withdrawn = report.decrementos;
  const netCapital = contributed - withdrawn;
  const issued = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const updated = new Date(report.createdAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const lastClosing = closings[closings.length - 1];
  const maxLot = Math.max(1, ...lots.map((lot) => lot.remainingCapital + Math.abs(lot.attributedProfit) + lot.allocatedWithdrawal));

  let pageNumber = 0;
  const pages: React.ReactNode[] = [];
  const addPage = (key: string, section: string, body: React.ReactNode, className = '') => {
    pageNumber += 1;
    const current = pageNumber;
    pages.push(
      <section className={`pdf-document-page p4-page ${className}`.trim()} data-pdf-page={current} key={key}>
        <header className="p4-head">
          <span className="p4-mark">Portfolio Manager</span>
          <span>{section}</span>
          <span>{report.clientCode}</span>
        </header>
        <div className="p4-body">{body}</div>
        <footer className="p4-foot">
          <span>Informe patrimonial · {summary.periodLabel}</span>
          <span>{current} / {totalPages}</span>
        </footer>
      </section>
    );
  };
  const sectionTitle = (number: string, title: string, text?: string) => (
    <div className="p4-title">
      <span className="p4-number">{number}</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );

  // 1. Portada
  addPage('cover', 'Resumen', (
    <>
      <div className="p4-cover-top">
        <span className="p4-kicker">Informe patrimonial</span>
        <h1>{report.clientCode}</h1>
        <dl className="p4-cover-meta">
          <div><dt>Periodo</dt><dd>{summary.periodLabel}</dd></div>
          <div><dt>Último cierre</dt><dd>{lastClosing ? lastClosing.label : '—'}</dd></div>
          <div><dt>Emitido</dt><dd>{issued}</dd></div>
        </dl>
      </div>
      <div className="p4-hero">
        <span>Valor de la cartera</span>
        <strong>{eur(summary.endBalance)}</strong>
        <p>
          Has aportado {eur0(contributed)}{withdrawn > 0 ? `, has retirado ${eur0(withdrawn)}` : ''} y tu inversión ha generado {signedEur(report.beneficioTotal)}.
        </p>
      </div>
      <div className="p4-kpis">
        <div><span>Capital aportado</span><strong>{eur(contributed)}</strong></div>
        <div><span>Capital retirado</span><strong>{eur(withdrawn)}</strong></div>
        <div><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? '' : 'is-negative'}>{signedEur(report.beneficioTotal)}</strong></div>
        <div><span>TWR acumulado</span><strong>{signedPct(twrPct)}</strong></div>
        <div><span>Rentabilidad total</span><strong>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong></div>
        <div><span>Último mes</span><strong>{lastClosing ? signedPct(lastClosing.returnPct) : '—'}</strong></div>
      </div>
      <div className="p4-block">
        <div className="p4-block-head"><h3>Evolución del patrimonio</h3><div className="p4-legend"><span><i className="is-balance" />Valor de la cartera</span><span><i className="is-capital" />Capital neto aportado</span></div></div>
        <BalanceChart rows={closings} />
      </div>
    </>
  ), 'p4-cover');

  // 2. Rentabilidad
  addPage('performance', 'Rentabilidad', (
    <>
      {sectionTitle('01', 'Rentabilidad mes a mes', 'Rentabilidad y beneficio de cada cierre publicado del periodo.')}
      <div className="p4-strip">
        <div><span>Rentabilidad del periodo (TWR)</span><strong>{signedPct(summary.returnPct * 100)}</strong></div>
        <div><span>Beneficio del periodo</span><strong>{signedEur(summary.profit)}</strong></div>
        <div><span>Saldo inicial</span><strong>{eur(summary.startBalance)}</strong></div>
        <div><span>Saldo final</span><strong>{eur(summary.endBalance)}</strong></div>
      </div>
      <div className="p4-block"><div className="p4-block-head"><h3>Rentabilidad mensual</h3><span className="p4-note">En porcentaje</span></div><MonthlyBars rows={closings} mode="pct" /></div>
      <div className="p4-block"><div className="p4-block-head"><h3>Beneficio mensual</h3><span className="p4-note">En euros</span></div><MonthlyBars rows={closings} mode="eur" /></div>
    </>
  ), 'p4-performance');

  // 3. Cierres
  (closingPages.length ? closingPages : [[]]).forEach((rows, index) => {
    addPage(`closings-${index}`, 'Cierres', (
      <>
        {sectionTitle('02', index === 0 ? 'Cierres mensuales' : 'Cierres mensuales (continuación)', index === 0 ? 'Cómo se formó el saldo de cada mes: saldo inicial, movimientos de capital, resultado y saldo final.' : undefined)}
        <table className="p4-table p4-closings">
          <thead><tr><th>Mes</th><th>Saldo inicial</th><th>Aportaciones</th><th>Retiradas</th><th>Resultado</th><th>Rentab.</th><th>Saldo final</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{eur(row.start)}</td>
                <td>{row.increments ? signedEur(row.increments) : '—'}</td>
                <td>{row.decrements ? signedEur(-row.decrements) : '—'}</td>
                <td className={row.profit < 0 ? 'is-negative' : ''}>{signedEur(row.profit)}</td>
                <td className={row.returnPct < 0 ? 'is-negative' : ''}>{signedPct(row.returnPct)}</td>
                <td className="is-strong">{eur(row.end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ), 'p4-closings-page');
  });

  // 4. Aportaciones, una a una
  lotPages.forEach((rows, index) => {
    addPage(`lots-${index}`, 'Aportaciones', (
      <>
        {sectionTitle('03', 'Cada aportación y su rendimiento', index === 0 ? 'Lo que aportaste en cada momento, lo que has retirado de ella, lo que ha generado y lo que vale hoy. Las retiradas se descuentan primero de la aportación más antigua.' : undefined)}
        <div className="p4-legend p4-lot-legend"><span><i className="is-capital" />Capital que sigue invertido</span><span><i className="is-gain" />Beneficio atribuido</span><span><i className="is-withdrawn" />Retirado</span></div>
        <div className="p4-lots">
          {rows.map((lot) => (
            <article className="p4-lot" key={lot.id}>
              <div className="p4-lot-head">
                <div><strong>{lot.label.startsWith('Aportación') ? `Aportación del ${longDate(lot.iso)}` : lot.label}</strong><span>{lot.activeMonths} {lot.activeMonths === 1 ? 'cierre' : 'cierres'} desde su entrada</span></div>
                <div className="p4-lot-value"><span>Vale hoy</span><strong>{eur(lot.currentValue)}</strong></div>
              </div>
              <LotBar capital={lot.remainingCapital} withdrawn={lot.allocatedWithdrawal} profit={lot.attributedProfit} max={maxLot} />
              <dl className="p4-lot-data">
                <div><dt>Aportado</dt><dd>{eur(lot.amount)}</dd></div>
                <div><dt>Retirado de ella</dt><dd>{lot.allocatedWithdrawal > 0.005 ? eur(lot.allocatedWithdrawal) : '—'}</dd></div>
                <div><dt>Sigue invertido</dt><dd>{eur(lot.remainingCapital)}</dd></div>
                <div><dt>Beneficio atribuido</dt><dd>{signedEur(lot.attributedProfit)}</dd></div>
                <div><dt>Rentabilidad desde su entrada</dt><dd>{signedPct(lot.accumulatedReturnPct)}</dd></div>
              </dl>
              {lot.withdrawalAllocations.length ? (
                <ul className="p4-lot-withdrawals">
                  {lot.withdrawalAllocations.map((allocation) => (
                    <li key={`${allocation.withdrawalId}-${allocation.iso}`}>
                      <span>Retirada del {shortDate(allocation.iso)}</span>
                      <span>−{eur(allocation.amount)}</span>
                      <span>{allocation.returnSinceEntryPct !== undefined ? `Rentabilidad desde la aportación ${signedPct(allocation.returnSinceEntryPct)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </>
    ), 'p4-lots-page');
  });

  // 5. Movimientos
  (movementPages.length ? movementPages : [[]]).forEach((rows, index) => {
    addPage(`movements-${index}`, 'Movimientos', (
      <>
        {sectionTitle('04', index === 0 ? 'Movimientos de capital' : 'Movimientos de capital (continuación)', index === 0 ? 'Aportaciones y retiradas en orden cronológico, con el capital neto aportado tras cada una.' : undefined)}
        {index === 0 ? (
          <div className="p4-strip">
            <div><span>Aportado</span><strong>{eur(contributed)}</strong></div>
            <div><span>Retirado</span><strong>{eur(withdrawn)}</strong></div>
            <div><span>Capital neto</span><strong>{eur(netCapital)}</strong></div>
            <div><span>Movimientos</span><strong>{movementRows.length}</strong></div>
          </div>
        ) : null}
        {rows.length ? (
          <table className="p4-table p4-movements">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Rentab. propia del mes</th><th>Capital neto</th></tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.iso}-${row.type}-${rowIndex}`}>
                  <td>{shortDate(row.iso)}</td>
                  <td><span className={`p4-chip is-${row.type}`}>{row.type === 'increment' ? 'Aportación' : 'Retirada'}</span></td>
                  <td className={row.type === 'decrement' ? 'is-negative' : ''}>{signedEur(row.type === 'increment' ? row.amount : -row.amount)}</td>
                  <td>{row.returnPct !== undefined ? signedPct(row.returnPct * 100) : '—'}</td>
                  <td className="is-strong">{eur(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="p4-empty">No hay aportaciones ni retiradas en el periodo.</p>}
      </>
    ), 'p4-movements-page');
  });

  // 6. Meses con movimientos: de donde sale el beneficio
  breakdownPages.forEach((rows, index) => {
    addPage(`breakdowns-${index}`, 'Detalle de meses con movimientos', (
      <>
        {sectionTitle('05', 'Meses con aportaciones o retiradas', index === 0 ? 'En estos meses el beneficio se calcula por partes: el capital que ya estaba invertido y cada movimiento con su propia rentabilidad.' : undefined)}
        <div className="p4-breakdowns">
          {rows.map((breakdown) => (
            <article className="p4-breakdown" key={breakdown.month}>
              <div className="p4-breakdown-head"><h3>{breakdown.month}</h3><div><span>Beneficio del mes</span><strong>{signedEur(breakdown.totalProfit)}</strong></div></div>
              <table className="p4-table p4-breakdown-table">
                <thead><tr><th>Concepto</th><th>Importe</th><th>Rentabilidad</th><th>Beneficio</th></tr></thead>
                <tbody>
                  <tr><td>Capital invertido al inicio del mes</td><td>{eur(breakdown.initialCapital)}</td><td>{signedPct(breakdown.initialReturnPct * 100)}</td><td>{signedEur(breakdown.initialProfit)}</td></tr>
                  {breakdown.contributions.map((contribution) => (
                    <tr key={`c-${contribution.iso}`}><td>Aportación del {shortDate(contribution.iso)}</td><td>{eur(contribution.amount)}</td><td>{signedPct(contribution.returnPct * 100)}</td><td>{signedEur(contribution.profit)}</td></tr>
                  ))}
                  {(breakdown.withdrawals ?? []).map((withdrawal) => (
                    <tr key={`w-${withdrawal.iso}`}><td>Retirada del {shortDate(withdrawal.iso)}</td><td className="is-negative">−{eur(withdrawal.amount)}</td><td>{withdrawal.returnPct !== undefined ? signedPct(withdrawal.returnPct * 100) : '—'}</td><td>{signedEur(withdrawal.profit)}</td></tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      </>
    ), 'p4-breakdowns-page');
  });

  // 7. Composicion, criterios y datos del documento
  addPage('closing', 'Composición y criterios', (
    <>
      {sectionTitle(breakdownPages.length ? '06' : '05', 'Composición del valor actual', 'Lo aportado, menos lo retirado, más el beneficio generado.')}
      <div className="p4-block"><Composition contributed={contributed} withdrawn={withdrawn} profit={report.beneficioTotal} balance={summary.endBalance} /></div>
      <div className="p4-criteria">
        <article>
          <span className="p4-number">TWR</span>
          <h3>Rentabilidad de la inversión</h3>
          <p>Mide cómo se ha comportado la inversión sin tener en cuenta cuándo has aportado o retirado dinero. Es la forma de comparar el rendimiento entre periodos.</p>
          <strong>{signedPct(twrPct)}</strong>
        </article>
        <article>
          <span className="p4-number">Total</span>
          <h3>Rentabilidad sobre tu capital</h3>
          <p>Relaciona el beneficio acumulado con el capital neto que has aportado. Cambia cuando haces nuevas aportaciones o retiradas.</p>
          <strong>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong>
        </article>
      </div>
      <dl className="p4-record">
        <div><dt>Usuario</dt><dd>{report.clientCode}</dd></div>
        <div><dt>Periodo</dt><dd>{summary.periodLabel}</dd></div>
        <div><dt>Datos actualizados</dt><dd>{updated}</dd></div>
        <div><dt>Documento emitido</dt><dd>{issued}</dd></div>
      </dl>
      <p className="p4-legal">Documento informativo elaborado con los datos publicados para el usuario. Las rentabilidades pasadas no garantizan rentabilidades futuras.</p>
    </>
  ), 'p4-closing-page');

  return <div className="p4-document" ref={ref}>{pages}</div>;
});

Pdf4Document.displayName = 'Pdf4Document';
