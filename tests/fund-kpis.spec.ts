import { expect, test } from '@playwright/test';
import { buildFundKpis } from '../src/utils/fundKpis';
import { buildSnapshot } from '../src/utils/snapshot';
import type { MonthlyHistoryEntry, Movement } from '../src/types';

// Clientes inventados (nunca datos reales).
const monthsFrom = (from: string, to: string, returnPct: number) => {
  const out: Record<string, MonthlyHistoryEntry> = {};
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  while (`${year}-${String(month).padStart(2, '0')}` <= to) {
    out[`${year}-${String(month).padStart(2, '0')}`] = { returnPct };
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return out;
};
const movements: Record<string, Record<string, Movement>> = {
  'client-030': { '2026-01-10': { increment: 10_000 }, '2026-06-15': { decrement: 2_000 } },
  'client-031': { '2025-11-05': { increment: 50_000 } },
  'client-032': { '2026-11-03': { increment: 5_000 } },
  'client-033': { '2025-06-02': { increment: 1_000 }, '2025-09-01': { decrement: 1_000 } }
};
const history: Record<string, Record<string, MonthlyHistoryEntry>> = {
  'client-030': monthsFrom('2026-01', '2026-10', 0.02),
  'client-031': monthsFrom('2025-11', '2026-10', 0.02)
};
const recurring = {
  rules: [
    { id: 'a', clientId: 'client-031', amount: 500, day: 25, active: true, startMonth: '2026-11', createdAt: 0, updatedAt: 0 },
    { id: 'b', clientId: 'client-030', amount: 300, day: 5, active: true, startMonth: '2026-11', createdAt: 0, updatedAt: 0 }
  ],
  checks: {}
};

const kpis = () => buildFundKpis({
  clientIds: Object.keys(movements),
  snapshot: buildSnapshot({}, movements, history),
  movementsByClient: movements,
  monthlyHistoryByClient: history,
  commissionRates: {},
  paidWithdrawals: {},
  recurring,
  todayIso: '2026-11-18'
});

test('fund KPIs: clients, flows and returns', () => {
  const result = kpis();
  expect(result.activeClients).toBe(3);
  expect(result.averageBalance).toBeCloseTo(result.aum / 3, 6);
  expect(result.newClientsThisYear.map((client) => client.clientId)).toEqual(['client-030', 'client-032']);
  expect(result.newClientsThisMonth).toBe(1);
  expect(result.closedClients.map((client) => client.clientId)).toEqual(['client-033']);
  expect(result.flows.month).toEqual({ contributions: 5_000, withdrawals: 0, net: 5_000 });
  expect(result.flows.year).toEqual({ contributions: 15_000, withdrawals: 2_000, net: 13_000 });
  expect(result.flows.all).toEqual({ contributions: 66_000, withdrawals: 3_000, net: 63_000 });
  expect(result.totalContributed - result.totalWithdrawn).toBe(result.netContributed);

  expect(result.closedMonths).toBe(12);
  expect(result.sinceMonth).toBe('2025-11');
  expect(result.lastClosedMonth?.month).toBe('2026-10');
  expect(result.lastClosedMonth?.returnPct).toBeCloseTo(0.02, 10);
  expect(result.ytdReturn).toBeCloseTo(1.02 ** 10 - 1, 10);
  expect(result.last12Return).toBeCloseTo(1.02 ** 12 - 1, 10);
  expect(result.annualizedReturn).toBeCloseTo(1.02 ** 12 - 1, 10);
  expect(result.positiveMonths).toBe(12);
  // El mes en curso no tiene rentabilidad todavia.
  expect(result.months.find((month) => month.month === '2026-11')?.returnPct).toBeUndefined();
});

test('fund KPIs: concentration, liquidity and commissions', () => {
  const result = kpis();
  expect(result.top.map((client) => client.clientId)[0]).toBe('client-031');
  expect(result.top3Share).toBeCloseTo(1, 10);
  expect(result.top.reduce((sum, client) => sum + client.share, 0)).toBeCloseTo(1, 10);
  // Proximos 30 dias: 25/11 y la del 5/12 (sabado -> lunes 7); la del 25/12 queda fuera. La del 5/11 sin apuntar esta atrasada.
  expect(result.upcomingWithdrawals).toEqual([
    { clientId: 'client-031', amount: 500, iso: '2026-11-25' },
    { clientId: 'client-030', amount: 300, iso: '2026-12-07' }
  ]);
  expect(result.upcomingTotal).toBe(800);
  expect(result.overdueWithdrawals).toBe(1);
  expect(result.overdueTotal).toBe(300);
  // Retirada de capital (no supera lo aportado): sin comision.
  expect(result.commissionsGenerated).toBe(0);
  expect(result.commissionsPending).toBe(0);
});

const mountKpis = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async ({ movementsData, historyData, recurringData }) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { AdminKpisView } = await import('/src/components/AdminKpis.tsx' as string);
    const { buildSnapshot } = await import('/src/utils/snapshot.ts' as string);
    const clients = [
      { id: 'client-030', label: 'Ana Prueba' },
      { id: 'client-031', label: 'Bruno Prueba' },
      { id: 'client-032', label: 'Carla Prueba' },
      { id: 'client-033', label: 'Dani Prueba' }
    ];
    createRoot(document.getElementById('root')!).render(React.createElement(AdminKpisView, {
      clients,
      snapshot: buildSnapshot({}, movementsData, historyData),
      movementsByClient: movementsData,
      monthlyHistoryByClient: historyData,
      recurring: recurringData,
      todayIso: '2026-11-18'
    }));
  }, { movementsData: movements, historyData: history, recurringData: recurring });
};

test('KPIs tab shows the fund figures by section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 1300, height: 1000 });
  await mountKpis(page);
  const section = (name: string) => page.getByRole('region', { name });
  await expect(section('Ahora')).toContainText('Clientes activos3');
  await expect(section('Rentabilidad del fondo')).toContainText('Último mes · octubre 2026+2,00 %');
  await expect(section('Rentabilidad del fondo')).toContainText('Meses positivos12 de 12');
  await expect(section('Captación')).toContainText('Ingresos 15.000,00 € · retiradas 2.000,00 €');
  await expect(section('Clientes')).toContainText('Carla Prueba03/11/2026');
  await expect(section('Clientes')).toContainText('Dani Prueba01/09/2025');
  await expect(section('Liquidez prevista')).toContainText('800,00 €');
  await expect(section('Liquidez prevista')).toContainText('25/11/2026 · Bruno Prueba');
  const months = section('Mes a mes');
  await expect(months.getByRole('button', { name: '2026' })).toHaveAttribute('aria-pressed', 'true');
  await expect(months.locator('tbody tr', { hasText: 'noviembre 2026' })).toContainText('En curso');
  await months.getByRole('button', { name: '2025' }).click();
  await expect(months.locator('tbody tr', { hasText: 'junio 2025' })).toContainText('1.000,00 €');
});

test('KPIs tab fits on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 375, height: 800 });
  await mountKpis(page);
  await expect(page.getByRole('heading', { name: 'KPIs del fondo' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
