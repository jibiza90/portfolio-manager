import React, { useMemo, useRef, useState } from 'react';
import { CLIENTS } from '../constants/clients';
import { usePortfolioStore } from '../store/portfolio';
import { formatCurrency, formatPercent } from '../utils/format';
import { YEAR } from '../utils/dates';
import { saveReportLink } from '../services/reportLinks';
import { calculateTWR, calculateAllMonthsTWR } from '../utils/twr';

type ContactInfo = { name: string; surname: string; email: string; phone: string };
type Movement = { iso: string; type: 'increment' | 'decrement'; amount: number; balance: number };

export function InformesView({ contacts }: { contacts: Record<string, ContactInfo> }) {
  const { snapshot } = usePortfolioStore();
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const [sendingMultiple, setSendingMultiple] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  const clientData = useMemo(() => {
    if (!selectedClient) return null;
    const client = CLIENTS.find((c) => c.id === selectedClient);
    if (!client) return null;

    const rows = snapshot.clientRowsById[selectedClient] || [];
    const yearRows = rows.filter((r) => r.iso.startsWith(`${YEAR}-`));
    const incrementos = yearRows.reduce((s, r) => s + (r.increment || 0), 0);
    const decrementos = yearRows.reduce((s, r) => s + (r.decrement || 0), 0);
    const validRows = [...yearRows].reverse();
    const lastWithFinal = validRows.find((r) => r.finalBalance !== undefined && r.finalBalance > 0);
    const lastWithBase = validRows.find((r) => r.baseBalance !== undefined && r.baseBalance > 0);
    const saldo = lastWithFinal?.finalBalance ?? lastWithBase?.baseBalance ?? 0;
    const beneficioTotal = saldo + decrementos - incrementos;
    const rentabilidad = incrementos > 0 ? (beneficioTotal / incrementos) * 100 : 0;

    // Monthly stats - MISMO CÁLCULO QUE ClientPanel analytics
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const byMonth = new Map<string, { profit: number; baseStart?: number; finalEnd?: number }>();
    let lastKnownFinal: number | undefined;

    yearRows.forEach((r) => {
      const month = r.iso.slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, { profit: 0, baseStart: undefined, finalEnd: undefined });
      }
      const entry = byMonth.get(month)!;
      if (r.profit !== undefined) entry.profit += r.profit;
      if (entry.baseStart === undefined && r.baseBalance !== undefined && r.baseBalance > 0) entry.baseStart = r.baseBalance;
      if (r.finalBalance !== undefined && r.finalBalance > 0) {
        entry.finalEnd = r.finalBalance;
        lastKnownFinal = r.finalBalance;
      }
    });

    const monthKeys = Array.from(byMonth.keys()).sort();
    const monthlyStats: { month: string; monthNum: number; profit: number; profitPct: number; endBalance: number; hasData: boolean }[] = [];

    monthKeys.forEach((monthKey) => {
      const entry = byMonth.get(monthKey)!;
      const { profit, finalEnd } = entry;
      let { baseStart } = entry;
      
      // Fallback si baseStart es undefined o 0
      if (baseStart === undefined || baseStart === 0) {
        const idx = monthKeys.indexOf(monthKey);
        if (idx > 0) {
          baseStart = byMonth.get(monthKeys[idx - 1])?.finalEnd;
        }
      }
      if (baseStart === undefined || baseStart === 0) {
        if (finalEnd !== undefined && finalEnd > 0) {
          baseStart = Math.max(1, finalEnd - profit);
        }
      }
      
      let retPct = 0;
      if (baseStart && baseStart > 0) {
        retPct = (profit / baseStart) * 100;
      }
      
      const monthNum = parseInt(monthKey.slice(5, 7));
      monthlyStats.push({
        month: monthNames[monthNum - 1],
        monthNum,
        profit,
        profitPct: retPct,
        endBalance: finalEnd ?? 0,
        hasData: true
      });
    });

    // Rellenar meses sin datos con guion (sin datos reales)
    for (let m = 1; m <= 12; m++) {
      if (!monthlyStats.find((ms) => ms.monthNum === m)) {
        monthlyStats.push({ month: monthNames[m - 1], monthNum: m, profit: 0, profitPct: 0, endBalance: 0, hasData: false });
      }
    }
    monthlyStats.sort((a, b) => a.monthNum - b.monthNum);

    // Evolución patrimonio - MISMO CÁLCULO QUE ClientPanel
    let running = lastKnownFinal;
    const patrimonioEvolution: { month: string; balance?: number; hasData: boolean }[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${YEAR}-${m.toString().padStart(2, '0')}`;
      const entry = byMonth.get(key);
      if (entry?.finalEnd !== undefined) {
        running = entry.finalEnd;
        patrimonioEvolution.push({ month: monthNames[m - 1], balance: running, hasData: true });
      } else {
        patrimonioEvolution.push({ month: monthNames[m - 1], balance: undefined, hasData: false });
      }
    }

    // Movements (incrementos y decrementos)
    const movements: Movement[] = [];
    yearRows.sort((a, b) => a.iso.localeCompare(b.iso)).forEach((r) => {
      if (r.increment && r.increment > 0) {
        movements.push({ iso: r.iso, type: 'increment', amount: r.increment, balance: r.finalBalance || 0 });
      }
      if (r.decrement && r.decrement > 0) {
        movements.push({ iso: r.iso, type: 'decrement', amount: r.decrement, balance: r.finalBalance || 0 });
      }
    });

    const ct = contacts[selectedClient];
    const displayName = ct && (ct.name || ct.surname) ? `${ct.name} ${ct.surname}`.trim() : client.name;

    // Calcular TWR
    const twrYtd = calculateTWR(yearRows);
    const twrMonthly = calculateAllMonthsTWR(yearRows);

    // Último mes
    const monthlyWithData = monthlyStats.filter((m) => m.hasData && (m.profit !== 0 || m.profitPct !== 0 || m.endBalance !== 0));
    const lastMonth = monthlyWithData.length > 0 ? monthlyWithData[monthlyWithData.length - 1] : null;
    const beneficioUltimoMes = lastMonth?.profit ?? 0;
    const rentabilidadUltimoMes = lastMonth?.profitPct ?? 0;

    return {
      id: client.id,
      code: client.name,
      name: displayName,
      contact: ct,
      incrementos,
      decrementos,
      saldo,
      beneficioTotal,
      rentabilidad,
      monthlyStats,
      movements,
      patrimonioEvolution,
      beneficioUltimoMes,
      rentabilidadUltimoMes,
      twrYtd: twrYtd.twr,
      twrMonthly
    };
  }, [selectedClient, snapshot, contacts]);

  // Datos filtrados (solo meses con datos) para gráficos/tablas en preview
  const monthlyChart = useMemo(() => clientData?.monthlyStats ?? [], [clientData]);
  const patrimonioChart = useMemo(() => clientData?.patrimonioEvolution ?? [], [clientData]);

  const generatePDF = async () => {
    if (!clientData) return;
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

    const addFooter = (pageNumber: number, totalPages: number) => {
      const footerY = pageHeight - 10;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Página ${pageNumber} / ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      doc.text('Confidencial', margin, footerY);
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
    doc.text(`${clientData.name}`, margin, 35);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - margin - 50, 35);
    doc.setFontSize(9);
    doc.setTextColor(230, 230, 230);
    doc.text('Enlace temporal, caduca en 24h. Descarga o imprime antes de esa fecha.', margin, 42);

    y = 60;

    // Client info section
    doc.setTextColor(15, 109, 122);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', margin, y);
    y += 10;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Código: ${clientData.code}`, margin, y);
    y += 7;
    doc.text(`Nombre: ${clientData.name}`, margin, y);
    y += 7;
    if (clientData.contact?.email) {
      doc.text(`Email: ${clientData.contact.email}`, margin, y);
      y += 7;
    }
    if (clientData.contact?.phone) {
      doc.text(`Teléfono: ${clientData.contact.phone}`, margin, y);
      y += 7;
    }

    y += 15;

    // Financial summary - Premium Design
    doc.setTextColor(15, 109, 122);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', margin, y);
    y += 8;

    // Línea decorativa
    doc.setDrawColor(15, 109, 122);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 40, y);
    y += 10;

    // KPI Grid - 3 columnas x 2 filas
    const kpiWidth = (pageWidth - margin * 2 - 16) / 3;
    const kpiHeight = 22;
    const kpiGap = 8;

    const kpis = [
      { label: 'Capital Invertido', value: formatCurrency(clientData.incrementos), accent: false },
      { label: 'Capital Retirado', value: formatCurrency(clientData.decrementos), accent: false },
      { label: 'Saldo Actual', value: formatCurrency(clientData.saldo), accent: true, positive: true },
      { label: 'Beneficio Total', value: formatCurrency(clientData.beneficioTotal), accent: true, positive: clientData.beneficioTotal >= 0 },
      { label: 'Rentabilidad Total', value: `${clientData.rentabilidad.toFixed(2)}%`, accent: true, positive: clientData.rentabilidad >= 0 },
      { label: 'Beneficio Último Mes', value: formatCurrency(clientData.beneficioUltimoMes), accent: true, positive: clientData.beneficioUltimoMes >= 0 },
      { label: 'Rentab. Último Mes', value: `${clientData.rentabilidadUltimoMes.toFixed(2)}%`, accent: true, positive: clientData.rentabilidadUltimoMes >= 0 },
      { label: 'Rentabilidad TWR', value: `${(clientData.twrYtd * 100).toFixed(2)}%`, accent: true, positive: clientData.twrYtd >= 0 }
    ];

    kpis.forEach((kpi, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = margin + col * (kpiWidth + kpiGap);
      const yPos = y + row * (kpiHeight + kpiGap);

      // Background
      if (kpi.accent) {
        doc.setFillColor(kpi.positive ? 240 : 254, kpi.positive ? 253 : 242, kpi.positive ? 244 : 242);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.roundedRect(x, yPos, kpiWidth, kpiHeight, 2, 2, 'F');

      // Border
      doc.setDrawColor(kpi.accent ? (kpi.positive ? 5 : 220) : 226, kpi.accent ? (kpi.positive ? 150 : 38) : 232, kpi.accent ? (kpi.positive ? 105 : 38) : 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, yPos, kpiWidth, kpiHeight, 2, 2, 'S');

      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label.toUpperCase(), x + 4, yPos + 7);

      // Value
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      if (kpi.accent) {
        doc.setTextColor(kpi.positive ? 5 : 220, kpi.positive ? 150 : 38, kpi.positive ? 105 : 38);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(kpi.value, x + 4, yPos + 17);
    });

    y += Math.ceil(kpis.length / 3) * (kpiHeight + kpiGap) + 15;

    // Monthly performance with chart (% rentabilidad)
    const monthlyData = clientData.monthlyStats;
    if (monthlyData.length > 0) {
      checkNewPage(80);
      doc.setTextColor(15, 109, 122);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RENDIMIENTO MENSUAL (%)', margin, y);
      y += 12;

      // Bar chart - usando % rentabilidad
      const chartWidth = pageWidth - margin * 2;
      const chartHeight = 50;
      const barWidth = chartWidth / monthlyData.length - 4;
      const maxPct = Math.max(...monthlyData.map(m => Math.abs(m.profitPct)), 1);
      const hasNegative = monthlyData.some((m) => m.hasData && m.profitPct < 0);

      // Chart background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, chartWidth, chartHeight, 2, 2, 'F');

      // Zero line - solo si hay negativos
      const baseY = hasNegative ? y + chartHeight / 2 : y + chartHeight - 5;
      if (hasNegative) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, baseY, margin + chartWidth, baseY);
      }

      // Bars con % encima
      const barMaxHeight = hasNegative ? chartHeight / 2 - 8 : chartHeight - 15;
      monthlyData.forEach((m, i) => {
        const barX = margin + 2 + i * (barWidth + 4);
        // Altura mínima de 2mm para barras con datos
        const rawHeight = (Math.abs(m.profitPct) / maxPct) * barMaxHeight;
        const barHeight = m.hasData && m.profitPct !== 0 ? Math.max(2, rawHeight) : 0;
        
        if (m.hasData && barHeight > 0) {
          if (m.profitPct >= 0) {
            doc.setFillColor(5, 150, 105);
            doc.roundedRect(barX, baseY - barHeight, barWidth, barHeight, 1, 1, 'F');
            doc.setFontSize(6);
            doc.setTextColor(5, 150, 105);
            doc.text(`${m.profitPct.toFixed(1)}%`, barX + barWidth / 2, baseY - barHeight - 2, { align: 'center' });
          } else {
            doc.setFillColor(220, 38, 38);
            doc.roundedRect(barX, baseY, barWidth, barHeight, 1, 1, 'F');
            doc.setFontSize(6);
            doc.setTextColor(220, 38, 38);
            doc.text(`${m.profitPct.toFixed(1)}%`, barX + barWidth / 2, baseY + barHeight + 4, { align: 'center' });
          }
        }

        // Month label
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(m.month, barX + barWidth / 2, y + chartHeight + 5, { align: 'center' });
      });

      y += chartHeight + 20;

      // Separador visual
      doc.setDrawColor(15, 109, 122);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      // Table - Premium aligned columns
      const tableWidth = pageWidth - margin * 2;
      const colWidths = [30, 45, 40, 55]; // Mes, Beneficio, Rentab, Saldo
      const colX = [margin, margin + colWidths[0], margin + colWidths[0] + colWidths[1], margin + colWidths[0] + colWidths[1] + colWidths[2]];

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(15, 109, 122);
      doc.roundedRect(margin, y - 5, tableWidth, 8, 1, 1, 'F');
      doc.text('MES', colX[0] + 4, y);
      doc.text('BENEFICIO', colX[1] + 4, y);
      doc.text('RENTAB.', colX[2] + 4, y);
      doc.text('SALDO FINAL', colX[3] + 4, y);
      y += 9;

      doc.setFont('helvetica', 'normal');
      monthlyData.forEach((m, i) => {
        checkNewPage(8);
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 5, tableWidth, 7, 'F');
        }
        // Mes
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.text(m.month, colX[0] + 4, y);
        // Beneficio
        doc.setTextColor(m.hasData ? (m.profit >= 0 ? 5 : 220) : 100, m.hasData ? (m.profit >= 0 ? 150 : 38) : 100, m.hasData ? (m.profit >= 0 ? 105 : 38) : 100);
        doc.text(m.hasData ? formatCurrency(m.profit) : '-', colX[1] + 4, y);
        // Rentabilidad
        doc.setTextColor(m.hasData ? (m.profitPct >= 0 ? 5 : 220) : 100, m.hasData ? (m.profitPct >= 0 ? 150 : 38) : 100, m.hasData ? (m.profitPct >= 0 ? 105 : 38) : 100);
        doc.text(m.hasData ? `${m.profitPct.toFixed(2)}%` : '-', colX[2] + 4, y);
        // Saldo
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(m.hasData ? formatCurrency(m.endBalance) : '-', colX[3] + 4, y);
        doc.setFont('helvetica', 'normal');
        y += 7;
      });
    }

    y += 15;

    // Patrimonio evolution chart - IGUAL QUE PREVIEW
    const evoData = clientData.patrimonioEvolution;
    const evoValid = evoData.filter((p) => p.balance !== undefined);
    if (evoValid.length > 0) {
      checkNewPage(80);
      doc.setTextColor(15, 109, 122);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('EVOLUCIÓN DEL PATRIMONIO', margin, y);
      y += 8;
      doc.setDrawColor(15, 109, 122);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + 50, y);
      y += 12;

      const chartWidth = pageWidth - margin * 2;
      const chartHeight = 50;
      const balances = evoValid.map((p) => p.balance as number);
      const maxBalance = Math.max(...balances, 1);
      const minBalance = Math.min(...balances, 0);
      const range = maxBalance - minBalance || 1;

      // Chart background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, chartWidth, chartHeight, 3, 3, 'F');

      // Calcular puntos posicionados en su mes correcto (12 meses)
      const validWithIndex = evoData.map((d, i) => ({ ...d, idx: i })).filter((d) => d.balance !== undefined);
      const points: { x: number; y: number; balance: number; month: string }[] = validWithIndex.map((d) => ({
        x: margin + 8 + (d.idx / 11) * (chartWidth - 16),
        y: y + chartHeight - 8 - (((d.balance as number) - minBalance) / range) * (chartHeight - 18),
        balance: d.balance as number,
        month: d.month
      }));

      // Draw line
      doc.setDrawColor(15, 109, 122);
      doc.setLineWidth(1.5);
      for (let i = 0; i < points.length - 1; i++) {
        doc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }

      // Draw points and values
      points.forEach((pt) => {
        doc.setFillColor(15, 109, 122);
        doc.circle(pt.x, pt.y, 2, 'F');
        doc.setFillColor(255, 255, 255);
        doc.circle(pt.x, pt.y, 1, 'F');
        
        // Label above point with background to avoid overlap with line
        const val = formatCurrency(pt.balance);
        doc.setFontSize(6);
        doc.setTextColor(15, 109, 122);
        const w = doc.getTextWidth(val) + 4;
        const h = 5;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pt.x - w / 2, pt.y - 9, w, h + 2, 1, 1, 'F');
        doc.text(val, pt.x, pt.y - 5, { align: 'center' });
      });

      // Month labels - todos los 12 meses
      evoData.forEach((p, i) => {
        const x = margin + 8 + (i / 11) * (chartWidth - 16);
        doc.setFontSize(7);
        doc.setTextColor(p.hasData ? 60 : 160, p.hasData ? 60 : 160, p.hasData ? 60 : 160);
        doc.text(p.month, x, y + chartHeight + 6, { align: 'center' });
      });

      y += chartHeight + 18;
    }

    y += 10;

    // Movements section - Premium aligned table
    if (clientData.movements.length > 0) {
      checkNewPage(30);
      doc.setTextColor(15, 109, 122);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('HISTORIAL DE MOVIMIENTOS', margin, y);
      y += 8;
      doc.setDrawColor(15, 109, 122);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + 50, y);
      y += 10;

      const movTableWidth = pageWidth - margin * 2;
      const movColWidths = [35, 40, 50, 45];
      const movColX = [margin, margin + movColWidths[0], margin + movColWidths[0] + movColWidths[1], margin + movColWidths[0] + movColWidths[1] + movColWidths[2]];

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(15, 109, 122);
      doc.roundedRect(margin, y - 5, movTableWidth, 8, 1, 1, 'F');
      doc.text('FECHA', movColX[0] + 4, y);
      doc.text('TIPO', movColX[1] + 4, y);
      doc.text('IMPORTE', movColX[2] + 4, y);
      doc.text('SALDO', movColX[3] + 4, y);
      y += 9;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      clientData.movements.forEach((mov, i) => {
        checkNewPage(8);
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 5, movTableWidth, 7, 'F');
        }
        // Fecha
        doc.setTextColor(60, 60, 60);
        doc.text(formatDate(mov.iso), movColX[0] + 4, y);
        // Tipo
        doc.setTextColor(mov.type === 'increment' ? 5 : 220, mov.type === 'increment' ? 150 : 38, mov.type === 'increment' ? 105 : 38);
        doc.text(mov.type === 'increment' ? 'Aportación' : 'Retirada', movColX[1] + 4, y);
        // Importe
        doc.text((mov.type === 'increment' ? '+' : '-') + formatCurrency(mov.amount), movColX[2] + 4, y);
        // Saldo
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(mov.balance), movColX[3] + 4, y);
        doc.setFont('helvetica', 'normal');
        y += 7;
      });
    }

    // Add footer to all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }

    // Final page footer
    doc.setPage(totalPages);
    y = pageHeight - 25;
    doc.setFillColor(15, 109, 122);
    doc.rect(0, y, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('Este informe es confidencial y está destinado únicamente al cliente indicado.', pageWidth / 2, y + 8, { align: 'center' });
    doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, pageWidth / 2, y + 14, { align: 'center' });

    return doc;
  };

  const handleDownload = async () => {
    const doc = await generatePDF();
    if (doc) {
      doc.save(`Informe_${clientData?.code}_${new Date().toISOString().slice(0, 10)}.pdf`);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: 'PDF descargado' }));
    }
  };

  const handlePrint = async () => {
    const doc = await generatePDF();
    if (doc) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const handleEmail = async () => {
    if (!clientData?.contact?.email) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: 'El cliente no tiene email configurado' }));
      return;
    }
    
    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Generando enlace...' }));
    
    // Guardar informe en Firestore y obtener token
    // Limpiar undefined para Firestore
    const token = await saveReportLink({
      clientId: clientData.id,
      clientName: clientData.name,
      clientCode: clientData.code,
      incrementos: clientData.incrementos ?? 0,
      decrementos: clientData.decrementos ?? 0,
      saldo: clientData.saldo ?? 0,
      beneficioTotal: clientData.beneficioTotal ?? 0,
      rentabilidad: clientData.rentabilidad ?? 0,
      beneficioUltimoMes: clientData.beneficioUltimoMes ?? 0,
      rentabilidadUltimoMes: clientData.rentabilidadUltimoMes ?? 0,
      twrYtd: clientData.twrYtd ?? 0,
      monthlyStats: clientData.monthlyStats.map(m => ({
        month: m.month,
        profit: m.profit ?? 0,
        profitPct: m.profitPct ?? 0,
        endBalance: m.endBalance ?? 0,
        hasData: m.hasData ?? false
      })),
      patrimonioEvolution: clientData.patrimonioEvolution.map(p => ({
        month: p.month,
        balance: p.balance ?? 0,
        hasData: p.hasData ?? false
      })),
      movements: clientData.movements.map(m => ({
        iso: m.iso,
        type: m.type,
        amount: m.amount ?? 0,
        balance: m.balance ?? 0
      }))
    });
    
    // Generar URL del informe
    const baseUrl = window.location.origin;
    const reportUrl = `${baseUrl}?report=${token}`;
    
    // Abrir Gmail con datos pre-rellenados
    const clientName = clientData.contact.name || clientData.name;
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const to = encodeURIComponent(clientData.contact.email);
    const subject = encodeURIComponent(`Informe de Inversión - ${clientData.name} - ${fecha}`);
    const body = encodeURIComponent(
`Estimado/a ${clientName},

Le envío su Informe de Inversión actualizado a fecha ${fecha}.

📊 RESUMEN:
• Capital invertido: ${formatCurrency(clientData.incrementos)}
• Capital retirado: ${formatCurrency(clientData.decrementos)}
• Saldo actual: ${formatCurrency(clientData.saldo)}
• Beneficio total: ${formatCurrency(clientData.beneficioTotal)}
• Rentabilidad: ${clientData.rentabilidad.toFixed(2)}%

🔗 ACCEDER AL INFORME:
${reportUrl}

⚠️ IMPORTANTE: Este enlace es confidencial y caduca en 24 horas. Por favor, descargue o imprima el informe antes de esa fecha.

Si tiene alguna pregunta sobre su inversión, no dude en contactarme.

Atentamente,
Su gestor de inversiones`
    );
    
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');
    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Gmail abierto con el enlace del informe.' }));
  };

  return (
    <div className="informes-container fade-in">
      <div className="informes-header glass-card">
        <div className="informes-header-content">
          <div className="eyebrow">Generación de informes</div>
          <h1>Informes de Cliente</h1>
          <p className="hero-copy">Genera informes profesionales para tus clientes</p>
        </div>
      </div>

      <div className="informes-selector glass-card">
        <div className="selector-row">
          <label htmlFor="client-select">Seleccionar cliente</label>
          <div className="select-wrapper large">
            <select
              id="client-select"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">Selecciona un cliente...</option>
              {CLIENTS.map((c) => {
                const ct = contacts[c.id];
                const label = ct && (ct.name || ct.surname) ? `${c.name} - ${ct.name} ${ct.surname}`.trim() : c.name;
                return <option key={c.id} value={c.id}>{label}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      <div className="informes-multi glass-card">
        <div className="multi-header">
          <h4>Envío múltiple</h4>
          <div className="multi-actions">
            <button
              className={`btn-small ${multiMode ? '' : 'secondary'}`}
              onClick={() => {
                if (multiMode) setSelectedClients([]);
                setMultiMode(!multiMode);
              }}
            >
              {multiMode ? 'Ocultar selección' : 'Activar envío múltiple'}
            </button>
            {multiMode && (
              <>
                <button
                  className="btn-small"
                  onClick={() => {
                    const withEmail = CLIENTS.filter((c) => contacts[c.id]?.email).map((c) => c.id);
                    setSelectedClients(withEmail);
                  }}
                >
                  Seleccionar TODOS
                </button>
                <button className="btn-small secondary" onClick={() => setSelectedClients([])}>
                  Limpiar
                </button>
              </>
            )}
          </div>
        </div>

        {multiMode && (
          <>
            <div className="multi-select-grid">
              {CLIENTS.map((c) => {
                const ct = contacts[c.id];
                const hasEmail = ct?.email;
                const label = ct && (ct.name || ct.surname) ? `${c.name} - ${ct.name} ${ct.surname}`.trim() : c.name;
                const isSelected = selectedClients.includes(c.id);
                return (
                  <label key={c.id} className={`multi-select-item ${isSelected ? 'selected' : ''} ${!hasEmail ? 'no-email' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!hasEmail}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClients([...selectedClients, c.id]);
                        } else {
                          setSelectedClients(selectedClients.filter((id) => id !== c.id));
                        }
                      }}
                    />
                    <span>{label}</span>
                    {!hasEmail && <span className="no-email-badge">Sin email</span>}
                  </label>
                );
              })}
            </div>
            <div className="multi-select-count">
              <span className="selected-count">
                {selectedClients.length > 0 
                  ? `${selectedClients.length} cliente${selectedClients.length > 1 ? 's' : ''} seleccionado${selectedClients.length > 1 ? 's' : ''}`
                  : 'Ningún cliente seleccionado'}
              </span>
              {selectedClients.length > 0 && (
                <button
                  className="btn-action primary send-btn"
                  disabled={sendingMultiple}
                  onClick={async () => {
                  setSendingMultiple(true);
                  for (const clientId of selectedClients) {
                    const client = CLIENTS.find((c) => c.id === clientId);
                    if (!client) continue;
                    const ct = contacts[clientId];
                    if (!ct?.email) continue;

                    const rows = snapshot.clientRowsById[clientId] || [];
                    const yearRows = rows.filter((r) => r.iso.startsWith(`${YEAR}-`));
                    const incrementos = yearRows.reduce((s, r) => s + (r.increment || 0), 0);
                    const decrementos = yearRows.reduce((s, r) => s + (r.decrement || 0), 0);
                    const validRows = [...yearRows].reverse();
                    const lastWithFinal = validRows.find((r) => r.finalBalance !== undefined && r.finalBalance > 0);
                    const lastWithBase = validRows.find((r) => r.baseBalance !== undefined && r.baseBalance > 0);
                    const saldo = lastWithFinal?.finalBalance ?? lastWithBase?.baseBalance ?? 0;
                    const beneficioTotal = saldo + decrementos - incrementos;
                    const rentabilidad = incrementos > 0 ? (beneficioTotal / incrementos) * 100 : 0;

                    const displayName = ct && (ct.name || ct.surname) ? `${ct.name} ${ct.surname}`.trim() : client.name;

                    const token = await saveReportLink({
                      clientId: client.id,
                      clientName: displayName,
                      clientCode: client.name,
                      incrementos: incrementos ?? 0,
                      decrementos: decrementos ?? 0,
                      saldo: saldo ?? 0,
                      beneficioTotal: beneficioTotal ?? 0,
                      rentabilidad: rentabilidad ?? 0,
                      beneficioUltimoMes: 0,
                      rentabilidadUltimoMes: 0,
                      monthlyStats: [],
                      patrimonioEvolution: [],
                      movements: []
                    });

                    const baseUrl = window.location.origin;
                    const reportUrl = `${baseUrl}?report=${token}`;
                    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
                    const to = encodeURIComponent(ct.email);
                    const subject = encodeURIComponent(`Informe de Inversión - ${client.name} - ${fecha}`);
                    const body = encodeURIComponent(
`Estimado/a ${ct.name || 'cliente'},

Le envío su Informe de Inversión actualizado a fecha ${fecha}.

📊 RESUMEN:
• Capital invertido: ${formatCurrency(incrementos)}
• Saldo actual: ${formatCurrency(saldo)}
• Beneficio total: ${formatCurrency(beneficioTotal)}
• Rentabilidad: ${rentabilidad.toFixed(2)}%

🔗 ACCEDER AL INFORME:
${reportUrl}

⚠️ Este enlace caduca en 24 horas.

Atentamente,
Su gestor de inversiones`
                    );

                    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`;
                  window.open(gmailUrl, '_blank');
                  await new Promise((r) => setTimeout(r, 500));
                }
                setSendingMultiple(false);
                setSelectedClients([]);
                setMultiMode(false);
                window.dispatchEvent(new CustomEvent('show-toast', { detail: `${selectedClients.length} emails preparados en Gmail` }));
              }}
            >
                  <span className="btn-icon">✉️</span>
                  {sendingMultiple ? 'Enviando...' : `Enviar a ${selectedClients.length} cliente${selectedClients.length > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {clientData && (
        <>
          <div className="informe-actions glass-card">
            <button className="btn-action primary" onClick={handleDownload}>
              <span className="btn-icon">📥</span>
              Descargar PDF
            </button>
            <button className="btn-action secondary" onClick={handlePrint}>
              <span className="btn-icon">🖨️</span>
              Imprimir
            </button>
            <button className="btn-action secondary" onClick={handleEmail}>
              <span className="btn-icon">✉️</span>
              Enviar por Email
            </button>
            <div className="actions-note">Enlace temporal: caduca en 24h. Descarga o imprime antes de esa fecha.</div>
          </div>

          <div className="informe-preview glass-card" ref={reportRef}>
            <div className="preview-header">
              <div className="preview-logo">
                <span className="logo-icon">📊</span>
                <span className="logo-text">Portfolio Manager</span>
              </div>
              <div className="preview-title">
                <h2>INFORME DE INVERSIÓN</h2>
                <p className="preview-date">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>

            <div className="preview-client">
              <div className="client-badge">{clientData.code}</div>
              <div className="client-details">
                <h3>{clientData.name}</h3>
                {clientData.contact?.email && <p>{clientData.contact.email}</p>}
                {clientData.contact?.phone && <p>{clientData.contact.phone}</p>}
              </div>
            </div>

            <div className="preview-summary">
              <h4>Resumen Financiero</h4>
              <div className="summary-grid seven-cols">
                <div className="summary-card">
                  <span className="summary-label">Capital Invertido</span>
                  <span className="summary-value">{formatCurrency(clientData.incrementos)}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Capital Retirado</span>
                  <span className="summary-value">{formatCurrency(clientData.decrementos)}</span>
                </div>
                <div className="summary-card highlight">
                  <span className="summary-label">Saldo Actual</span>
                  <span className="summary-value">{formatCurrency(clientData.saldo)}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Beneficio Total</span>
                  <span className={`summary-value ${clientData.beneficioTotal >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(clientData.beneficioTotal)}
                  </span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Rentabilidad Total</span>
                  <span className={`summary-value ${clientData.rentabilidad >= 0 ? 'positive' : 'negative'}`}>
                    {clientData.rentabilidad.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Beneficio Último Mes</span>
                  <span className={`summary-value ${clientData.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(clientData.beneficioUltimoMes)}
                  </span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Rentab. Último Mes</span>
                  <span className={`summary-value ${clientData.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative'}`}>
                    {clientData.rentabilidadUltimoMes.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-card" title="Rentabilidad tiempo-pesada: elimina el efecto de aportes/retiros">
                  <span className="summary-label">Rentabilidad TWR</span>
                  <span className={`summary-value ${clientData.twrYtd >= 0 ? 'positive' : 'negative'}`}>
                    {(clientData.twrYtd * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {clientData.monthlyStats.length > 0 && (
              <div className="preview-monthly">
                <h4>Rendimiento Mensual (%) {YEAR}</h4>
                <div className="chart-container">
                  {(() => {
                    const hasNegative = clientData.monthlyStats.some((m) => m.hasData && m.profitPct < 0);
                    const maxPct = Math.max(...clientData.monthlyStats.map((s) => Math.abs(s.profitPct)), 1);
                    return (
                      <div className={`bar-chart ${hasNegative ? 'with-negative' : 'positive-only'}`}>
                        {clientData.monthlyStats.map((m) => {
                          // Limitar altura para que no invada título/labels
                          const heightPct = m.hasData ? Math.min(90, (Math.abs(m.profitPct) / maxPct) * 100) : 4;
                          return (
                            <div key={m.month} className="bar-wrapper">
                              <span className="bar-value">{m.hasData ? `${m.profitPct.toFixed(1)}%` : '-'}</span>
                              <div className="bar-container">
                                <div
                                  className={`bar ${m.hasData ? (m.profitPct >= 0 ? 'positive' : 'negative') : ''}`}
                                  style={{ height: `${heightPct}%` }}
                                />
                              </div>
                              <span className="bar-label">{m.month}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
                    {clientData.monthlyStats.map((m) => (
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

            {clientData.patrimonioEvolution.length > 0 && (
              <div className="preview-patrimonio">
                <h4>Evolución del Patrimonio {YEAR}</h4>
                <div className="line-chart-container">
                  <svg className="line-chart" viewBox="0 0 500 220" preserveAspectRatio="xMidYMid meet">
                    {(() => {
                      const data = clientData.patrimonioEvolution;
                      const valid = data.filter((d) => d.balance !== undefined);
                      if (valid.length === 0) return null;
                      const maxBal = Math.max(...valid.map((d) => d.balance as number), 1);
                      const minBal = Math.min(...valid.map((d) => d.balance as number), 0);
                      const range = maxBal - minBal || 1;
                      
                      // Calcular puntos solo para meses con datos, pero posicionados en su lugar correcto (12 meses)
                      const validWithIndex = data.map((d, i) => ({ ...d, idx: i })).filter((d) => d.balance !== undefined);
                      const points = validWithIndex.map((d) => ({
                        x: 35 + (d.idx / 11) * 420,
                        y: 160 - (((d.balance as number) - minBal) / range) * 120,
                        balance: d.balance as number,
                        month: d.month
                      }));
                      
                      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      const areaD = points.length > 1 ? `${pathD} L ${points[points.length - 1].x} 200 L ${points[0].x} 200 Z` : '';
                      
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
                          {data.map((d, i) => (
                            <text key={i} x={35 + (i / 11) * 420} y="200" textAnchor="middle" fontSize="10" fill="#64748b">
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

            {clientData.movements.length > 0 && (
              <div className="preview-movements">
                <h4>Historial de Movimientos</h4>
                <table className="movements-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="text-right">Importe</th>
                      <th className="text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientData.movements.map((mov, i) => (
                      <tr key={`${mov.iso}-${i}`}>
                        <td>{formatDate(mov.iso)}</td>
                        <td className={mov.type === 'increment' ? 'positive' : 'negative'}>
                          {mov.type === 'increment' ? 'Aportación' : 'Retirada'}
                        </td>
                        <td className={`text-right ${mov.type === 'increment' ? 'positive' : 'negative'}`}>
                          {mov.type === 'increment' ? '+' : '-'}{formatCurrency(mov.amount)}
                        </td>
                        <td className="text-right">{formatCurrency(mov.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="preview-footer">
              <p>Este informe es confidencial y está destinado únicamente al cliente indicado.</p>
              <p>Generado el {new Date().toLocaleString('es-ES')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
