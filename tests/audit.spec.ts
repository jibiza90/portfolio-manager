import { expect, test, type Page } from '@playwright/test';
import {
  buildCommissionLedger,
  buildExceptions,
  buildMovementLedger,
  buildReconciliation,
  buildRollForward,
  explainRollForwardDifference,
  isBalanced,
  toCsv
} from '../src/utils/auditData';
import { buildFundKpis } from '../src/utils/fundKpis';
import { buildSnapshot } from '../src/utils/snapshot';
import type { MonthlyHistoryEntry, Movement } from '../src/types';

// Clientes inventados (nunca datos reales). client-052 tiene saldo sin aportacion apuntada.
const movements: Record<string, Record<string, Movement>> = {
  'client-050': { '2026-01-10': { increment: 10_000 }, '2026-03-15': { decrement: 12_000 } },
  'client-051': { '2026-02-03': { increment: 20_000, incrementReturnPct: 0.01 } }
};
const history: Record<string, Record<string, MonthlyHistoryEntry>> = {
  'client-050': { '2026-01': { returnPct: 0.1 }, '2026-02': { returnPct: 0.1 }, '2026-03': { returnPct: 0.1 } },
  'client-051': { '2026-02': { returnPct: 0.1 }, '2026-03': { returnPct: 0.1 } },
  'client-052': { '2026-03': { returnPct: 0.1, finalBalance: 5_500 } }
};
const clientIds = ['client-050', 'client-051', 'client-052'];
const snapshot = buildSnapshot({}, movements, history);
const kpis = buildFundKpis({
  clientIds, snapshot, movementsByClient: movements, monthlyHistoryByClient: history,
  commissionRates: {}, paidWithdrawals: {}, recurring: { rules: [], checks: {} }, todayIso: '2026-04-10'
});

test('reconciliation ties client balances to the portfolio', () => {
  const rows = buildReconciliation(snapshot, clientIds, ['2026-01', '2026-02', '2026-03']);
  expect(rows.every((row) => isBalanced(row.difference))).toBe(true);
  expect(rows.map((row) => row.activeClients)).toEqual([1, 2, 3]);
});

test('roll forward shows the difference and which client explains it', () => {
  const { monthly, yearly } = buildRollForward(kpis.months);
  const march = monthly.find((row) => row.period === '2026-03')!;
  expect(isBalanced(march.difference)).toBe(false);
  expect(monthly.filter((row) => row.period !== '2026-03').every((row) => isBalanced(row.difference))).toBe(true);
  expect(yearly[0].period).toBe('2026');
  expect(yearly[0].difference).toBeCloseTo(march.difference, 6);
  const causes = explainRollForwardDifference(snapshot, clientIds, '2026-03');
  expect(causes.map((item) => item.clientId)).toEqual(['client-052']);
  expect(causes[0].difference).toBeCloseTo(march.difference, 2);
});

test('ledgers, exceptions and the CSV format for Excel', () => {
  expect(buildMovementLedger(movements, clientIds).map((row) => `${row.iso} ${row.clientId} ${row.type} ${row.amount}`)).toEqual([
    '2026-01-10 client-050 Aportación 10000',
    '2026-02-03 client-051 Aportación 20000',
    '2026-03-15 client-050 Retirada 12000'
  ]);
  // 12.000 retirados con 10.000 aportados: 2.000 de base, 8 % = 160 €.
  const commissions = buildCommissionLedger(movements, clientIds, {}, { 'client-050-2026-03-15': true });
  expect(commissions).toEqual([expect.objectContaining({ clientId: 'client-050', base: 2_000, rate: 0.08, commission: 160, paid: true })]);
  const exceptions = buildExceptions(movements, ['client-050', 'client-051'], clientIds, { 'client-050': { email: 'a@b.c', phone: '' } });
  expect(exceptions.ownReturns).toEqual([{ clientId: 'client-051', iso: '2026-02-03', type: 'Aportación', pct: 0.01 }]);
  expect(exceptions.missingContact).toEqual([{ clientId: 'client-050', missing: ['teléfono'] }, { clientId: 'client-051', missing: ['email', 'teléfono'] }]);
  expect(toCsv(['Cliente', 'Importe (€)'], [['Ana; Prueba', 1234.5], ['Bruno', undefined]])).toBe('﻿Cliente;Importe (€)\r\n"Ana; Prueba";1234,5\r\nBruno;\r\n');
});

const mountAudit = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(async ({ movementsData, historyData }) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { AdminAuditView } = await import('/src/components/AdminAudit.tsx' as string);
    const { buildSnapshot: build } = await import('/src/utils/snapshot.ts' as string);
    createRoot(document.getElementById('root')!).render(React.createElement(AdminAuditView, {
      clients: [{ id: 'client-050', label: 'Ana Prueba' }, { id: 'client-051', label: 'Bruno Prueba' }, { id: 'client-052', label: 'Carla Prueba' }],
      snapshot: build({}, movementsData, historyData),
      movementsByClient: movementsData,
      monthlyHistoryByClient: historyData,
      contacts: {},
      todayIso: '2026-04-10'
    }));
  }, { movementsData: movements, historyData: history });
};

test('audit tab: status lines, explanation and Excel downloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 1300, height: 1000 });
  await mountAudit(page);
  await expect(page.getByRole('region', { name: 'Cuadre' })).toContainText('✓ La suma de los saldos de los clientes coincide con el patrimonio de la cartera');
  const roll = page.getByRole('region', { name: 'Movimiento del patrimonio' });
  await expect(roll).toContainText('Hay diferencia en 1 mes: marzo 2026');
  await expect(roll).toContainText('Explicado por: Carla Prueba');
  await expect(page.getByRole('region', { name: 'Excepciones' })).toContainText('Clientes activos con email guardado0 de 3');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Libro de movimientos/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('libro-movimientos-2026-04-10.csv');
  const content = await (await import('fs')).promises.readFile((await download.path())!, 'utf8');
  expect(content).toContain('15/03/2026;Ana Prueba;Retirada;12000');

  const balancesPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar saldos' }).click();
  expect((await balancesPromise).suggestedFilename()).toBe('saldos-clientes-2026-03.csv');
});

test('audit tab fits on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 375, height: 800 });
  await mountAudit(page);
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
