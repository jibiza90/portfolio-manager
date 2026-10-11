import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the Kimi 2.7 capital river concept for Demo1 with selectable monthly stations', async ({ page }) => {
  await mountDemoReport(page);

  const pageSevenButton = page.getByRole('button', { name: 'Página 7' });
  await expect(pageSevenButton).toBeVisible();
  await pageSevenButton.click();

  await expect(pageSevenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Mira cómo tu capital ha fluido mes a mes.' })).toBeVisible();
  await expect(page.locator('.river-current-balance')).toContainText('127.548,34');
  await expect(page.locator('.river-kpis')).toContainText('+22.548,34');
  await expect(page.locator('.river-kpis')).toContainText('+18,34 %');
  await expect(page.locator('.river-canvas svg')).toBeVisible();
  await expect(page.locator('.river-month-hit')).toHaveCount(13);
  await expect(page.locator('.river-station-heading')).toContainText('Marzo 2026');
  await expect(page.locator('.river-month-equation')).toContainText('Cierre reconciliado');
  await expect(page.locator('.river-flow-register')).toContainText('Aportación incorporada');
  await expect(page.locator('.river-flow-register')).toContainText('Posición retirada');

  await page.getByRole('button', { name: /Enero 2026\. Saldo/ }).click();
  await expect(page.locator('.river-station-heading')).toContainText('Enero 2026');

  await page.getByRole('button', { name: '6 meses' }).click();
  await expect(page.locator('.river-month-hit')).toHaveCount(6);
  await page.getByRole('button', { name: /Marzo 2026\. Saldo/ }).click();
  await expect(page.locator('.river-station-heading')).toContainText('Marzo 2026');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 6' }).click();
  await expect(page.getByRole('heading', { name: 'Tu inversión, mes a mes.' })).toBeVisible();
});
