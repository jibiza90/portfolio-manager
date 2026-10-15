import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders AION as a temporal wealth twin with real data', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mountDemoReport(page);

  const pageTwentySeven = page.locator('[aria-label="Página 27"]');
  await expect(pageTwentySeven).toContainText('CODEX');
  await pageTwentySeven.click();

  await expect(page.locator('.aion-root')).toBeVisible();
  await expect(page.locator('.aion-brand')).toContainText('AION');
  await expect(page.locator('.aion-now')).toContainText('127.548,34');
  await expect(page.locator('.aion-month-node')).toHaveCount(14);
  await expect(page.locator('.aion-timeline button')).toHaveCount(14);

  await page.getByRole('button', { name: 'Pausar historia' }).click();
  await page.locator('.aion-timeline button').nth(12).click();
  await expect(page.locator('.aion-time-lens')).toContainText('MARZO 2026');
  await expect(page.locator('.aion-story-caption')).toContainText('La aportación de 50.000,00 €');
  await expect(page.locator('.aion-tranches')).toContainText('100 % explicado');
  await expect(page.locator('.aion-tranches')).toContainText('Coincide con el cierre');

  await page.getByRole('tab', { name: /Precisión/ }).click();
  await expect(page.locator('.aion-precision-drawer')).toHaveClass(/is-open/);
  await expect(page.locator('.aion-ledger tbody tr')).toHaveCount(14);
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: 'Abrir comparación' }).click();
  await expect(page.locator('.aion-compare-results')).toBeVisible();
  await expect(page.locator('.aion-compare-results')).toContainText('Variación de posición');

  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.locator('.aion-root')).toHaveClass(/is-immersive/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.aion-root')).not.toHaveClass(/is-immersive/);

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps AION usable on mobile without global overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 27"]').click();

  await expect(page.locator('.aion-root')).toBeVisible();
  await expect(page.locator('.aion-now')).toBeVisible();
  await expect(page.locator('.aion-stage-shell')).toBeVisible();
  await expect(page.locator('.aion-time-lens')).toBeVisible();
  await expect(page.locator('.aion-origin')).toBeVisible();

  await page.getByRole('tab', { name: /Precisión/ }).click();
  await expect(page.locator('.aion-ledger-wrap')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
