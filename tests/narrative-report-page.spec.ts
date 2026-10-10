import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the editorial narrative for Demo1 with real report data', async ({ page }) => {
  await mountDemoReport(page);

  const pageFiveButton = page.getByRole('button', { name: 'Página 5' });
  await expect(pageFiveButton).toBeVisible();
  await pageFiveButton.click();

  await expect(pageFiveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'La historia de tu patrimonio, contada con claridad.' })).toBeVisible();
  await expect(page.locator('.pn5-opening-facts')).toContainText('127.548,34');
  await expect(page.locator('.pn5-opening-facts')).toContainText('+22.548,34');
  await expect(page.getByRole('heading', { name: 'El capital que pusiste en movimiento.' })).toBeVisible();
  await expect(page.locator('.pn5-movement-ledger article')).toHaveCount(5);
  await expect(page.locator('.pn5-movement-ledger')).toContainText('Pendiente de cierre');
  await expect(page.getByRole('heading', { name: 'Lo que creció por el camino.' })).toBeVisible();
  await expect(page.locator('.pn5-highlight')).toContainText('Marzo 2026');
  await expect(page.locator('.pn5-highlight')).toContainText('+4673,31');

  const summaryButton = page.getByRole('button', { name: 'Modo resumen' });
  await summaryButton.click();
  await expect(page.getByRole('button', { name: 'Lectura completa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pn5-report')).toHaveClass(/is-summary/);

  await page.locator('.pn5-opening-facts > button').first().click();
  const factDialog = page.getByRole('dialog', { name: 'El valor de la cartera hoy' });
  await expect(factDialog).toBeVisible();
  await expect(factDialog).toContainText('127.548,34');
  await page.getByRole('button', { name: 'Cerrar explicación' }).click();
  await expect(factDialog).toBeHidden();

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 4' }).click();
  await expect(page.getByRole('heading', { name: /Cada euro tiene.*un recorrido/i })).toBeVisible();
  await page.getByRole('button', { name: 'Página 1' }).click();
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
});
