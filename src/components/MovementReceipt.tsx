import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import sealUrl from '../assets/jigsa-sello.png';
import signatureUrl from '../assets/jigsa-firma.png';
import { ISSUER } from './AnnualReturns';
import { buildMovementReceipt, type MovementReceiptData, type ReceiptMovementInput } from '../utils/movementReceipts';
import { applyPdfWatermark } from '../utils/pdfWatermark';
import './MovementReceipt.css';

// Justificante de cada aportacion o retirada: version extendida (A4) y resumida (un tercio de A4).

type ReceiptFormat = 'extended' | 'compact';

const SIZES: Record<ReceiptFormat, { width: number; height: number }> = {
  extended: { width: 794, height: 1123 },
  compact: { width: 794, height: 374 }
};

const amountFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (value: number) => `${amountFormat.format(Math.abs(value)).replace(/^(\d{1,3})(\d{3})(?=,)/, '$1.$2')} €`;
const percent = (rate: number | null) => (rate === null ? '' : `${amountFormat.format(rate * 100).replace(/,00$/, '')} %`);
const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const todayLabel = (date: Date) => date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface DocProps {
  receipt: MovementReceiptData;
  holderName: string;
  clientCode: string;
  issuedAt: Date;
}

const Marks: React.FC = () => (
  <div className="mr-marks"><img src={sealUrl} alt="Sello de JIGSA Capital Brokering" /><img src={signatureUrl} alt="Firma" /></div>
);

const CommissionRows: React.FC<{ receipt: MovementReceiptData; detailed: boolean }> = ({ receipt, detailed }) => {
  const commission = receipt.commission;
  if (!commission) return null;
  const showBreakdown = detailed && commission.paid && commission.amount > 0;
  return (
    <>
      {showBreakdown ? (
        <>
          <tr className="mr-sub"><td>Capital pendiente de recuperar antes de esta retirada</td><td>{eur(commission.capitalPendingBefore)}</td></tr>
          <tr className="mr-sub"><td>Parte de la retirada sujeta a comisión</td><td>{eur(commission.commissionableAmount)}</td></tr>
        </>
      ) : null}
      <tr>
        <td className="mr-muted">
          Comisión de éxito{commission.rate ? ` (${percent(commission.rate)}${showBreakdown ? ` sobre ${eur(commission.commissionableAmount)}` : ''})` : ''}
        </td>
        <td className={commission.amount > 0 ? 'mr-neg' : undefined}>{commission.amount > 0 ? `-${eur(commission.amount)}` : eur(0)}</td>
      </tr>
    </>
  );
};

const commissionNote = (receipt: MovementReceiptData) => {
  const commission = receipt.commission;
  if (!commission) return null;
  if (commission.paid && commission.amount > 0) {
    const recovered = commission.capitalPendingBefore > 0
      ? 'Con esta retirada se recupera la totalidad del capital aportado.'
      : 'El capital aportado ya se había recuperado con retiradas anteriores.';
    return `La comisión de éxito solo se aplica a la parte retirada que supera el capital aportado. ${recovered}`;
  }
  if (commission.commissionableAmount <= 0) {
    return `Sin comisión: aún quedan ${eur(receipt.capitalPendingAfter)} de capital aportado por recuperar.`;
  }
  return null;
};

