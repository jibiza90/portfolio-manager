import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GROK 4.7 MERIDIANO as a precise five-band portfolio chart', async ({ page }) => {
  await mountDemoReport(page);

  const pageSixteenButton = page.locator('[aria-label="Página 16"]');
  await expect(pageSixteenButton).toContainText('GROK 4.7');
  await pageSixteenButton.click();

  await expect(pageSixteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Meridiano' })).toBeVisible();
  await expect(page.locator('.meridian-main-balance')).toContainText('127.548,34');
  await expect(page.locator('.meridian-identity')).toContainText('+4673,31');
  await expect(page.locator('.meridian-identity')).toContainText('+4,33 %');
  await expect(page.locator('.meridian-identity')).toContainText('+22.548,34');
  await expect(page.locator('.meridian-pending')).toContainText('+15.000,00');

  const mainChart = page.locator('.meridian-chart-section');
  await expect(mainChart.locator('.meridian-band')).toHaveCount(5);
  await expect(mainChart.locator('.meridian-balance-point')).toHaveCount(13);
  await expect(mainChart.locator('.meridian-month-column')).toHaveCount(13);
  await expect(page.locator('.meridian-month-panel')).toContainText('Marzo 2026');
  await expect(page.locator('.meridian-month-panel')).toContainText('112.548,34');

  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.locator('.meridian-breakdown')).toContainText('Posición inicial');
  await expect(page.locator('.meridian-breakdown')).toContainText('Conciliado');

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(mainChart.locator('.meridian-month-column')).toHaveCount(6);

  await mainChart.locator('.meridian-month-column').last().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.meridian-month-panel')).toContainText('Febrero 2026');

  await page.getByRole('button', { name: 'Ver todos los meses' }).click();
  await expect(page.locator('.meridian-index-row')).toHaveCount(6);

  await page.getByRole('button', { name: 'Ampliar' }).click();
  await expect(page.locator('.meridian-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.meridian-dialog')).not.toBeVisible();

  await expect(page.locator('.meridian-seal')).toContainText('105.000,00');
  await expect(page.locator('.meridian-seal')).toContainText('127.548,34');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
