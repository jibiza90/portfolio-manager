import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders Gemini 3.8 Strata Atlas for Demo1 with real geological reconciliation', async ({ page }) => {
  await mountDemoReport(page);

  const pageTwelveButton = page.getByRole('button', { name: 'Página 12' });
  await expect(pageTwelveButton).toContainText('Gemini 3.8');
  await pageTwelveButton.click();

  await expect(pageTwelveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'The Strata Atlas' })).toBeVisible();
  await expect(page.locator('.atlas-summit')).toContainText('127.548,34');
  await expect(page.locator('.atlas-summit')).toContainText('105.000,00');
  await expect(page.locator('.atlas-summit')).toContainText('+22.548,34');
  await expect(page.locator('.atlas-summit')).toContainText('+18,34 %');
  await expect(page.locator('.atlas-pending')).toContainText('+15.000,00');

  await expect(page.locator('.atlas-bedrock-area')).toHaveAttribute('d', /M/);
  await expect(page.locator('.atlas-mineral-area')).toHaveAttribute('d', /M/);
  await expect(page.locator('.atlas-point')).toHaveCount(13);
  await expect(page.locator('.atlas-flow-marker.is-increment')).toHaveCount(2);
  await expect(page.locator('.atlas-flow-marker.is-decrement')).toHaveCount(2);
  await expect(page.locator('.atlas-map-hud')).toContainText('Marzo 2026');
  await expect(page.locator('.atlas-map-hud')).toContainText('90.000,00');
  await expect(page.locator('.atlas-map-hud')).toContainText('+22.548,34');

  await expect(page.locator('.atlas-inspector')).toContainText('Aportación incorporada');
  await expect(page.locator('.atlas-inspector')).toContainText('Posición retirada');
  await expect(page.locator('.atlas-inspector')).toContainText('4,08 %');
  await expect(page.locator('.atlas-ledger-row')).toHaveCount(13);
  await expect(page.locator('.atlas-movement-register article')).toHaveCount(4);

  await page.getByRole('button', { name: /Sondear Enero 2026/ }).click();
  await expect(page.locator('.atlas-map-hud')).toContainText('Enero 2026');
  await expect(page.locator('.atlas-inspector')).toContainText('Enero 2026');

  await page.getByRole('button', { name: 'Últimos 12 meses' }).click();
  await expect(page.locator('.atlas-ledger-row')).toHaveCount(12);
  await expect(page.locator('.atlas-period-bar')).toContainText('Abr 25 — Mar 26');

  const map = page.locator('.atlas-map-svg');
  await map.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.atlas-map-hud')).toContainText('Diciembre 2025');

  await page.locator('.atlas-expand').click();
  await expect(page.locator('.atlas-topography')).toHaveClass(/is-expanded/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('.atlas-topography')).not.toHaveClass(/is-expanded/);

  await expect(page.locator('.atlas-footer')).toContainText('105.000,00');
  await expect(page.locator('.atlas-footer')).toContainText('127.548,34');
  await expect(page.locator('.atlas-footer')).toContainText('Formación reconciliada al céntimo');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
