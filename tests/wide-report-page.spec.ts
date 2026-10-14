import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders page 20 as the full-width professional edition of page 1', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyButton = page.locator('[aria-label$="20"]');
  await expect(pageTwentyButton).toContainText('CODEX');
  await pageTwentyButton.click();

  await expect(pageTwentyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.report-pro-bar-col')).toHaveCount(13);
  await expect(page.locator('.report-pro-dot-hit')).toHaveCount(13);

  const reportWidth = await page.locator('.report-pro-wide-sheet').evaluate((element) => element.getBoundingClientRect().width);
  expect(reportWidth).toBeGreaterThan(1320);

  const lineChartHeight = await page.locator('.report-pro-line-chart').first().evaluate((element) => element.getBoundingClientRect().height);
  expect(lineChartHeight).toBeGreaterThanOrEqual(490);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps page 20 usable on compact screens', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label$="20"]').click();

  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.report-pro-chart-toolbar select')).toBeVisible();
  await expect(page.locator('.report-pro-expand-chart-button')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
