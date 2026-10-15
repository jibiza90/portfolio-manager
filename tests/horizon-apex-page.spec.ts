import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders HORIZONTE APEX as a precise dual-stream financial terminal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyOneButton = page.locator('[aria-label="Página 21"]');
  await expect(pageTwentyOneButton).toContainText('Gemini 3.8 Flash');
  await pageTwentyOneButton.click();

  await expect(pageTwentyOneButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.apex-report')).toBeVisible();
  await expect(page.locator('.apex-brand-lockup')).toContainText('Horizonte Apex');
  await expect(page.locator('.apex-summit')).toContainText('127.548,34');
  await expect(page.locator('.apex-capital-rack')).toContainText('Capital aportado');
  await expect(page.locator('.apex-capital-rack')).toContainText('115.000,00');
  await expect(page.locator('.apex-vector-strip')).toContainText('15.000,00');
  await expect(page.locator('.apex-month-vector')).toHaveCount(13);
  await expect(page.locator('.apex-row:not(.apex-row-head)')).toHaveCount(13);
  await expect(page.locator('.apex-tactical-dock')).toContainText('Marzo 2026');
  await expect(page.locator('.apex-focus-hud')).toContainText('112.548,34');

  const chart = page.locator('.apex-canvas');
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.apex-tactical-dock')).toContainText('Febrero 2026');
  await expect(page.locator('.apex-focus-hud')).toContainText('57.875,03');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('.apex-tranche')).toContainText('Aportación');
  await expect(page.locator('.apex-tranche')).toContainText('+4,08 %');

  await page.getByRole('button', { name: '6 meses', exact: true }).click();
  await expect(page.locator('.apex-month-vector')).toHaveCount(6);
  await expect(page.locator('.apex-row:not(.apex-row-head)')).toHaveCount(6);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
test('keeps the APEX terminal usable on mobile without page overflow', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 21"]').click();

  await expect(page.locator('.apex-report')).toBeVisible();
  await expect(page.locator('.apex-summit')).toContainText('Saldo total disponible');
  await expect(page.locator('.apex-tactical-dock')).toBeVisible();
  await expect(page.locator('.apex-audit-matrix')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
