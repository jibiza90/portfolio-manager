import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders ESTACIONES as a complete annual observatory', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyFour = page.locator('[aria-label="Página 24"]');
  await expect(pageTwentyFour).toContainText('Claude Fable 5.1');
  await pageTwentyFour.click();

  await expect(page.locator('.est-root')).toBeVisible();
  await expect(page.locator('.est-head')).toContainText('ESTACIONES');
  await expect(page.locator('.est-summary')).toContainText('127.548,34');
  await expect(page.locator('.est-year-line')).toHaveCount(2);
  await expect(page.locator('.est-year-cards article')).toHaveCount(2);
  await expect(page.locator('.est-calendar tbody tr')).toHaveCount(2);
  await expect(page.locator('.est-month-readout')).toContainText('Mar');
  await expect(page.locator('.est-root')).not.toContainText('Cliente Demo');

  const row2026 = page.locator('.est-calendar tbody tr').filter({ hasText: '2026' });
  await row2026.locator('td button').nth(2).scrollIntoViewIfNeeded();
  await row2026.locator('td button').nth(2).dispatchEvent('click');
  await expect(page.locator('.est-detail-backdrop')).toHaveClass(/is-open/);
  await expect(page.locator('.est-detail')).toContainText('Mar 2026');
  await expect(page.locator('.est-tranches')).toContainText('Aportación 6/3/2026');
  await page.keyboard.press('Escape');
  await expect(page.locator('.est-detail-backdrop')).not.toHaveClass(/is-open/);

  await page.getByRole('button', { name: '2025', exact: true }).click();
  await expect(page.locator('.est-year-line')).toHaveCount(1);
  await expect(page.locator('.est-year-cards article')).toHaveCount(1);
  await expect(page.locator('.est-calendar tbody tr')).toHaveCount(1);

  await page.getByRole('radio', { name: 'Mensual' }).click();
  await expect(page.locator('.est-overlay-section h2')).toContainText('Rentabilidad mes a mes');

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps ESTACIONES readable on mobile with internal chart and table scrolling', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 24"]').click();

  await expect(page.locator('.est-root')).toBeVisible();
  await expect(page.locator('.est-summary')).toBeVisible();
  await expect(page.locator('.est-overlay-wrap')).toBeVisible();
  await expect(page.locator('.est-year-cards')).toBeVisible();
  await expect(page.locator('.est-calendar-wrap')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
