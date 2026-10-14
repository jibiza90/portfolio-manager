import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the definitive CODEX Singular report with traceable real data', async ({ page }) => {
  await mountDemoReport(page);

  const pageNineteenButton = page.locator('[aria-label="Página 19"]');
  await expect(pageNineteenButton).toContainText('CODEX');
  await pageNineteenButton.click();

  await expect(pageNineteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Singular', exact: true })).toBeVisible();
  await expect(page.locator('.singular-hero')).toContainText('127.548,34');
  await expect(page.locator('.singular-hero')).toContainText('+4,33 %');
  await expect(page.locator('.singular-hero')).toContainText('+4673,31');
  await expect(page.locator('.singular-hero')).toContainText('+22.548,34');
  await expect(page.locator('.singular-capital-map')).toContainText('105.000,00');
  await expect(page.locator('.singular-pending')).toContainText('+15.000,00');

  const chartMonths = page.locator('.singular-chart-scroll svg g[role="button"]');
  await expect(chartMonths).toHaveCount(13);
  await expect(page.locator('.singular-month-card')).toContainText('Marzo 2026');
  await expect(page.locator('.singular-month-card')).toContainText('112.548,34');

  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.locator('.singular-chart-bar')).toHaveCount(13);
  await chartMonths.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(chartMonths.nth(1)).toHaveClass(/is-focused/);

  await page.getByRole('button', { name: 'Patrimonio', exact: true }).click();
  await expect(page.locator('.singular-chart-point')).toHaveCount(13);
  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.singular-chart-scroll svg g[role="button"]')).toHaveCount(6);
  await expect(page.locator('.singular-ledger > article')).toHaveCount(6);

  const marchRow = page.locator('.singular-ledger > article').last();
  await marchRow.locator('button').click();
  await expect(marchRow.locator('.singular-ledger-detail')).toContainText('Aportación incorporada');
  await expect(marchRow.locator('.singular-ledger-detail')).toContainText('+4,08 %');
  await expect(marchRow.locator('.singular-ledger-detail')).toContainText('+2040,00');

  await expect(page.locator('.singular-activity')).toContainText('En tránsito');
  await expect(page.locator('.singular-activity')).toContainText('Atribuido');
  await expect(page.locator('.singular-seal')).toContainText('127.548,34');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
