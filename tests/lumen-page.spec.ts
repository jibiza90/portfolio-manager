import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders LUMEN as an interactive capital narrative with real data', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mountDemoReport(page);

  const pageTwentySeven = page.locator('[aria-label="Página 27"]');
  await expect(pageTwentySeven).toContainText('CODEX');
  await pageTwentySeven.click();

  await expect(page.locator('.lumen-root')).toBeVisible();
  await expect(page.locator('.lumen-wordmark')).toContainText('LUMEN');
  await expect(page.locator('.lumen-balance')).toContainText('127.548,34');
  await expect(page.locator('.lumen-point')).toHaveCount(14);
  await expect(page.locator('.lumen-month-rail button')).toHaveCount(14);

  await page.getByRole('button', { name: 'Pausar recorrido' }).click();
  await page.locator('.lumen-month-rail button').nth(12).click();
  await expect(page.locator('.lumen-stage-meta')).toContainText('MARZO 2026');
  await expect(page.locator('.lumen-story-panel')).toContainText('tramos de capital');
  await expect(page.locator('.lumen-tranches')).toContainText('Aportación incorporada');
  await expect(page.locator('.lumen-tranches')).toContainText(/\+4\.?673,31/);

  await page.getByRole('button', { name: /Ver todas las cifras/ }).click();
  await expect(page.locator('.lumen-ledger-table')).toBeVisible();
  await expect(page.locator('.lumen-ledger-table tbody tr')).toHaveCount(14);

  await page.getByRole('button', { name: 'Presentar' }).click();
  await expect(page.locator('.lumen-root')).toHaveClass(/is-cinema/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.lumen-root')).not.toHaveClass(/is-cinema/);

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps LUMEN legible on mobile without global overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 27"]').click();

  await expect(page.locator('.lumen-root')).toBeVisible();
  await expect(page.locator('.lumen-balance')).toBeVisible();
  await expect(page.locator('.lumen-stage')).toBeVisible();
  await expect(page.locator('.lumen-story-panel')).toBeVisible();
  await expect(page.locator('.lumen-equation')).toBeVisible();
  await expect(page.locator('.lumen-spectrum-field')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
