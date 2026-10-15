import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders PRISMA ORIGEN as a complete and numerical patrimonial bridge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyFive = page.locator('[aria-label="Página 25"]');
  await expect(pageTwentyFive).toContainText('Claude Fable 5.1');
  await pageTwentyFive.click();

  await expect(page.locator('.origin-root')).toBeVisible();
  await expect(page.locator('.origin-head')).toContainText('PRISMA ORIGEN');
  await expect(page.locator('.origin-balance')).toContainText('127.548,34');
  await expect(page.locator('.origin-event')).toHaveCount(33);
  await expect(page.locator('.origin-value').first()).toBeVisible();
  await expect(page.locator('.origin-focus')).toContainText('Marzo 2026');
  await expect(page.locator('.origin-focus')).toContainText('112.548,34');

  await page.getByRole('button', { name: '3 meses' }).click();
  await expect(page.locator('.origin-ledger tbody > tr:not(.origin-detail-row)')).toHaveCount(3);
  await page.locator('.origin-ledger tbody > tr:not(.origin-detail-row)').last().locator('button').click();
  await expect(page.locator('.origin-breakdown')).toContainText('APORTACIÓN');
  await expect(page.locator('.origin-breakdown')).toContainText('4673,31');

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps PRISMA ORIGEN usable on mobile with internal scrolling', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 25"]').click();

  await expect(page.locator('.origin-root')).toBeVisible();
  await expect(page.locator('.origin-hero')).toBeVisible();
  await expect(page.locator('.origin-chart-scroll')).toBeVisible();
  await expect(page.locator('.origin-focus')).toBeVisible();
  await expect(page.locator('.origin-ledger')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