export const ExtendedReceipt = React.forwardRef<HTMLDivElement, DocProps>(({ receipt, holderName, clientCode, issuedAt }, ref) => {
  const isIncrement = receipt.type === 'increment';
  const note = isIncrement ? null : commissionNote(receipt);
  return (
    <div ref={ref} className="mr-page mr-extended" style={SIZES.extended}>
      <div className="mr-head"><strong>JIGSA Capital Brokering - FZCO</strong><span>Justificante de operación</span></div>
      <div className="mr-kicker">Justificante de operación</div>
      <h1>{isIncrement ? 'Aportación de capital' : 'Retirada de capital'}</h1>
      <span className={`mr-tag ${isIncrement ? 'is-in' : 'is-out'}`}>{isIncrement ? 'Aportación' : 'Retirada'}</span>
      <dl className="mr-meta">
        <div><dt>Titular</dt><dd>{holderName}</dd></div>
        <div><dt>Código de cliente</dt><dd>{clientCode}</dd></div>
        <div><dt>Nº de justificante</dt><dd>{receipt.number}</dd></div>
        <div><dt>Fecha de emisión</dt><dd>{todayLabel(issuedAt)}</dd></div>
      </dl>
      <div className="mr-amount">
        <div><span>{isIncrement ? 'Importe aportado' : 'Importe retirado'}</span><strong>{eur(receipt.amount)}</strong></div>
        <div className="mr-amount-side">Fecha de la operación<b>{longDate(receipt.iso)}</b></div>
      </div>
      <p className="mr-statement">JIGSA Capital Brokering - FZCO hace constar que, en la fecha indicada, ha registrado en la cuenta del titular la operación que se detalla a continuación.</p>

      <h2>Detalle de la operación</h2>
      <table className="mr-table">
        <tbody>
          <tr><td className="mr-muted">Tipo de operación</td><td>{isIncrement ? 'Aportación' : 'Retirada'}</td></tr>
          <tr><td className="mr-muted">Fecha de la operación</td><td>{shortDate(receipt.iso)}</td></tr>
          {isIncrement ? (
            <tr className="mr-total"><td>Importe aportado</td><td>{eur(receipt.amount)}</td></tr>
          ) : (
            <>
              {receipt.commission ? (
                <>
                  <tr><td className="mr-muted">Importe retirado</td><td>{eur(receipt.amount)}</td></tr>
                  <CommissionRows receipt={receipt} detailed />
                  <tr className="mr-total"><td>Total entregado</td><td>{eur(receipt.net)}</td></tr>
                </>
              ) : (
                // Sin datos de comisiones no se puede afirmar el total entregado.
                <tr className="mr-total"><td>Importe retirado</td><td>{eur(receipt.amount)}</td></tr>
              )}
            </>
          )}
        </tbody>
      </table>
      {note ? <p className="mr-note">{note}</p> : null}

      <h2>Situación de la cuenta tras la operación</h2>
      <table className="mr-table">
        <tbody>
          <tr><td className="mr-muted">Capital aportado total</td><td>{eur(receipt.contributedAfter)}</td></tr>
          <tr><td className="mr-muted">Capital retirado total</td><td>{eur(receipt.withdrawnAfter)}</td></tr>
          <tr className="mr-total"><td>Capital pendiente de recuperar</td><td>{eur(receipt.capitalPendingAfter)}</td></tr>
        </tbody>
      </table>

      <div className="mr-sign">
        <div className="mr-issuer"><strong>{ISSUER.name}</strong><span>Licencia n.º {ISSUER.license}</span><span>{ISSUER.address}</span></div>
        <Marks />
      </div>
      <div className="mr-foot"><span>{receipt.number} · Versión extendida</span><span>Página 1 de 1</span></div>
    </div>
  );
});
ExtendedReceipt.displayName = 'ExtendedReceipt';

