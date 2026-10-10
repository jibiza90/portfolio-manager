import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the capital flow room for Demo1 and reconciles its figures', async ({ page }) => {
  await mountDemoReport(page);

  const pageFourButton = page.getByRole('button', { name: 'Página 4' });
  await expect(pageFourButton).toBeVisible();
  await pageFourButton.click();

  await expect(pageFourButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /Cada euro tiene.*un recorrido/i })).toBeVisible();
  await expect(page.locator('.pf4-hero-balance > strong')).toHaveText(/127\.548,34/);
  await expect(page.locator('.pf4-equation')).toContainText('115.000,00');
  await expect(page.locator('.pf4-equation')).toContainText('10.000,00');
  await expect(page.locator('.pf4-equation')).toContainText('+22.548,34');
  await expect(page.locator('.pf4-origin-strip > button')).toHaveCount(3);
  await expect(page.locator('.pf4-register-rows > button')).toHaveCount(3);
  await expect(page.locator('.pf4-footer')).toContainText('105.000,00');
  await expect(page.locator('.pf4-footer')).toContainText('127.548,34');

  const contributionLot = page.locator('.pf4-origin-strip > button').filter({ hasText: '06.03.2026' });
  await contributionLot.click();
  await expect(page.locator('.pf4-inspector-title h2')).toContainText('06.03.2026');
  await expect(page.locator('.pf4-entry-signal')).toContainText('4,08 %');

  const returnToggle = page.getByRole('button', { name: 'Rentabilidad', exact: true });
  await returnToggle.click();
  await expect(returnToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(contributionLot).toContainText('%');
  await expect(page.getByLabel('Inicio del trazado')).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 900) {
    await expect(page.locator('.pf4-mobile-flow')).toBeVisible();
    await expect(page.locator('.pf4-flow-diagram')).toBeHidden();
  }

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 3' }).click();
  await expect(page.getByRole('heading', { name: /Tu año, de un vistazo/i })).toBeVisible();
  await page.getByRole('button', { name: 'Página 1' }).click();
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
});
