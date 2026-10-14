import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GROK 4.7 TRAZA without inventing contribution returns', async ({ page }) => {
  await mountDemoReport(page);

  const pageEighteenButton = page.locator('[aria-label="Página 18"]');
  await expect(pageEighteenButton).toContainText('GROK 4.7');
  await pageEighteenButton.click();

  await expect(pageEighteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Traza', exact: true })).toBeVisible();
  await expect(page.locator('.traza-summary')).toContainText('127.548,34');
  await expect(page.locator('.traza-summary')).toContainText('+22.548,34');
  await expect(page.locator('.traza-summary')).toContainText('2');
  await expect(page.locator('.traza-pending')).toContainText('+15.000,00');

  const dockets = page.locator('.traza-docket [role="option"]');
  await expect(dockets).toHaveCount(2);
  await expect(dockets.last()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.traza-file-yield')).toContainText('+4,08 %');
  await expect(page.locator('.traza-file-yield')).toContainText('+2040,00');
  await expect(page.locator('.traza-file-note')).toContainText('No es la rentabilidad del mes ni el TWR');

  await dockets.first().click();
  await expect(page.locator('.traza-file-yield')).toContainText('Pendiente de cierre');
  await expect(page.locator('.traza-file-yield')).not.toContainText('%');

  await dockets.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(dockets.last()).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Ver el mes completo' }).click();
  await expect(page.locator('.traza-month-detail')).toContainText('Posición inicial');
  await expect(page.locator('.traza-month-detail')).toContainText('Retirada');

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(dockets).toHaveCount(1);
  await expect(page.locator('.traza-rest')).toContainText('Retiradas');
  await expect(page.locator('.traza-seal')).toContainText('127.548,34');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
