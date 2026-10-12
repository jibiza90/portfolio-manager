import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the Kimi 2.7 wealth mosaic for Demo1 with sortable monthly pieces', async ({ page }) => {
  await mountDemoReport(page);

  const pageEightButton = page.getByRole('button', { name: 'Página 8' });
  await expect(pageEightButton).toBeVisible();
  await pageEightButton.click();

  await expect(pageEightButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /Cada mes es una pieza/ })).toBeVisible();
  await expect(page.locator('.mosaic-balance-card')).toContainText('127.548,34');
  await expect(page.locator('.mosaic-summary')).toContainText('+22.548,34');
  await expect(page.locator('.mosaic-summary')).toContainText('+18,34 %');
  await expect(page.locator('button.mosaic-card')).toHaveCount(13);
  await expect(page.locator('.mosaic-card.is-featured')).toContainText('Marzo 2026');
  await expect(page.locator('.mosaic-card.is-pending')).toContainText('Abril 2026');
  await expect(page.locator('.mosaic-period-lens')).toContainText('Mar 25 — Mar 26');
  await expect(page.locator('.mosaic-period-lens')).toContainText('TWR enlazado');
  await expect(page.locator('.mosaic-period-lens')).toContainText('+39,84 %');
  await expect(page.locator('.mosaic-detail-heading')).toContainText('Marzo 2026');
  await expect(page.locator('.mosaic-ledger')).toContainText('Cierre reconciliado');
  await expect(page.locator('.mosaic-movements')).toContainText('Aportación incorporada');
  await expect(page.locator('.mosaic-highlights')).not.toContainText('Menor rentabilidad');

  await page.getByRole('button', { name: 'Ver mes anterior' }).click();
  await expect(page.locator('.mosaic-detail-heading')).toContainText('Febrero 2026');
  await page.getByRole('button', { name: 'Ver mes siguiente' }).click();
  await expect(page.locator('.mosaic-detail-heading')).toContainText('Marzo 2026');

  await page.getByRole('button', { name: /Enero 2026, rentabilidad/ }).click();
  await expect(page.locator('.mosaic-detail-heading')).toContainText('Enero 2026');

  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.locator('button.mosaic-card').first()).toContainText('Febrero 2026');

  await page.locator('.mosaic-year-filter select').selectOption('2025');
  await expect(page.locator('button.mosaic-card')).toHaveCount(10);
  await expect(page.locator('.mosaic-card.is-pending')).toHaveCount(0);
  await expect(page.locator('.mosaic-period-lens')).toContainText('Mar 25 — Dic 25');
  await expect(page.locator('.mosaic-highlights')).not.toContainText('Febrero 2026');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 7' }).click();
  await expect(page.getByRole('heading', { name: 'Mira cómo tu capital ha fluido mes a mes.' })).toBeVisible();
});
