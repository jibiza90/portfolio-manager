import React, { useEffect, useRef } from 'react';
import { formatCurrency, formatPercentValue } from '../utils/format';
import { longMonthLabel, type PublicationCheck, type PublicationIssue } from '../utils/publicationCheck';
import './PublicationCheckDialog.css';

// Ventana que sale al pulsar "Publicar actualización": solo enseña lo raro. El admin decide si publica.

interface Props {
  check: PublicationCheck | null;
  error: string | null;
  busy: boolean;
  nameOf: (clientId: string) => string;
  onConfirm: () => void;
  onCancel: () => void;
}

const SEVERITY_LABEL: Record<PublicationIssue['severity'], string> = {
  error: 'Revisar',
  warning: 'Atención',
  info: 'Para que lo sepas'
};

export const PublicationCheckDialog: React.FC<Props> = ({ check, error, busy, nameOf, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const problems = check ? check.issues.filter((issue) => issue.severity !== 'info') : [];
  const notes = check ? check.issues.filter((issue) => issue.severity === 'info') : [];
  const errors = problems.filter((issue) => issue.severity === 'error').length;
  const monthName = check?.month ? longMonthLabel(check.month) : '';
  const sortIssues = (list: PublicationIssue[]) => [...list].sort((left, right) =>
    (left.severity === right.severity ? 0 : left.severity === 'error' ? -1 : 1) || nameOf(left.clientId).localeCompare(nameOf(right.clientId), 'es'));

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="pc-title">Comprobación antes de publicar</h3>

        {error ? <p className="pc-alert is-error" role="alert">{error}</p> : null}

        {!check && !error ? <p className="pc-loading" role="status">Comprobando lo que verá cada cliente…</p> : null}

        {check ? (
          <>
            {problems.length === 0 ? (
              <p className="pc-alert is-ok">
                ✓ Todo correcto en {check.checkedClients} clientes{monthName ? ` · ${monthName}` : ''}.
              </p>
            ) : (
              <p className={`pc-alert ${errors > 0 ? 'is-error' : 'is-warning'}`}>
                {check.checkedClients} clientes revisados{monthName ? ` · ${monthName}` : ''}: {problems.length} {problems.length === 1 ? 'aviso' : 'avisos'}.
              </p>
            )}

            {problems.length > 0 ? (
              <ul className="pc-list">
                {sortIssues(problems).map((issue, index) => (
                  <li key={`${issue.clientId}-${index}`} className={`pc-item is-${issue.severity}`}>
                    <span className={`pc-chip is-${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
                    <span><strong>{nameOf(issue.clientId)}</strong> · {issue.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {notes.length > 0 ? (
              <ul className="pc-list">
                {sortIssues(notes).map((issue, index) => (
                  <li key={`${issue.clientId}-n${index}`} className="pc-item is-info">
                    <span className="pc-chip is-info">{SEVERITY_LABEL.info}</span>
                    <span><strong>{nameOf(issue.clientId)}</strong> · {issue.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <details className="pc-details">
              <summary>Ver resumen de todos los clientes</summary>
              <div className="pc-table-wrap">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="is-num">Saldo publicado</th>
                      <th className="is-num">Saldo nuevo</th>
                      <th className="is-num">% {monthName}</th>
                      <th className="is-num">Beneficio {monthName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...check.rows].sort((left, right) => nameOf(left.clientId).localeCompare(nameOf(right.clientId), 'es')).map((row) => (
                      <tr key={row.clientId}>
                        <td>{nameOf(row.clientId)}</td>
                        <td className="is-num">{row.saldoBefore !== undefined ? formatCurrency(row.saldoBefore) : '—'}</td>
                        <td className="is-num">{formatCurrency(row.saldoAfter)}</td>
                        <td className="is-num">{row.monthPct !== undefined ? formatPercentValue(row.monthPct) : '—'}</td>
                        <td className="is-num">{row.monthProfit !== undefined ? formatCurrency(row.monthProfit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : null}

        <div className="pc-actions">
          <button ref={cancelRef} type="button" className="pc-ghost" disabled={busy} onClick={onCancel}>Volver a revisar</button>
          <button type="button" className={`pc-publish${problems.length > 0 ? ' is-anyway' : ''}`} disabled={busy || !check} onClick={onConfirm}>
            {busy ? 'Publicando…' : problems.length > 0 ? 'Publicar igualmente' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
};
