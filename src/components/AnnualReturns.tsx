import React, { useEffect, useMemo, useRef, useState } from 'react';
import sealUrl from '../assets/jigsa-sello.png';
import signatureUrl from '../assets/jigsa-firma.png';
import { applyPdfWatermark } from '../utils/pdfWatermark';
import { stableDocumentDigits } from '../utils/movementReceipts';
import {
  availableReportYears,
  buildAnnualReport,
  monthLabelToKey,
  type AnnualMode,
  type AnnualMonthInput,
  type AnnualMovementInput,
  type AnnualReport,
  type WithdrawnMethod
} from '../utils/annualReturns';
import './AnnualReturns.css';
import { esNumberFormat, NUMBER_LOCALE, withGrouping } from '../utils/format';

// Datos publicados del cliente que necesita el informe (subconjunto del informe del area cliente).
export interface AnnualReturnsSource {
  monthlyStats: Array<{ month: string; profit: number; profitPct: number; endBalance: number; hasData?: boolean }>;
  movements: Array<{ iso: string; type: 'increment' | 'decrement'; amount: number; returnPct?: number }>;
  saldo: number;
  incrementos: number;
  decrementos: number;
  beneficioTotal: number;
}

export const ISSUER = {
  name: 'JIGSA CAPITAL BROKERING - FZCO',
  license: 'L-87678',
  address: 'Premises no. 87678 - 001, IFZA Business Park, DDP, Dubai, United Arab Emirates'
};

export const DISCLAIMER =
  'JIGSA Capital Brokering - FZCO facilita esta información a petición del titular y con el criterio que este ha elegido. '
  + 'JIGSA no practica retenciones, no presta asesoramiento fiscal y no es responsable del uso que se haga de este documento. '
  + 'Las obligaciones fiscales y la declaración de estos importes corresponden exclusivamente al titular.';

const PAGE_W = 794;
const PAGE_H = 1123;
// Filas por pagina: la ultima hoja lleva ademas comisiones, aviso, sello y firma.
const SINGLE_PAGE_ROWS = 6;
const FIRST_PAGE_ROWS = 12;
const MIDDLE_PAGE_ROWS = 30;
const LAST_PAGE_ROWS = 16;
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const amount = esNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
// es-ES no agrupa los miles en cifras de 4 digitos: se fuerza el punto.
const eur = (value: number) => `${amount.format(Math.abs(value)).replace(/^(\d{1,3})(\d{3})(?=,)/, '$1.$2')} €`;
const signed = (value: number) => (Math.abs(value) < 0.005 ? eur(0) : `${value > 0 ? '+' : '−'}${eur(value)}`);
const pct = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(NUMBER_LOCALE, withGrouping({ minimumFractionDigits: 2, maximumFractionDigits: 2 }))} %`;
const dateEs = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${new Date(y, m, 0).getDate()} de ${MONTH_NAMES[m - 1]} de ${y}`;
};

const criterionText = (report: AnnualReport) => (report.mode === 'all'
  ? 'Todo el beneficio generado por la inversión durante el año, se haya retirado o no.'
  : report.method === 'proportional'
    ? 'Beneficio incluido en las retiradas del año. Cálculo proporcional: cada retirada incluye la parte de capital y de beneficio que tenía la inversión en ese momento.'
    : 'Beneficio incluido en las retiradas del año. Cálculo «primero el capital»: lo retirado se considera capital hasta recuperar todo lo aportado; a partir de ahí, beneficio.');

const headlineLabel = (report: AnnualReport) => (report.mode === 'all' ? `Beneficio generado en ${report.year}` : `Beneficio incluido en lo retirado en ${report.year}`);

interface DocumentProps {
  report: AnnualReport;
  holderName: string;
  clientCode: string;
  documentNumber: string;
  issuedAt: Date;
}

