import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReportView } from '../../src/components/ReportView';
import type { ReportData } from '../../src/services/reportLinks';

const reportData: ReportData = {
  clientId: 'client-001',
  clientName: 'Cliente Demo',
  clientCode: 'demo1',
  incrementos: 100000,
  decrementos: 10000,
  saldo: 112548.34,
  beneficioTotal: 22548.34,
  rentabilidad: 22.55,
  beneficioUltimoMes: 4673.31,
  rentabilidadUltimoMes: 4.33,
  twrYtd: 0.1834,
  monthlyStats: [
    { month: 'Dic 2025', profit: 1532.42, profitPct: 2.74, endBalance: 57459.99, hasData: true },
    { month: 'Ene 2026', profit: 2706.37, profitPct: 4.71, endBalance: 60166.36, hasData: true },
    { month: 'Feb 2026', profit: 2708.67, profitPct: 4.91, endBalance: 57875.03, hasData: true },
    { month: 'Mar 2026', profit: 4673.31, profitPct: 4.33, endBalance: 112548.34, hasData: true }
  ],
  patrimonioEvolution: [
    { month: 'Dic 2025', balance: 57459.99, hasData: true },
    { month: 'Ene 2026', balance: 60166.36, hasData: true },
    { month: 'Feb 2026', balance: 57875.03, hasData: true },
    { month: 'Mar 2026', balance: 112548.34, hasData: true }
  ],
  movements: [
    { iso: '2025-08-01', type: 'increment', amount: 50000, balance: 50000 },
    { iso: '2025-12-15', type: 'decrement', amount: 5000, balance: 55927.58 },
    { iso: '2026-03-06', type: 'increment', amount: 50000, balance: 107875.03 },
    { iso: '2026-03-20', type: 'decrement', amount: 5000, balance: 102875.03 }
  ],
  contributionBreakdowns: [{
    month: 'Mar 2026',
    openingCapital: 57875.03,
    initialCapital: 57875.03,
    initialReturnPct: 0.0455,
    initialProfit: 2633.31,
    contributions: [{ iso: '2026-03-06', amount: 50000, returnPct: 0.0408, profit: 2040 }],
    withdrawals: [{ iso: '2026-03-20', amount: 5000, returnPct: 0.02, profit: 100 }],
    totalProfit: 4673.31
  }],
  createdAt: Date.now(),
  expiresAt: Date.now() + 86400000
};

export const mountReportView = () => {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element');
  root.innerHTML = '';
  root.className = 'client-portal-page';
  createRoot(root).render(
    <ReportView
      reportData={reportData}
      pendingCashMovements={[{ iso: '2026-04-10', type: 'increment', amount: 15000 }]}
    />
  );
};
