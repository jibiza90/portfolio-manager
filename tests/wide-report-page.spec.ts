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

  const patrimonySection = page.locator('.report-pro-wide-sheet .report-pro-patrimony-section').last();
  await patrimonySection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await expect(patrimonySection.locator('.report-pro-month-guide')).toHaveCount(13);
  await expect(patrimonySection.locator('.report-pro-wide-axis-scale')).toContainText('125.000');

  const visibleChartItems = await patrimonySection.evaluate((root) => {
    const scroller = root.querySelector('.report-pro-patrimony-scroll');
    if (!scroller) return { months: [], clippedLabels: -1 };
    const viewport = scroller.getBoundingClientRect();
    const months = [...root.querySelectorAll('.report-pro-month-row span')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= viewport.left && rect.right <= viewport.right;
      })
      .map((element) => element.textContent);
    const clippedLabels = [...root.querySelectorAll('.report-pro-point-label')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const intersects = rect.right > viewport.left && rect.left < viewport.right;
        return intersects && (rect.left < viewport.left - 0.5 || rect.right > viewport.right + 0.5);
      }).length;
    return { months, clippedLabels };
  });
  expect(visibleChartItems.months).toHaveLength(10);
  expect(visibleChartItems.months.at(-1)).toBe('Mar 26');
  expect(visibleChartItems.clippedLabels).toBe(0);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps the expanded page 20 patrimony chart aligned and fully labelled', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);
  await page.locator('[aria-label$="20"]').click();
  await page.locator('.report-pro-wide-sheet .report-pro-expand-chart-button').click();

  const overlay = page.locator('.report-pro-chart-overlay');
  const monthRow = overlay.locator('.report-pro-month-row-expanded');
  await expect(monthRow).toBeVisible();
  await expect(monthRow.locator('span')).toHaveCount(13);
  await expect(overlay.locator('.report-pro-month-guide')).toHaveCount(13);

  const fitsOverlay = await overlay.evaluate((root) => {
    const section = root.querySelector('.report-pro-patrimony-section');
    const row = root.querySelector('.report-pro-month-row-expanded');
    if (!section || !row) return false;
    return row.getBoundingClientRect().bottom <= section.getBoundingClientRect().bottom + 1;
  });
  expect(fitsOverlay).toBe(true);
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
