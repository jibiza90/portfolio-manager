import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReportView } from '../../src/components/ReportView';
import type { ReportData } from '../../src/services/reportLinks';

const chartMonths = [
  { month: 'Mar 2025', balance: 49200, profit: 1200, profitPct: 2.5 },
  { month: 'Abr 2025', balance: 50000, profit: 800, profitPct: 1.63 },
  { month: 'May 2025', balance: 51000, profit: 1000, profitPct: 2 },
  { month: 'Jun 2025', balance: 52000, profit: 1000, profitPct: 1.96 },
  { month: 'Jul 2025', balance: 53000, profit: 1000, profitPct: 1.92 },
  { month: 'Ago 2025', balance: 54000, profit: 1000, profitPct: 1.89 },
  { month: 'Sep 2025', balance: 55000, profit: 1000, profitPct: 1.85 },
  { month: 'Oct 2025', balance: 56000, profit: 1000, profitPct: 1.82 },
  { month: 'Nov 2025', balance: 57000, profit: 1000, profitPct: 1.79 },
  { month: 'Dic 2025', balance: 57459.99, profit: 1532.42, profitPct: 2.74 },
  { month: 'Ene 2026', balance: 60166.36, profit: 2706.37, profitPct: 4.71 },
  { month: 'Feb 2026', balance: 57875.03, profit: 2708.67, profitPct: 4.91 },
  { month: 'Mar 2026', balance: 112548.34, profit: 4673.31, profitPct: 4.33 }
];

const buildReportData = (monthCount: number): ReportData => {
  const visibleMonths = chartMonths.slice(-Math.max(1, Math.min(monthCount, chartMonths.length)));
  return {
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
  monthlyStats: visibleMonths.map((item) => ({
    month: item.month,
    profit: item.profit,
    profitPct: item.profitPct,
    endBalance: item.balance,
    hasData: true
  })),
  patrimonioEvolution: visibleMonths.map((item) => ({
    month: item.month,
    balance: item.balance,
    hasData: true
  })),
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
};

export const mountReportView = (monthCount = 12, clientId = 'client-001') => {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element');
  root.innerHTML = '';
  root.className = 'client-portal-page';
  const reportData = buildReportData(monthCount);
  createRoot(root).render(
    <ReportView
      reportData={{ ...reportData, clientId }}
      pendingCashMovements={[{ iso: '2026-04-10', type: 'increment', amount: 15000 }]}
    />
  );
};

export const mountContinuumStressReport = () => {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element');
  const monthlyStats = Array.from({ length: 48 }, (_, index) => {
    const date = new Date(2023, index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const profitPct = index % 9 === 4 ? -2.65 : 1.8 + (index % 6) * 0.57;
    const profit = (index % 9 === 4 ? -1 : 1) * (18_000 + index * 950);
    return {
      month: key,
      profit,
      profitPct,
      endBalance: 1_050_000 + index * 27_500 + profit,
      hasData: true
    };
  });
  const latest = monthlyStats[monthlyStats.length - 1];
  const report: ReportData = {
    clientId: 'client-001',
    clientName: 'Cliente Demo',
    clientCode: 'demo1',
    incrementos: 1_750_000,
    decrementos: 200_000,
    saldo: latest.endBalance,
    beneficioTotal: latest.endBalance - 1_550_000,
    rentabilidad: 38.42,
    beneficioUltimoMes: latest.profit,
    rentabilidadUltimoMes: latest.profitPct,
    twrYtd: 0.2147,
    monthlyStats,
    patrimonioEvolution: monthlyStats.map((month) => ({ month: month.month, balance: month.endBalance, hasData: true })),
    movements: [
      { iso: '2023-01-05', type: 'increment', amount: 1_000_000, balance: 1_000_000 },
      { iso: '2024-06-14', type: 'increment', amount: 500_000, balance: 1_862_000 },
      { iso: '2025-09-09', type: 'decrement', amount: 200_000, balance: 1_774_000 },
      { iso: '2026-12-03', type: 'increment', amount: 250_000, balance: latest.endBalance }
    ],
    contributionBreakdowns: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000
  };
  root.innerHTML = '';
  root.className = 'client-portal-page';
  createRoot(root).render(<ReportView reportData={report} />);
};
