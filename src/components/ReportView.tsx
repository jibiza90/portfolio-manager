import React, { useEffect, useState, useRef } from 'react';
import { getReportByToken, ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import { calculateTWR, calculateAllMonthsTWR } from '../utils/twr';

interface ReportViewProps {
  token: string;
}

export const ReportView: React.FC<ReportViewProps> = ({ token }) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadReport = async () => {
      const data = await getReportByToken(token);
      if (data) {
        setReport(data);
      } else {
        setExpired(true);
      }
      setLoading(false);
    };
    loadReport();
  }, [token]);

  const handleDownload = async () => {
    if (!report) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = 20;

    const checkNewPage = (needed: number) => {
      if (y + needed > pageHeight - 30) {
        doc.addPage();
        y = 20;
        return true;
      }
      return false;
    };

    // Header
    doc.setFillColor(15, 109, 122);
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME DE INVERSIÓN', margin, 25);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(report.clientName, margin, 35);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - margin - 50, 35);

    y = 60;

    // KPIs
    doc.setTextColor(15, 109, 122);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', margin, y);
    y += 12;

    const kpis = [
      { label: 'Capital Invertido', value: formatCurrency(report.incrementos) },
      { label: 'Capital Retirado', value: formatCurrency(report.decrementos) },
      { label: 'Saldo Actual', value: formatCurrency(report.saldo) },
      { label: 'Beneficio Total', value: formatCurrency(report.beneficioTotal) },
      { label: 'Rentabilidad', value: `${report.rentabilidad.toFixed(2)}%` },
      { label: 'Beneficio Último Mes', value: formatCurrency(report.beneficioUltimoMes) },
      { label: 'Rentab. Último Mes', value: `${report.rentabilidadUltimoMes.toFixed(2)}%` },
      { label: 'Rentabilidad TWR', value: `${((report.twrYtd ?? 0) * 100).toFixed(2)}%` }
    ];

    doc.setFontSize(10);
    kpis.forEach((kpi) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(kpi.label + ':', margin, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.value, margin + 50, y);
      y += 7;
    });

    y += 10;

    // Monthly table
    if (report.monthlyStats.length > 0) {
      checkNewPage(60);
      doc.setTextColor(15, 109, 122);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RENDIMIENTO MENSUAL', margin, y);
      y += 10;

      doc.setFontSize(9);
      doc.setFillColor(15, 109, 122);
      doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 8, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('MES', margin + 4, y);
      doc.text('BENEFICIO', margin + 40, y);
      doc.text('RENTAB.', margin + 80, y);
      doc.text('SALDO', margin + 110, y);
      y += 9;

      doc.setFont('helvetica', 'normal');
      report.monthlyStats.forEach((m, i) => {
        if (!m.hasData || m.profit === null || m.profitPct === null || m.endBalance === null) return;
        checkNewPage(8);
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 5, pageWidth - margin * 2, 7, 'F');
        }
        doc.setTextColor(60, 60, 60);
        doc.text(m.month, margin + 4, y);
        if (m.profit >= 0) {
          doc.setTextColor(15, 109, 122);
        } else {
          doc.setTextColor(220, 38, 38);
        }
        doc.text(formatCurrency(m.profit), margin + 40, y);
        if (m.profitPct >= 0) {
          doc.setTextColor(15, 109, 122);
        } else {
          doc.setTextColor(220, 38, 38);
        }
        doc.text(`${m.profitPct.toFixed(2)}%`, margin + 80, y);
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrency(m.endBalance), margin + 110, y);
        y += 7;
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Página ${i} / ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.text('Confidencial', margin, pageHeight - 10);
    }

    doc.save(`Informe_${report.clientCode}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="informes-container informes-pro-page fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card report-pro-panel" style={{ padding: 40, textAlign: 'center' }}>
          <p>Cargando informe...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="informes-container informes-pro-page fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card report-pro-panel" style={{ padding: 40, textAlign: 'center' }}>
          <h2>Enlace caducado</h2>
          <p>Este enlace de informe ha caducado o no es valido.</p>
          <p className="muted">Los enlaces de informe tienen una validez de 24 horas.</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const expiresIn = Math.max(0, Math.floor((report.expiresAt - Date.now()) / (1000 * 60 * 60)));
  const monthlyWithData = report.monthlyStats.filter((m) => m.hasData && m.profit !== null && m.profitPct !== null && m.endBalance !== null);
  const hasNegativeMonth = monthlyWithData.some((m) => m.profitPct < 0);
  const maxMonthPct = Math.max(1, ...monthlyWithData.map((m) => Math.abs(m.profitPct)));
  const patrimonioWithData = report.patrimonioEvolution.filter((p) => p.balance !== undefined);
  const maxPatrimonio = Math.max(1, ...patrimonioWithData.map((p) => p.balance as number));
  const patrimonioPoints = patrimonioWithData.map((p, idx) => {
    const x = patrimonioWithData.length <= 1 ? 8 : (idx / (patrimonioWithData.length - 1)) * 100;
    const y = 92 - ((p.balance as number) / maxPatrimonio) * 78;
    return `${x},${Math.max(10, y)}`;
  }).join(' ');

  return (
    <div className="informes-container informes-pro-page fade-in">
      <div className="informe-actions glass-card report-pro-actions">
        <button className="btn-action primary" onClick={handleDownload}>Descargar PDF</button>
        <button className="btn-action secondary" onClick={handlePrint}>Imprimir</button>
        <div className="actions-note">Enlace temporal: caduca en {expiresIn} horas.</div>
      </div>

      <article className="informe-preview glass-card report-pro-sheet" ref={reportRef}>
        <header className="report-pro-header">
          <div>
            <p className="report-pro-kicker">Portfolio Manager</p>
            <h2>Investment Report</h2>
            <p className="report-pro-date">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="report-pro-client-tag">{report.clientCode}</div>
        </header>

        <section className="report-pro-client">
          <h3>{report.clientName}</h3>
        </section>

        <section className="report-pro-executive">
          <div>
            <p>Saldo actual</p>
            <strong>{formatCurrency(report.saldo)}</strong>
          </div>
          <div>
            <p>Beneficio total</p>
            <strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{formatCurrency(report.beneficioTotal)}</strong>
          </div>
          <div>
            <p>Rentabilidad total</p>
            <strong className={report.rentabilidad >= 0 ? 'positive' : 'negative'}>{report.rentabilidad.toFixed(2)}%</strong>
          </div>
        </section>

        <section className="report-pro-kpis">
          <div className="report-pro-kpi"><span>Capital invertido</span><strong>{formatCurrency(report.incrementos)}</strong></div>
          <div className="report-pro-kpi"><span>Capital retirado</span><strong>{formatCurrency(report.decrementos)}</strong></div>
          <div className="report-pro-kpi"><span>Beneficio ultimo mes</span><strong className={report.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}>{formatCurrency(report.beneficioUltimoMes)}</strong></div>
          <div className="report-pro-kpi"><span>Rentab. ultimo mes</span><strong className={report.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative'}>{report.rentabilidadUltimoMes.toFixed(2)}%</strong></div>
          <div className="report-pro-kpi"><span>TWR</span><strong className={(report.twrYtd ?? 0) >= 0 ? 'positive' : 'negative'}>{((report.twrYtd ?? 0) * 100).toFixed(2)}%</strong></div>
        </section>

        <section className="report-pro-panel report-pro-panel-xl">
          <div className="report-pro-panel-head">
            <h4>Rendimiento mensual</h4>
            <p>Comparativa de rentabilidad por mes</p>
          </div>
          <div
            className={`report-pro-bars ${hasNegativeMonth ? 'has-negative' : ''}`}
            style={{ gridTemplateColumns: `repeat(${Math.max(1, monthlyWithData.length)}, minmax(0, 1fr))` }}
          >
            {monthlyWithData.map((m) => {
              const height = Math.max(6, (Math.abs(m.profitPct) / maxMonthPct) * 74);
              return (
                <div key={m.month} className="report-pro-bar-col" title={`${m.month}: ${m.profitPct.toFixed(2)}%`}>
                  <span className={`report-pro-bar-value ${m.profitPct >= 0 ? 'positive' : 'negative'}`}>{m.profitPct.toFixed(2)}%</span>
                  <div className="report-pro-bar-track">
                    <div
                      className={`report-pro-bar ${m.profitPct >= 0 ? 'positive' : 'negative'}`}
                      style={{
                        height: `${height}%`,
                        ...(hasNegativeMonth
                          ? (m.profitPct >= 0 ? { bottom: '50%' } : { top: '50%' })
                          : { bottom: 0 })
                      }}
                    />
                  </div>
                  <span className="report-pro-bar-label">{m.month}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="report-pro-panel report-pro-panel-xl">
          <div className="report-pro-panel-head">
            <h4>Evolucion patrimonio</h4>
            <p>Linea de cierre mensual con importe en cada punto</p>
          </div>
          <div className="report-pro-line-wrap">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="report-pro-line-chart">
              <polyline className="report-pro-line" points={patrimonioPoints} />
              {patrimonioWithData.map((p, idx) => {
                const x = patrimonioWithData.length <= 1 ? 8 : (idx / (patrimonioWithData.length - 1)) * 100;
                const y = 92 - ((p.balance as number) / maxPatrimonio) * 78;
                const pointY = Math.max(10, y);
                const labelAbove = idx % 2 === 0 || pointY > 90;
                return (
                  <g key={`${p.month}-${idx}`}>
                    <text
                      x={x}
                      y={labelAbove ? Math.max(7, pointY - 3.8) : Math.min(98, pointY + 4.8)}
                      className="report-pro-point-value"
                      textAnchor="middle"
                      dominantBaseline={labelAbove ? 'auto' : 'hanging'}
                    >
                      {formatCurrency(p.balance)}
                    </text>
                    <circle cx={x} cy={pointY} r="1.7" className="report-pro-dot" />
                  </g>
                );
              })}
            </svg>
          </div>
          <div
            className="report-pro-month-row"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, patrimonioWithData.length)}, minmax(0, 1fr))` }}
          >
            {patrimonioWithData.map((p) => <span key={p.month}>{p.month}</span>)}
          </div>
        </section>

        <section className="report-pro-panel">
          <div className="report-pro-panel-head">
            <h4>Tabla mensual</h4>
            <p>Resultado, rentabilidad y saldo por mes</p>
          </div>
          <div className="table-scroll">
            <table className="monthly-table report-pro-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="text-right">Beneficio</th>
                  <th className="text-right">Rentabilidad</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlyStats.map((m) => (
                  <tr key={m.month}>
                    <td>{m.hasData ? m.month : '-'}</td>
                    <td className={`text-right ${m.hasData ? ((m.profit ?? 0) >= 0 ? 'positive' : 'negative') : ''}`}>
                      {m.hasData ? formatCurrency(m.profit ?? 0) : '-'}
                    </td>
                    <td className={`text-right ${m.hasData ? ((m.profitPct ?? 0) >= 0 ? 'positive' : 'negative') : ''}`}>
                      {m.hasData ? `${(m.profitPct ?? 0).toFixed(2)}%` : '-'}
                    </td>
                    <td className="text-right">{m.hasData ? formatCurrency(m.endBalance ?? 0) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </div>
  );
};