export const AnnualReturnsDocument = React.forwardRef<HTMLDivElement, DocumentProps>(({ report, holderName, clientCode, documentNumber, issuedAt }, ref) => {
  const rows = report.mode === 'all' ? report.monthRows : report.withdrawals;
  const chunks: Array<typeof rows> = [];
  if (rows.length <= SINGLE_PAGE_ROWS) {
    chunks.push(rows);
  } else {
    chunks.push(rows.slice(0, FIRST_PAGE_ROWS) as typeof rows);
    const rest = rows.slice(FIRST_PAGE_ROWS) as typeof rows;
    while (rest.length > LAST_PAGE_ROWS) chunks.push(rest.splice(0, MIDDLE_PAGE_ROWS) as typeof rows);
    chunks.push(rest);
  }
  const total = chunks.length;
  const issued = issuedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const endLabel = report.lastKey ? (report.provisional ? `Saldo al ${monthEnd(report.lastKey)}` : `Saldo al 31 de diciembre de ${report.year}`) : 'Saldo final';

  const detail = (pageRows: typeof rows) => (report.mode === 'all' ? (
    <table className="ar-table">
      <thead><tr><th>Mes</th><th>Rentabilidad</th><th>Beneficio del mes</th></tr></thead>
      <tbody>
        {(pageRows as AnnualReport['monthRows']).map((row) => (
          <tr key={row.key}><td>{row.label}</td><td>{pct(row.returnPct)}</td><td className={row.profit < 0 ? 'is-neg' : ''}>{signed(row.profit)}</td></tr>
        ))}
      </tbody>
    </table>
  ) : (
    <table className="ar-table">
      <thead><tr><th>Fecha de la retirada</th><th>Importe retirado</th><th>Parte de capital</th><th>Parte de beneficio</th></tr></thead>
      <tbody>
        {(pageRows as AnnualReport['withdrawals']).map((row) => (
          <tr key={row.iso}><td>{dateEs(row.iso)}</td><td>{eur(row.amount)}</td><td>{eur(row.capital)}</td><td className="is-strong">{eur(row.gain)}</td></tr>
        ))}
      </tbody>
    </table>
  ));

  return (
    <div className="ar-document" ref={ref}>
      {chunks.map((pageRows, pageIndex) => {
        const isFirst = pageIndex === 0;
        const isLast = pageIndex === total - 1;
        return (
          <section className="ar-page" key={pageIndex} style={{ width: PAGE_W, height: PAGE_H }}>
            <header className="ar-head"><strong>{ISSUER.name}</strong><span>Licencia {ISSUER.license}</span></header>
            <div className="ar-body">
              {isFirst ? (
                <>
                  <div className="ar-title">
                    <span>Informe anual de rendimientos</span>
                    <h1>Ejercicio {report.year}</h1>
                    {report.provisional ? <em className="ar-provisional">PROVISIONAL · datos hasta el último cierre publicado{report.lastKey ? `, ${MONTH_NAMES[Number(report.lastKey.slice(5)) - 1]} de ${report.lastKey.slice(0, 4)}` : ''}</em> : null}
                  </div>
                  <dl className="ar-meta">
                    <div><dt>Titular</dt><dd>{holderName}</dd></div>
                    <div><dt>Usuario</dt><dd>{clientCode}</dd></div>
                    <div><dt>Documento nº</dt><dd>{documentNumber}</dd></div>
                    <div><dt>Emitido</dt><dd>{issued}</dd></div>
                  </dl>
                  <div className="ar-headline">
                    <span>{headlineLabel(report)}</span>
                    <strong>{eur(report.headline)}</strong>
                    <p>Criterio elegido por el titular: {criterionText(report)}</p>
                  </div>
                  <dl className="ar-strip">
                    <div><dt>Saldo al 1 de enero de {report.year}</dt><dd>{eur(report.startBalance)}</dd></div>
                    <div><dt>Aportaciones del año</dt><dd>{signed(report.increments)}</dd></div>
                    <div><dt>Retiradas del año</dt><dd>{signed(-report.decrements)}</dd></div>
                    <div><dt>{endLabel}</dt><dd>{eur(report.endBalance)}</dd></div>
                  </dl>
                  <h2 className="ar-section">{report.mode === 'all' ? 'Detalle mensual' : 'Detalle de las retiradas'}</h2>
                </>
              ) : pageRows.length ? <h2 className="ar-section">{report.mode === 'all' ? 'Detalle mensual (continuación)' : 'Detalle de las retiradas (continuación)'}</h2> : null}
              {pageRows.length ? detail(pageRows) : isFirst ? <p className="ar-empty">{report.mode === 'all' ? 'No hay cierres publicados en este año.' : 'No hay retiradas en este año.'}</p> : null}
              {isLast ? (
                <>
                  <h2 className="ar-section">Comisiones pagadas en el año</h2>
                  {!report.commissionsAvailable ? <p className="ar-empty">Información de comisiones no disponible.</p> : report.commissions.length ? (
                    <table className="ar-table">
                      <thead><tr><th>Retirada</th><th>Importe retirado</th><th>Comisión pagada</th></tr></thead>
                      <tbody>
                        {report.commissions.map((row) => <tr key={row.iso}><td>{dateEs(row.iso)}</td><td>{eur(row.withdrawal)}</td><td>{eur(row.commission)}</td></tr>)}
                        <tr className="ar-total"><td>Total</td><td /><td>{eur(report.commissionsTotal)}</td></tr>
                      </tbody>
                    </table>
                  ) : <p className="ar-empty">No consta ninguna comisión pagada en este año.</p>}
                  <div className="ar-notice"><strong>Aviso</strong><p>{DISCLAIMER}</p></div>
                  <p className="ar-method">Importes en euros calculados con los cierres mensuales y los movimientos publicados para el titular en su área de cliente.</p>
                  <div className="ar-sign">
                    <div className="ar-issuer"><strong>{ISSUER.name}</strong><span>{ISSUER.address}</span><span>Licencia {ISSUER.license}</span></div>
                    <div className="ar-marks"><img src={sealUrl} alt="Sello de JIGSA Capital Brokering" /><img src={signatureUrl} alt="Firma" /></div>
                  </div>
                </>
              ) : null}
            </div>
            <footer className="ar-foot"><span>Informe anual de rendimientos · {report.year} · {documentNumber}</span><span>{pageIndex + 1} / {total}</span></footer>
          </section>
        );
      })}
    </div>
  );
});
AnnualReturnsDocument.displayName = 'AnnualReturnsDocument';

