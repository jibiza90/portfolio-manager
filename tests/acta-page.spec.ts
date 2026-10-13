import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GROK 4.7 ACTA as a reconciled monthly record', async ({ page }) => {
  await mountDemoReport(page);

  const pageSeventeenButton = page.locator('[aria-label="Página 17"]');
  await expect(pageSeventeenButton).toContainText('GROK 4.7');
  await pageSeventeenButton.click();

  await expect(pageSeventeenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Acta', exact: true })).toBeVisible();
  await expect(page.locator('.acta-report')).toContainText('127.548,34');
  await expect(page.locator('.acta-equation')).toContainText('115.000,00');
  await expect(page.locator('.acta-equation')).toContainText('10.000,00');
  await expect(page.locator('.acta-equation')).toContainText('+22.548,34');
  await expect(page.locator('.acta-pending')).toContainText('+15.000,00');

  await expect(page.locator('.acta-entry')).toHaveCount(13);
  await expect(page.locator('.acta-chart circle')).toHaveCount(13);
  await expect(page.locator('.acta-entry.is-focused')).toContainText('Marzo 2026');

  const latestEntry = page.locator('.acta-entry-toggle').last();
  await latestEntry.click();
  await expect(page.locator('.acta-entry-detail')).toContainText('Posición inicial');
  await expect(page.locator('.acta-entry-detail')).toContainText('Conciliado');
  await expect(page.locator('.acta-entry-detail')).toContainText('Retirada');

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.acta-entry')).toHaveCount(6);

  await page.locator('.acta-entry-toggle').last().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.acta-entry.is-focused')).toContainText('Febrero 2026');
  await page.keyboard.press('Escape');
  await expect(page.locator('.acta-entry-detail')).toHaveCount(0);

  await expect(page.locator('.acta-movements')).toContainText('Posterior al último cierre');
  await expect(page.locator('.acta-colophon')).toContainText('No modifica los datos publicados');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
