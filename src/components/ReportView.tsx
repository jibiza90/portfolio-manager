import React, { useEffect, useState, useRef } from 'react';
import { getReportByToken, ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';

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
      { label: 'Rentab. Último Mes', value: `${report.rentabilidadUltimoMes.toFixed(2)}%` }
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
        if (!m.hasData) return;
        checkNewPage(8);
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 5, pageWidth - margin * 2, 7, 'F');
        }
        doc.setTextColor(60, 60, 60);
        doc.text(m.month, margin + 4, y);
        doc.setTextColor(m.profit >= 0 ? 5 : 220, m.profit >= 0 ? 150 : 38, m.profit >= 0 ? 105 : 38);
        doc.text(formatCurrency(m.profit), margin + 40, y);
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
      <div className="informes-container fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Cargando informe...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="informes-container fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <h2>Enlace caducado</h2>
          <p>Este enlace de informe ha caducado o no es válido.</p>
          <p className="muted">Los enlaces de informe tienen una validez de 24 horas.</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const expiresIn = Math.max(0, Math.floor((report.expiresAt - Date.now()) / (1000 * 60 * 60)));
  const hasNegative = report.monthlyStats.some((m) => m.hasData && m.profitPct < 0);
  const maxPct = Math.max(...report.monthlyStats.map((s) => Math.abs(s.profitPct)), 1);

  // Patrimonio chart data
  const patrimonioData = report.patrimonioEvolution;
  const validPatrimonio = patrimonioData.filter((d) => d.balance !== undefined && d.balance > 0);
  const maxBal = validPatrimonio.length > 0 ? Math.max(...validPatrimonio.map((d) => d.balance as number), 1) : 1;
  const minBal = validPatrimonio.length > 0 ? Math.min(...validPatrimonio.map((d) => d.balance as number), 0) : 0;
  const range = maxBal - minBal || 1;

  return (
    <div className="informes-container fade-in">
      <div className="informe-actions glass-card">
        <button className="btn-action primary" onClick={handleDownload}>
          <span className="btn-icon">📥</span>
          Descargar PDF
        </button>
        <button className="btn-action secondary" onClick={handlePrint}>
          <span className="btn-icon">🖨️</span>
          Imprimir
        </button>
        <div className="actions-note">⚠️ Este enlace caduca en {expiresIn} horas. Descarga o imprime antes.</div>
      </div>

      <div className="informe-preview glass-card" ref={reportRef}>
        <div className="preview-header">
          <div className="preview-logo">
            <span className="logo-icon">�</span>
            <span className="logo-text">Portfolio Manager</span>
          </div>
          <div className="preview-title">
            <h2>INFORME DE INVERSIÓN</h2>
            <p className="preview-date">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="preview-client">
          <div className="client-badge">{report.clientCode}</div>
          <div className="client-details">
            <h3>{report.clientName}</h3>
          </div>
        </div>

        <div className="preview-summary">
          <h4>Resumen Financiero</h4>
          <div className="summary-grid seven-cols">
            <div className="summary-card">
              <span className="summary-label">Capital Invertido</span>
              <span className="summary-value">{formatCurrency(report.incrementos)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Capital Retirado</span>
              <span className="summary-value">{formatCurrency(report.decrementos)}</span>
            </div>
            <div className="summary-card highlight">
              <span className="summary-label">Saldo Actual</span>
              <span className="summary-value">{formatCurrency(report.saldo)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Beneficio Total</span>
              <span className={`summary-value ${report.beneficioTotal >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(report.beneficioTotal)}
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Rentabilidad Total</span>
              <span className={`summary-value ${report.rentabilidad >= 0 ? 'positive' : 'negative'}`}>
                {report.rentabilidad.toFixed(2)}%
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Beneficio Último Mes</span>
              <span className={`summary-value ${report.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(report.beneficioUltimoMes)}
              </span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Rentab. Último Mes</span>
              <span className={`summary-value ${report.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative'}`}>
                {report.rentabilidadUltimoMes.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {report.monthlyStats.length > 0 && (
          <div className="preview-monthly">
            <h4>Rendimiento Mensual (%)</h4>
            <div className="chart-container">
              <div className={`bar-chart ${hasNegative ? 'with-negative' : 'positive-only'}`}>
                {report.monthlyStats.map((m) => {
                  const heightPct = m.hasData ? (Math.abs(m.profitPct) / maxPct) * 100 : 2;
                  const isNeg = m.profitPct < 0;
                  return (
                    <div key={m.month} className="bar-wrapper">
                      <span className="bar-value">{m.hasData ? `${m.profitPct.toFixed(1)}%` : '-'}</span>
                      <div className="bar-container" style={hasNegative ? { justifyContent: 'center' } : { justifyContent: 'flex-end' }}>
                        <div
                          className={`bar ${m.hasData ? (isNeg ? 'negative' : 'positive') : ''}`}
                          style={{
                            height: `${heightPct}%`,
                            alignSelf: hasNegative ? (isNeg ? 'flex-start' : 'flex-end') : 'flex-end',
                            marginTop: hasNegative && !isNeg ? 'auto' : undefined,
                            marginBottom: hasNegative && isNeg ? 'auto' : undefined
                          }}
                        />
                      </div>
                      <span className="bar-label">{m.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <table className="monthly-table">
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
                    <td className={`text-right ${m.hasData ? (m.profit >= 0 ? 'positive' : 'negative') : ''}`}>
                      {m.hasData ? formatCurrency(m.profit) : '-'}
                    </td>
                    <td className={`text-right ${m.hasData ? (m.profitPct >= 0 ? 'positive' : 'negative') : ''}`}>
                      {m.hasData ? `${m.profitPct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="text-right">{m.hasData ? formatCurrency(m.endBalance) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {validPatrimonio.length > 0 && (
          <div className="preview-patrimonio">
            <h4>Evolución del Patrimonio</h4>
            <div className="line-chart-container">
              <svg className="line-chart" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
                {(() => {
                  const validWithIndex = patrimonioData.map((d, i) => ({ ...d, idx: i })).filter((d) => d.balance !== undefined && d.balance > 0);
                  const points = validWithIndex.map((d) => ({
                    x: 30 + (d.idx / 11) * 340,
                    y: 120 - (((d.balance as number) - minBal) / range) * 100,
                    balance: d.balance as number,
                    month: d.month
                  }));
                  
                  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const areaD = points.length > 1 ? `${pathD} L ${points[points.length - 1].x} 120 L ${points[0].x} 120 Z` : '';
                  
                  return (
                    <>
                      <defs>
                        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#0f6d7a" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#0f6d7a" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      {areaD && <path d={areaD} fill="url(#areaGradient)" />}
                      <path d={pathD} fill="none" stroke="#0f6d7a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="4" fill="#0f6d7a" />
                          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="8" fill="#0f6d7a" fontWeight="600">
                            {formatCurrency(p.balance)}
                          </text>
                        </g>
                      ))}
                      {patrimonioData.map((d, i) => (
                        <text key={i} x={30 + (i / 11) * 340} y="150" textAnchor="middle" fontSize="9" fill="#64748b">
                          {d.month}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
