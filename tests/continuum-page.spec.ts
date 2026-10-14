import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the CODEX Continuum report as one synchronized financial system', async ({ page }) => {
  await mountDemoReport(page);

  const pageNineteenButton = page.locator('[aria-label="Página 19"]');
  await expect(pageNineteenButton).toContainText('CODEX');
  await pageNineteenButton.click();

  await expect(pageNineteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.continuum-wordmark')).toContainText('CONTINUUM');
  await expect(page.locator('.continuum-opening')).toContainText('127.548,34');
  await expect(page.locator('.continuum-opening')).toContainText('+4,33 %');
  await expect(page.locator('.continuum-opening')).toContainText('+4673,31');
  await expect(page.locator('.continuum-opening')).toContainText('+22.548,34');
  await expect(page.locator('.continuum-core')).toContainText('105 k €');
  await expect(page.locator('.continuum-transit')).toContainText('+15.000,00');

  const chartMonths = page.locator('.continuum-chart-scroll').first().locator('svg g[role="option"]');
  await expect(chartMonths).toHaveCount(13);
  await expect(page.locator('.continuum-lens')).toContainText('Marzo 2026');
  await expect(page.locator('.continuum-lens')).toContainText('112.548,34');
  await expect(page.locator('.continuum-return-bar')).toHaveCount(13);

  await expect(page.locator('.continuum-sticky-axis')).toBeVisible();
  await expect(page.locator('.continuum-chart-readout')).toContainText('Marzo 2026');
  await expect(page.locator('.continuum-month-grid > article')).toHaveCount(12);

  const method = page.locator('.continuum-method');
  await method.locator('summary').click();
  await expect(method).toHaveAttribute('open', '');
  await expect(method).toContainText('Rentabilidad total');

  const guidedJourney = page.locator('.continuum-field-buttons button').first();
  await guidedJourney.click();
  await expect(guidedJourney).toHaveAttribute('aria-pressed', 'true');
  await guidedJourney.click();
  await expect(guidedJourney).toHaveAttribute('aria-pressed', 'false');

  await chartMonths.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(chartMonths.nth(1)).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.locator('.continuum-return-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.locator('.continuum-return-bar')).toHaveCount(13);

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.continuum-chart-scroll').first().locator('svg g[role="option"]')).toHaveCount(6);
  await expect(page.locator('.continuum-month-grid > article')).toHaveCount(6);

  const marchCard = page.locator('.continuum-month-grid > article').last();
  await marchCard.locator('button').click();
  await expect(marchCard.locator('.continuum-month-detail')).toContainText('Aportación');
  await expect(marchCard.locator('.continuum-month-detail')).toContainText('+4,08 %');

  await expect(page.locator('.continuum-ledger')).toContainText('Próximo cierre');
  await expect(page.locator('.continuum-ledger')).toContainText('Atribuido');
  await page.getByRole('button', { name: /Retiradas 2/ }).click();
  await expect(page.locator('.continuum-ledger > article')).toHaveCount(2);
  await page.getByRole('button', { name: /Todos 4/ }).click();
  await expect(page.locator('.continuum-footer')).toContainText('127.548,34');

  await page.getByRole('button', { name: 'Ampliar ↗' }).click();
  await expect(page.getByRole('dialog', { name: 'Trayectoria patrimonial ampliada' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Trayectoria patrimonial ampliada' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ampliar/ })).toBeFocused();

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps long histories and negative months readable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountContinuumStressReport();
  }, '/tests/fixtures/report-view-harness.tsx');
  await page.locator('[aria-label$="19"]').click();

  const chart = page.locator('.continuum-chart-scroll').first();
  await expect(chart.locator('svg g[role="option"]')).toHaveCount(48);
  expect(await chart.locator('.continuum-return-bar.is-negative').count()).toBeGreaterThan(0);
  await expect(page.locator('.continuum-month-grid > article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Abrir archivo completo' }).click();
  await expect(page.locator('.continuum-month-grid > article')).toHaveCount(48);

  await page.getByRole('button', { name: '12M', exact: true }).click();
  await expect(chart.locator('svg g[role="option"]')).toHaveCount(12);
  await expect(page.locator('.continuum-chart-readout')).toContainText('Diciembre 2026');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
