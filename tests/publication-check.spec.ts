import { expect, test, type Page } from '@playwright/test';
import { buildPublicationCheck } from '../src/utils/publicationCheck';
import { buildSnapshot } from '../src/utils/snapshot';
import type { MonthlyHistoryEntry, Movement } from '../src/types';

const contribution = { '2026-08-03': { increment: 10_000 } };
const movements: Record<string, Record<string, Movement>> = {
  'client-030': contribution,
  'client-031': contribution,
  'client-032': contribution,
  'client-033': { '2026-10-08': { increment: 30_000, incrementReturnPct: 0.0442 } },
  'client-034': contribution,
  'client-035': contribution,
  'client-036': contribution
};
const months = (sep: number | undefined, oct: number | undefined): Record<string, MonthlyHistoryEntry> => ({
  '2026-08': { returnPct: 0.03 },
  ...(sep !== undefined ? { '2026-09': { returnPct: sep } } : {}),
  ...(oct !== undefined ? { '2026-10': { returnPct: oct } } : {})
});
const history: Record<string, Record<string, MonthlyHistoryEntry>> = {
  'client-030': months(0.05, 0.05),
  'client-031': months(0.05, 0.02), // distinta a la general este mes
  'client-032': months(0.05, undefined), // falta octubre
  'client-033': { '2026-10': { returnPct: 0.05 } }, // empieza en octubre con rentabilidad propia
  'client-034': months(0.05, 0.05), // septiembre publicado con otro valor
  'client-035': months(0.07, 0.07), // siempre lleva otra rentabilidad
  'client-036': months(0.05, 0.5) // excluido
};

const run = () => buildPublicationCheck({
  clientIds: Object.keys(movements),
  snapshot: buildSnapshot({}, movements, history),
  monthlyHistoryByClient: history,
  movementsByClient: movements,
  published: { 'client-034': { saldo: 1, monthlyStats: [{ month: 'Sep 2026', profitPct: 4, profit: 400, hasData: true }] } },
  excluded: new Set(['client-036'])
});

test('publication check only reports what is wrong or new', () => {
  const check = run();
  expect(check.month).toBe('2026-10');
  expect(check.generalReturn).toBeCloseTo(0.05, 10);
  expect(check.checkedClients).toBe(6);
  const byClient = check.issues.map((issue) => `${issue.clientId} ${issue.severity} ${issue.text}`);
  expect(byClient).toEqual([
    'client-031 warning Rentabilidad de octubre 2026: 2,00 % (la general es 5,00 %).',
    'client-032 error Falta la rentabilidad de octubre 2026.',
    'client-033 info Empieza en octubre 2026 con rentabilidad propia: 4,42 %.',
    'client-034 warning Cambian meses que ya estaban publicados: Sep 2026: 4,00 % → 5,00 %.'
  ]);
  expect(check.rows.find((row) => row.clientId === 'client-034')?.saldoBefore).toBe(1);
});

const mountDialog = async (page: Page, kind: 'problems' | 'ok') => {
  await page.goto('/');
  await page.evaluate(async (mode) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { PublicationCheckDialog } = await import('/src/components/PublicationCheckDialog.tsx' as string);
    const names: Record<string, string> = { 'client-031': 'Bruno Prueba', 'client-032': 'Carla Prueba', 'client-033': 'Dani Prueba' };
    const check = {
      month: '2026-10',
      generalReturn: 0.05,
      checkedClients: 3,
      issues: mode === 'ok'
        ? [{ clientId: 'client-033', severity: 'info', text: 'Empieza en octubre 2026 con rentabilidad propia: 4,42 %.' }]
        : [
          { clientId: 'client-031', severity: 'warning', text: 'Rentabilidad de octubre 2026: 2,00 % (la general es 5,00 %).' },
          { clientId: 'client-032', severity: 'error', text: 'Falta la rentabilidad de octubre 2026.' }
        ],
      rows: [
        { clientId: 'client-031', saldoBefore: 10_000, saldoAfter: 10_200, monthPct: 2, monthProfit: 200 },
        { clientId: 'client-032', saldoAfter: 10_500 },
        { clientId: 'client-033', saldoAfter: 31_326, monthPct: 4.42, monthProfit: 1326 }
      ]
    };
    (window as unknown as { confirmed: number }).confirmed = 0;
    createRoot(document.getElementById('root')!).render(React.createElement(PublicationCheckDialog, {
      check,
      error: null,
      busy: false,
      nameOf: (id: string) => names[id] ?? id,
      onConfirm: () => { (window as unknown as { confirmed: number }).confirmed += 1; },
      onCancel: () => {}
    }));
  }, kind);
};

test('publication check dialog shows problems first and asks to publish anyway', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 1300, height: 900 });
  await mountDialog(page, 'problems');
  const dialog = page.getByRole('dialog', { name: 'Comprobación antes de publicar' });
  await expect(dialog).toContainText('3 clientes revisados · octubre 2026: 2 avisos.');
  await expect(dialog.locator('.pc-item').first()).toContainText('Carla Prueba · Falta la rentabilidad de octubre 2026.');
  await expect(dialog.locator('.pc-table')).toBeHidden();
  await dialog.getByText('Ver resumen de todos los clientes').click();
  await expect(dialog.locator('.pc-table tbody tr')).toHaveCount(3);
  await expect(dialog.locator('.pc-table tbody tr', { hasText: 'Dani Prueba' })).toContainText('31.326,00 €');
  await dialog.getByRole('button', { name: 'Publicar igualmente' }).click();
  expect(await page.evaluate(() => (window as unknown as { confirmed: number }).confirmed)).toBe(1);
});

test('publication check dialog says all is fine when there is nothing wrong, also on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 375, height: 760 });
  await mountDialog(page, 'ok');
  const dialog = page.getByRole('dialog', { name: 'Comprobación antes de publicar' });
  await expect(dialog).toContainText('✓ Todo correcto en 3 clientes · octubre 2026.');
  await expect(dialog).toContainText('Dani Prueba · Empieza en octubre 2026 con rentabilidad propia');
  await expect(dialog.getByRole('button', { name: 'Publicar', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