export const CompactReceipt = React.forwardRef<HTMLDivElement, DocProps>(({ receipt, holderName, clientCode, issuedAt }, ref) => {
  const isIncrement = receipt.type === 'increment';
  return (
    <div ref={ref} className="mr-page mr-compact" style={SIZES.compact}>
      <div className="mr-top"><strong>JIGSA Capital Brokering - FZCO</strong><b>{isIncrement ? 'Justificante de aportación' : 'Justificante de retirada'}</b><span>{receipt.number}</span></div>
      <div className="mr-mid">
        <div>
          <div className="mr-big"><span>{isIncrement ? 'Aportación' : 'Retirada'}</span><strong>{eur(receipt.amount)}</strong><small>{longDate(receipt.iso)}</small></div>
          <div className="mr-who"><div>Titular: <b>{holderName}</b></div><div>Código de cliente: <b>{clientCode}</b></div><div>Emitido el {todayLabel(issuedAt)}</div></div>
        </div>
        <table className="mr-table">
          <tbody>
            <tr><td className="mr-muted">Fecha de la operación</td><td>{shortDate(receipt.iso)}</td></tr>
            {isIncrement ? (
              <tr className="mr-total"><td>Importe aportado</td><td>{eur(receipt.amount)}</td></tr>
            ) : (
              <>
                {receipt.commission ? (
                  <>
                    <tr><td className="mr-muted">Importe retirado</td><td>{eur(receipt.amount)}</td></tr>
                    <CommissionRows receipt={receipt} detailed={false} />
                    <tr className="mr-total"><td>Total entregado</td><td>{eur(receipt.net)}</td></tr>
                  </>
                ) : (
                  // Sin datos de comisiones no se puede afirmar el total entregado.
                  <tr className="mr-total"><td>Importe retirado</td><td>{eur(receipt.amount)}</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <div className="mr-bottom">
        <div className="mr-issuer"><strong>{ISSUER.name}</strong><span>Licencia n.º {ISSUER.license} · IFZA Business Park, DDP, Dubai, United Arab Emirates</span></div>
        <Marks />
      </div>
    </div>
  );
});
CompactReceipt.displayName = 'CompactReceipt';

const exportReceipt = async (page: HTMLElement, format: ReceiptFormat, filename: string) => {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const html2canvas = html2canvasModule.default;
  await document.fonts?.ready;
  const { width, height } = SIZES[format];
  const host = document.createElement('div');
  host.className = 'mr-export-host';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  document.body.appendChild(host);
  try {
    const clone = page.cloneNode(true) as HTMLElement;
    host.replaceChildren(clone);
    await Promise.all(Array.from(clone.querySelectorAll('img')).map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
    const canvas = await html2canvas(clone, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false, width, height, windowWidth: 1440, scrollX: 0, scrollY: 0 });
    // Extendido: A4. Resumido: ancho de A4 y un tercio de su alto.
    const doc = format === 'extended'
      ? new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
      : new jsPDF({ orientation: 'landscape', unit: 'pt', format: [595.28, 280.63], compress: true });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), undefined, 'FAST');
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
  } finally {
    host.remove();
  }
};

interface DialogProps {
  clientId: string;
  holderName: string;
  clientCode: string;
  movements: Array<{ iso: string; type: string; amount: number }>;
  movement: ReceiptMovementInput;
  // Si llegan (demostracion), no se piden a la base de datos.
  knownCommissions?: { rate: number | null; paidWithdrawalIsos: string[] } | null;
  onClose: () => void;
  onDownloaded?: (details: { filename: string; format: ReceiptFormat }) => void;
}

// Ventana para elegir formato, con la vista previa de los dos.
export const MovementReceiptDialog: React.FC<DialogProps> = ({ clientId, holderName, clientCode, movements, movement, knownCommissions, onClose, onDownloaded }) => {
  const [format, setFormat] = useState<ReceiptFormat>('compact');
  const [commissions, setCommissions] = useState<{ rate: number | null; paidWithdrawalIsos: string[] } | null | undefined>(movement.type === 'decrement' ? knownCommissions : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedAt] = useState(() => new Date());
  const extendedRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (movement.type !== 'decrement' || knownCommissions !== undefined) return undefined;
    let active = true;
    void import('../services/commissionCloud')
      .then(({ fetchClientCommissions }) => fetchClientCommissions(clientId))
      .then((doc) => { if (active) setCommissions(doc); })
      .catch(() => { if (active) setCommissions(null); });
    return () => { active = false; };
  }, [clientId, knownCommissions, movement.type]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const receipt = useMemo(
    () => (commissions === undefined ? null : buildMovementReceipt(clientId, movements, movement, commissions)),
    [clientId, commissions, movement, movements]
  );
  const isIncrement = movement.type === 'increment';

  const download = async () => {
    const page = (format === 'extended' ? extendedRef : compactRef).current;
    if (!receipt || !page || busy) return;
    setBusy(true);
    setError(null);
    const filename = `justificante-${isIncrement ? 'aportacion' : 'retirada'}-${receipt.iso}-${clientCode}${format === 'compact' ? '-resumido' : ''}.pdf`;
    try {
      await exportReceipt(page, format, filename);
      onDownloaded?.({ filename, format });
    } catch (downloadError) {
      console.error('No se pudo generar el justificante', downloadError);
      setError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const docProps = receipt ? { receipt, holderName, clientCode, issuedAt } : null;

  return createPortal(
    <div className="mr-overlay" role="dialog" aria-modal="true" aria-label="Justificante de operación" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mr-box">
        <h3>Justificante de la {isIncrement ? 'aportación' : 'retirada'} del {shortDate(movement.iso)}</h3>
        <p>Elige el formato que prefieras. Puedes descargar los dos.</p>
        {!docProps ? <p className="mr-loading">Preparando el justificante…</p> : (
          <div className="mr-options">
            <div className={`mr-option${format === 'extended' ? ' is-selected' : ''}`} onClick={() => setFormat('extended')}>
              <button type="button" className="mr-option-title" aria-pressed={format === 'extended'}><span className="mr-radio" aria-hidden="true" />Extendido</button>
              <small>Con el detalle del cálculo y la situación de tu cuenta.</small>
              <div className="mr-thumb"><div className="mr-thumb-frame is-extended"><div className="mr-thumb-scale"><ExtendedReceipt ref={extendedRef} {...docProps} /></div></div></div>
            </div>
            <div className={`mr-option${format === 'compact' ? ' is-selected' : ''}`} onClick={() => setFormat('compact')}>
              <button type="button" className="mr-option-title" aria-pressed={format === 'compact'}><span className="mr-radio" aria-hidden="true" />Resumido</button>
              <small>Tamaño recibo, como los del banco{isIncrement ? '.' : ': retirada, comisión y total.'}</small>
              <div className="mr-thumb"><div className="mr-thumb-frame is-compact"><div className="mr-thumb-scale"><CompactReceipt ref={compactRef} {...docProps} /></div></div></div>
            </div>
          </div>
        )}
        {error ? <p className="mr-error" role="alert">{error}</p> : null}
        <div className="mr-actions">
          <span>PDF de una página con sello y firma de JIGSA.</span>
          <div>
            <button type="button" className="mr-ghost" onClick={onClose}>Cerrar</button>
            <button type="button" className="mr-download" disabled={!receipt || busy} onClick={() => { void download(); }}>
              {busy ? 'Generando PDF…' : `Descargar ${format === 'extended' ? 'extendido' : 'resumido'}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
