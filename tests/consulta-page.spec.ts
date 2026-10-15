import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders CONSULTA as a guided, traceable financial report', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyThree = page.locator('[aria-label="Página 23"]');
  await expect(pageTwentyThree).toContainText('Claude Fable 5.1');
  await pageTwentyThree.click();

  await expect(page.locator('.consulta-root')).toBeVisible();
  await expect(page.locator('.consulta-head')).toContainText('CONSULTA');
  await expect(page.locator('.consulta-main-number')).toContainText('127.548,34');
  await expect(page.getByRole('tab')).toHaveCount(10);
  await expect(page.locator('.consulta-root')).not.toContainText('Cliente Demo');

  await page.getByRole('tab', { name: /¿Cuánto he ganado en total/ }).click();
  await expect(page.locator('.consulta-main-number')).toContainText('+22.548,34');
  await page.locator('.consulta-calculation summary').click();
  await expect(page.locator('.consulta-calculation')).toContainText('112.548,34');

  await page.getByRole('tab', { name: /¿Qué rentabilidad ha tenido/ }).click();
  await expect(page.locator('.consulta-return-pair')).toContainText('+18,34 %');
  await expect(page.locator('.consulta-answer')).toContainText('valor oficial publicado');

  await page.getByRole('tab', { name: /¿Qué ocurrió en un mes concreto/ }).click();
  await expect(page.locator('.consulta-tranche-list')).toContainText('Aportación del 6/3/2026');
  await expect(page.locator('.consulta-tranche-list')).toContainText('+4,08 %');
  await page.locator('.consulta-calculation summary').click();
  await expect(page.locator('.consulta-calculation')).toContainText('Diferencia de conciliación');

  await page.getByRole('tab', { name: /¿Qué pasó con cada aportación/ }).click();
  await expect(page.locator('.consulta-movement-cards article')).toHaveCount(2);
  await expect(page.locator('.consulta-movement-cards')).toContainText('Desde su incorporación hasta el cierre');

  await page.getByRole('button', { name: '6 meses', exact: true }).click();
  await expect(page.getByRole('tab', { name: /¿Cómo ha evolucionado/ })).toContainText('6 cierres');
  await page.getByRole('tab', { name: /¿Cómo ha evolucionado/ }).click();
  await expect(page.locator('.consulta-evolution-wrap')).toBeVisible();

  const activeTab = page.getByRole('tab', { selected: true });
  await activeTab.press('ArrowLeft');
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('aria-selected', 'true');

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps CONSULTA usable on mobile without page overflow', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 23"]').click();

  await expect(page.locator('.consulta-root')).toBeVisible();
  await expect(page.locator('.consulta-questions')).toBeVisible();
  await expect(page.locator('.consulta-answer')).toBeVisible();
  await page.getByRole('tab', { name: /¿Qué ocurrió en un mes concreto/ }).click();
  await expect(page.locator('.consulta-month-metrics')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
