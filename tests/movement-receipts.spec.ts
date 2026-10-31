import { expect, test, type Page } from '@playwright/test';
import { buildMovementReceipt, receiptNumber } from '../src/utils/movementReceipts';

// Ejemplo del boceto: aporta 50.000, retira 47.000 en dos veces y luego 6.000 (3.000 pagan comision).
const movements = [
  { iso: '2025-01-10', type: 'increment' as const, amount: 50000 },
  { iso: '2025-06-20', type: 'decrement' as const, amount: 30000 },
  { iso: '2026-02-15', type: 'decrement' as const, amount: 17000 },
  { iso: '2026-10-15', type: 'decrement' as const, amount: 6000 }
];
const paid = { rate: 0.05, paidWithdrawalIsos: ['2026-10-15'] };

test('withdrawal receipt charges commission only on the part above the contributed capital', () => {
  const receipt = buildMovementReceipt('client-001', movements, movements[3], paid);
  expect(receipt.commission).toEqual({ rate: 0.05, capitalPendingBefore: 3000, commissionableAmount: 3000, paid: true, amount: 150 });
  expect(receipt.net).toBe(5850);
  expect(receipt.contributedAfter).toBe(50000);
  expect(receipt.withdrawnAfter).toBe(53000);
  expect(receipt.capitalPendingAfter).toBe(0);
});

test('withdrawal before recovering the capital has no commission', () => {
  const receipt = buildMovementReceipt('client-001', movements, movements[1], paid);
  expect(receipt.commission?.amount).toBe(0);
  expect(receipt.commission?.commissionableAmount).toBe(0);
  expect(receipt.net).toBe(30000);
  expect(receipt.capitalPendingAfter).toBe(20000);
});

test('commission not marked as paid is not deducted, and missing data shows no commission', () => {
  expect(buildMovementReceipt('client-001', movements, movements[3], { rate: 0.05, paidWithdrawalIsos: [] }).net).toBe(6000);
  const noData = buildMovementReceipt('client-001', movements, movements[3], null);
  expect(noData.commission).toBeNull();
  expect(noData.net).toBe(6000);
});

test('contribution receipt has no commission and counts the account totals up to that day', () => {
  const receipt = buildMovementReceipt('client-001', movements, movements[0], paid);
  expect(receipt.commission).toBeNull();
  expect(receipt.contributedAfter).toBe(50000);
  expect(receipt.withdrawnAfter).toBe(0);
});

test('receipt numbers look random, have 8 digits and never change for the same movement', () => {
  const first = receiptNumber('client-001', '2026-10-15', 'decrement');
  expect(first).toMatch(/^JO-2026-[1-9]\d{7}$/);
  expect(receiptNumber('client-001', '2026-10-15', 'decrement')).toBe(first);
  expect(receiptNumber('client-001', '2026-10-15', 'increment')).not.toBe(first);
  expect(receiptNumber('client-002', '2026-10-15', 'decrement')).not.toBe(first);
});

const mountDialog = async (page: Page, index: number) => {
  await page.goto('/');
  await page.evaluate(async ({ list, target }) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { MovementReceiptDialog } = await import('/src/components/MovementReceipt.tsx' as string);
    const root = document.getElementById('root')!;
    root.innerHTML = '';
    createRoot(root).render(React.createElement(MovementReceiptDialog, {
      clientId: 'client-001', holderName: 'Cliente Demo', clientCode: 'demo1', movements: list, movement: list[target], onClose: () => undefined
    }));
  }, { list: movements, target: index });
};

test('receipt dialog previews both formats and downloads the chosen one', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Dialog is checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await mountDialog(page, 0);
  await expect(page.locator('.mr-extended')).toHaveCount(1);
  await expect(page.locator('.mr-compact')).toHaveCount(1);
  await expect(page.locator('.mr-compact .mr-big')).toContainText('Aportación');
  await expect(page.locator('.mr-compact')).toContainText('50.000,00 €');
  await expect(page.getByRole('button', { name: 'Resumido', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Las dos hojas caben enteras: nada se sale por abajo.
  const overflow = await page.locator('.mr-page').evaluateAll((pages) => pages.map((node) => node.scrollHeight > node.clientHeight + 1));
  expect(overflow).toEqual([false, false]);

  const compactDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar resumido' }).click();
  expect((await compactDownload).suggestedFilename()).toBe('justificante-aportacion-2025-01-10-demo1-resumido.pdf');

  await page.getByRole('button', { name: 'Extendido', exact: true }).click();
  const extendedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar extendido' }).click();
  expect((await extendedDownload).suggestedFilename()).toBe('justificante-aportacion-2025-01-10-demo1.pdf');
});

test('withdrawal receipt without commission data does not state a delivered total', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Dialog is checked once on a representative viewport.');
  await page.setViewportSize({ width: 1300, height: 1000 });
  // En las pruebas no hay sesion de Firebase, asi que no llegan datos de comisiones.
  await mountDialog(page, 3);
  await expect(page.locator('.mr-compact .mr-total')).toHaveText(['Importe retirado6.000,00 €']);
  await expect(page.locator('.mr-page')).not.toContainText(['Total entregado', 'Total entregado']);
});

const mountReport = async (page: Page, clientId: string) => {
  await page.goto('/');
  await page.evaluate(async ({ modulePath, requestedClientId }) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13, requestedClientId);
  }, { modulePath: '/tests/fixtures/report-view-harness.tsx', requestedClientId: clientId });
};

test('every client has receipt buttons in the movement history', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await mountReport(page, 'client-001');
  const buttons = page.getByRole('button', { name: /Descargar justificante/ });
  await expect(buttons.first()).toBeVisible();
  await buttons.first().click();
  await expect(page.getByRole('dialog', { name: 'Justificante de operación' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Justificante de operación' })).toHaveCount(0);

  await mountReport(page, 'client-004');
  await expect(page.locator('.movements-table').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Descargar justificante/ }).first()).toBeVisible();
  await expect(page.locator('.movements-table th', { hasText: 'Justificante' })).toHaveCount(1);
});
