import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GLM 5.3MAX PULSO as an interactive patrimonial instrument', async ({ page }) => {
  await mountDemoReport(page);

  const pageFourteenButton = page.locator('[aria-label="Página 14"]');
  await expect(pageFourteenButton).toContainText('GLM 5.3MAX');
  await pageFourteenButton.click();

  await expect(pageFourteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'PULSO' })).toBeVisible();
  await expect(page.locator('.pulse-odometer')).toContainText('127.548,34');
  await expect(page.locator('.pulse-instruments')).toContainText('+22.548,34');
  await expect(page.locator('.pulse-instruments')).toContainText('+18,34 %');
  await expect(page.locator('.pulse-pending')).toContainText('+15.000,00');

  await expect(page.locator('.pulse-spike')).toHaveCount(13);
  await expect(page.locator('.pulse-balance-point')).toHaveCount(13);
  await expect(page.locator('.pulse-flow.is-increment')).toHaveCount(2);
  await expect(page.locator('.pulse-flow.is-decrement')).toHaveCount(2);
  await expect(page.locator('.pulse-tape button')).toHaveCount(13);
  await expect(page.locator('.pulse-receipt')).toContainText('Marzo 2026');
  await expect(page.locator('.pulse-receipt')).toContainText('CONCILIADO');
  await expect(page.locator('.pulse-receipt')).toContainText('APORTACIÓN');
  await expect(page.locator('.pulse-receipt')).toContainText('RETIRADA');

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.pulse-spike')).toHaveCount(6);
  await expect(page.locator('.pulse-tape button')).toHaveCount(6);

  const seismograph = page.locator('.pulse-seismograph svg');
  await seismograph.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.pulse-seismograph > header')).toContainText('Febrero 2026');

  await page.getByRole('button', { name: 'AMPLIAR ⛶' }).click();
  await expect(page.locator('.pulse-barogram-shell')).toHaveClass(/is-fullscreen/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pulse-barogram-shell')).not.toHaveClass(/is-fullscreen/);

  await expect(page.locator('.pulse-control-bank')).toContainText('115.000,00');
  await expect(page.locator('.pulse-control-bank')).toContainText('10.000,00');
  await expect(page.locator('.pulse-footer')).toContainText('GLM 5.3MAX');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
