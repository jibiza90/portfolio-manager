import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders Gemini 3.8 Aura Strata for Demo1 with reconciled layers and tranches', async ({ page }) => {
  await mountDemoReport(page);

  const pageNineButton = page.getByRole('button', { name: 'Página 9' });
  await expect(pageNineButton).toContainText('Gemini 3.8');

  const pageTenButton = page.getByRole('button', { name: 'Página 10' });
  await expect(pageTenButton).toContainText('Gemini 3.8');
  await pageTenButton.click();

  await expect(pageTenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Informe Patrimonial y Rendimiento' })).toBeVisible();
  await expect(page.locator('.strata-monolith-card.is-primary')).toContainText('127.548,34');
  await expect(page.locator('.strata-executive-grid')).toContainText('+4,33 %');
  await expect(page.locator('.strata-pending-banner')).toContainText('+15.000,00');
  await expect(page.locator('.strata-metrics-strip')).toContainText('+22.548,34');
  await expect(page.locator('.strata-metrics-strip')).toContainText('+18,34 %');

  await expect(page.locator('.strata-bedrock-layer')).toHaveAttribute('d', /M/);
  await expect(page.locator('.strata-mineral-layer')).toHaveAttribute('d', /M/);
  await expect(page.locator('.strata-hud')).toContainText('Marzo 2026');
  await expect(page.locator('.strata-hud')).toContainText('90.000,00');
  await expect(page.locator('.strata-hud')).toContainText('+22.548,34');
  await expect(page.locator('.strata-table-row')).toHaveCount(13);
  await expect(page.locator('.strata-table-detail')).toContainText('Aportación incorporada');
  await expect(page.locator('.strata-table-detail')).toContainText('Posición extraída');

  await page.getByRole('button', { name: /Enero 2026: rentabilidad/ }).click();
  await expect(page.locator('.strata-hud')).toContainText('Enero 2026');
  await expect(page.locator('.strata-table-row.is-focused')).toContainText('Enero 2026');

  await page.getByRole('button', { name: '12 meses', exact: true }).click();
  await expect(page.locator('.strata-table-row')).toHaveCount(12);
  await expect(page.locator('.strata-toolbar-range')).toContainText('Abr 25 — Mar 26');

  const chart = page.locator('.strata-svg');
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.strata-hud')).toContainText('Diciembre 2025');

  await page.getByRole('button', { name: /Pantalla completa/ }).click();
  await expect(page.locator('.strata-canvas-container')).toHaveClass(/is-fullscreen/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.strata-canvas-container')).not.toHaveClass(/is-fullscreen/);

  await expect(page.locator('.strata-formula-banner')).toContainText('105.000,00');
  await expect(page.locator('.strata-formula-banner')).toContainText('127.548,34');
  await expect(page.locator('.strata-formula-banner')).toContainText('Cuadre exacto al céntimo');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