const exportPdf = async (pages: HTMLElement[], filename: string) => {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const html2canvas = html2canvasModule.default;
  await document.fonts?.ready;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const host = document.createElement('div');
  host.className = 'ar-export-host';
  document.body.appendChild(host);
  try {
    for (let index = 0; index < pages.length; index += 1) {
      const clone = pages[index].cloneNode(true) as HTMLElement;
      host.replaceChildren(clone);
      await Promise.all(Array.from(clone.querySelectorAll('img')).map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
      const canvas = await html2canvas(clone, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false, width: PAGE_W, height: PAGE_H, windowWidth: 1440, scrollX: 0, scrollY: 0 });
      if (index > 0) doc.addPage('a4', 'portrait');
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), undefined, 'FAST');
    }
  } finally {
    host.remove();
  }
  applyPdfWatermark(doc);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

interface PanelProps {
  source: AnnualReturnsSource;
  commissions: { rate: number | null; paidWithdrawalIsos: string[] } | null;
  holderName: string;
  clientCode: string;
  clientId: string;
  onDownloaded?: (details: { year: number; mode: AnnualMode; method: WithdrawnMethod; filename: string }) => void;
}

// Selector + vista previa + descarga. Lo usan igual el area del cliente y el admin.
export const AnnualReturnsPanel: React.FC<PanelProps> = ({ source, commissions, holderName, clientCode, clientId, onDownloaded }) => {
  const months = useMemo<AnnualMonthInput[]>(() => source.monthlyStats
    .filter((month) => month.hasData !== false && monthLabelToKey(month.month))
    .map((month) => ({ month: month.month, profit: month.profit ?? 0, profitPct: month.profitPct ?? 0, endBalance: month.endBalance ?? 0 })), [source.monthlyStats]);
  const movements = useMemo<AnnualMovementInput[]>(() => source.movements.map((movement) => ({
    iso: movement.iso, type: movement.type, amount: movement.amount, ...(movement.returnPct !== undefined ? { returnPct: movement.returnPct } : {})
  })), [source.movements]);
  const years = useMemo(() => availableReportYears(months), [months]);
  const provisionalYears = useMemo(() => {
    const closedKeys = new Set(months.map((month) => monthLabelToKey(month.month)));
    return new Set(years.filter((value) => !closedKeys.has(`${value}-12`)));
  }, [months, years]);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const [mode, setMode] = useState<AnnualMode>('withdrawn');
  const [method, setMethod] = useState<WithdrawnMethod>('proportional');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [issuedAt] = useState(() => new Date());

  useEffect(() => { if (year === null || !years.includes(year)) setYear(years[0] ?? null); }, [year, years]);

  const openingCapital = Math.max(0, source.saldo + source.decrementos - source.incrementos - source.beneficioTotal);
  const report = useMemo(() => (year === null ? null : buildAnnualReport({ months, movements, openingCapital, commissions, year, mode, method })), [commissions, method, mode, months, movements, openingCapital, year]);
  // Numero con aspecto aleatorio (no muestra el numero de cliente): el mismo para el mismo cliente, año y tipo de informe.
  const documentKind = report ? (report.mode === 'all' ? 'T' : report.method === 'proportional' ? 'P' : 'C') : '';
  const documentNumber = report ? `IR-${report.year}-${stableDocumentDigits(`${clientId}|fiscal|${report.year}|${documentKind}`)}-${documentKind}` : '';

  const download = async () => {
    if (!report || !accepted || busy) return;
    const pages = Array.from(docRef.current?.querySelectorAll<HTMLElement>('.ar-page') ?? []);
    if (!pages.length) return;
    setBusy(true);
    setError(null);
    const filename = `informe-rendimientos-${report.year}-${clientCode}${report.provisional ? '-provisional' : ''}.pdf`;
    try {
      await exportPdf(pages, filename);
      onDownloaded?.({ year: report.year, mode: report.mode, method: report.method, filename });
    } catch (downloadError) {
      console.error('No se pudo generar el informe anual', downloadError);
      setError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (!report) return <p className="ar-panel-empty">Todavía no hay cierres publicados para preparar el informe.</p>;

  return (
    <div className="ar-panel">
      <form className="ar-controls" onSubmit={(event) => { event.preventDefault(); void download(); }}>
        <fieldset>
          <legend>Año</legend>
          <div className="ar-years">
            {years.map((value) => (
              <button key={value} type="button" aria-pressed={value === year} onClick={() => setYear(value)}>
                {value}
                {provisionalYears.has(value) ? <small>Provisional</small> : null}
              </button>
            ))}
          </div>
          {years.length === 1 ? <span className="ar-years-note">Solo hay cierres publicados de {years[0]}.</span> : null}
        </fieldset>
        <fieldset>
          <legend>Qué quieres que conste</legend>
          <label><input type="radio" name={`ar-mode-${clientId}`} checked={mode === 'withdrawn'} onChange={() => setMode('withdrawn')} />Solo lo retirado</label>
          <label><input type="radio" name={`ar-mode-${clientId}`} checked={mode === 'all'} onChange={() => setMode('all')} />Todo lo ganado en el año</label>
        </fieldset>
        {mode === 'withdrawn' ? (
          <fieldset>
            <legend>Cómo calcular lo retirado</legend>
            <label><input type="radio" name={`ar-method-${clientId}`} checked={method === 'proportional'} onChange={() => setMethod('proportional')} />Proporcional</label>
            <label><input type="radio" name={`ar-method-${clientId}`} checked={method === 'capital-first'} onChange={() => setMethod('capital-first')} />Primero el capital</label>
          </fieldset>
        ) : null}
        <p className="ar-controls-notice">{DISCLAIMER}</p>
        <label className="ar-accept"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />He leído y acepto el aviso. La declaración y tributación de estos rendimientos son de mi exclusiva responsabilidad.</label>
        <button type="submit" disabled={!accepted || busy}>{busy ? 'Generando PDF…' : 'Descargar PDF'}</button>
        {error ? <p className="ar-error" role="alert">{error}</p> : null}
      </form>
      <div className="ar-preview">
        <AnnualReturnsDocument ref={docRef} report={report} holderName={holderName} clientCode={clientCode} documentNumber={documentNumber} issuedAt={issuedAt} />
      </div>
    </div>
  );
};
