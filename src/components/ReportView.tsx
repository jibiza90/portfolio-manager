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
      { label: 'Rentabilidad', value: `${report.rentabilidad.toFixed(2)}%` }
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
      <div className="report-view-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando informe...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="report-view-container">
        <div className="expired-state glass-card">
          <div className="expired-icon">⏰</div>
          <h2>Enlace caducado</h2>
          <p>Este enlace de informe ha caducado o no es válido.</p>
          <p className="muted">Los enlaces de informe tienen una validez de 24 horas.</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const expiresIn = Math.max(0, Math.floor((report.expiresAt - Date.now()) / (1000 * 60 * 60)));

  return (
    <div className="report-view-container">
      <div className="report-header glass-card">
        <div className="report-header-content">
          <h1>Informe de Inversión</h1>
          <p className="client-name">{report.clientName}</p>
          <p className="expiry-notice">⚠️ Este enlace caduca en {expiresIn} horas. Descarga o imprime el informe.</p>
        </div>
        <div className="report-actions">
          <button className="btn-action primary" onClick={handleDownload}>
            <span className="btn-icon">📥</span>
            Descargar PDF
          </button>
          <button className="btn-action secondary" onClick={handlePrint}>
            <span className="btn-icon">🖨️</span>
            Imprimir
          </button>
        </div>
      </div>

      <div className="report-content glass-card" ref={reportRef}>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">Capital Invertido</span>
            <span className="value">{formatCurrency(report.incrementos)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Capital Retirado</span>
            <span className="value">{formatCurrency(report.decrementos)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Saldo Actual</span>
            <span className="value highlight">{formatCurrency(report.saldo)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Beneficio Total</span>
            <span className={`value ${report.beneficioTotal >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(report.beneficioTotal)}
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Rentabilidad</span>
            <span className={`value ${report.rentabilidad >= 0 ? 'positive' : 'negative'}`}>
              {report.rentabilidad.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="monthly-table">
          <h3>Rendimiento Mensual</h3>
          <div className="data-table">
            <div className="table-header">
              <div>Mes</div>
              <div>Beneficio</div>
              <div>Rentabilidad</div>
              <div>Saldo</div>
            </div>
            {report.monthlyStats.filter(m => m.hasData).map((m, i) => (
              <div className="table-row" key={i}>
                <div>{m.month}</div>
                <div className={m.profit >= 0 ? 'positive' : 'negative'}>{formatCurrency(m.profit)}</div>
                <div className={m.profitPct >= 0 ? 'positive' : 'negative'}>{m.profitPct.toFixed(2)}%</div>
                <div>{formatCurrency(m.endBalance)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
