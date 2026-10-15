import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders NEXUS as an interactive cinematic wealth experience', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentySix = page.locator('[aria-label="Página 26"]');
  await expect(pageTwentySix).toContainText('CODEX');
  await pageTwentySix.click();

  await expect(page.locator('.nexus-root')).toBeVisible();
  await expect(page.locator('.nexus-head')).toContainText('NEXUS');
  await expect(page.locator('.nexus-telemetry')).toContainText('127.548,34');
  await expect(page.locator('.nexus-gate')).toHaveCount(14);
  await expect(page.locator('.nexus-timeline button')).toHaveCount(14);

  await page.getByRole('button', { name: 'Pausar secuencia' }).click();
  await page.locator('.nexus-timeline button').nth(12).click();
  await expect(page.locator('.nexus-node-readout')).toContainText('MARZO 2026');
  await expect(page.locator('.nexus-tranches')).toContainText('APORTACIÓN');
  await expect(page.locator('.nexus-tranches')).toContainText('100 % conciliado');

  await page.getByRole('radio', { name: 'Rentabilidad' }).click();
  await expect(page.locator('.nexus-node-readout')).toContainText('Intensidad de rentabilidad');

  await page.getByRole('button', { name: 'Entrar en modo inmersivo' }).click();
  await expect(page.locator('.nexus-root')).toHaveClass(/is-immersive/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.nexus-root')).not.toHaveClass(/is-immersive/);

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps NEXUS operable on mobile without global overflow', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 26"]').click();

  await expect(page.locator('.nexus-root')).toBeVisible();
  await expect(page.locator('.nexus-telemetry')).toBeVisible();
  await expect(page.locator('.nexus-scene-wrap')).toBeVisible();
  await expect(page.locator('.nexus-player')).toBeVisible();
  await expect(page.locator('.nexus-detail')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
