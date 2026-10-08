import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('keeps page 1 intact and renders the premium demo report with real data', async ({ page }) => {
  await mountDemoReport(page);

  const pageOneButton = page.getByRole('button', { name: 'Página 1' });
  const pageTwoButton = page.getByRole('button', { name: 'Página 2' });
  await expect(pageOneButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();

  await pageTwoButton.click();
  await expect(pageTwoButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Tu inversión, con una lectura completa.' })).toBeVisible();
  await expect(page.locator('.premium-v2-hero-balance > strong')).toHaveText(/127\.548,34/);
  await expect(page.locator('.premium-v2-primary-kpis')).toContainText('+4,33 %');
  await expect(page.getByRole('slider', { name: 'Inicio del periodo' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Final del periodo' })).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  const wealthChart = page.locator('.premium-v2-wealth-chart').first();
  await wealthChart.scrollIntoViewIfNeeded();
  const viewportWidth = page.viewportSize()?.width ?? 1024;
  if (viewportWidth <= 820) {
    await expect.poll(() => wealthChart.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }

  const februaryPoint = wealthChart.locator('[aria-label*="Febrero"]');
  await expect(februaryPoint).toHaveCount(1);
  await februaryPoint.dispatchEvent('click');
  await expect(page.locator('.premium-v2-month-focus h2')).toContainText('Febrero');

  await page.getByRole('button', { name: 'Ampliar' }).click();
  await expect(page.getByRole('dialog', { name: 'Evolución patrimonial ampliada' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Evolución patrimonial ampliada' })).toBeHidden();

  await pageOneButton.click();
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
});
