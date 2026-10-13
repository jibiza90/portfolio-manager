import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GLM 5.3MAX BOVEDA as an auditable custody chamber', async ({ page }) => {
  await mountDemoReport(page);

  const pageFifteenButton = page.locator('[aria-label="Página 15"]');
  await expect(pageFifteenButton).toContainText('GLM 5.3MAX');
  await pageFifteenButton.click();

  await expect(pageFifteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'BÓVEDA' })).toBeVisible();
  await expect(page.locator('.vault-dial-zone')).toContainText('TODO');
  await expect(page.locator('.vault-dial-value')).toContainText('127.548,34');
  await expect(page.locator('.vault-access-plate')).toContainText('+4673,31');
  await expect(page.locator('.vault-access-plate')).toContainText('+4,33 %');
  await expect(page.locator('.vault-transit')).toContainText('+15.000,00');

  await expect(page.locator('.vault-frame')).toHaveCount(13);
  await expect(page.locator('.vault-frame-flow.is-increment')).toHaveCount(2);
  await expect(page.locator('.vault-frame-flow.is-decrement')).toHaveCount(2);

  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.vault-frame')).toHaveCount(6);

  const dial = page.locator('.vault-dial');
  await dial.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.vault-access-plate > header')).toContainText('Febrero 2026');

  await page.keyboard.press('Enter');
  await expect(page.locator('.vault-tray')).toBeVisible();
  await expect(page.locator('.vault-tray')).toContainText('Febrero 2026');
  await page.keyboard.press('Escape');
  await expect(page.locator('.vault-tray')).toHaveCount(0);

  await page.locator('.vault-frame').last().click();
  await expect(page.locator('.vault-tray')).toContainText('Marzo 2026');
  await expect(page.locator('.vault-tray')).toContainText('CONCILIADO');
  await expect(page.locator('.vault-tray')).toContainText('Aportación');
  await expect(page.locator('.vault-tray')).toContainText('Retirada');

  await expect(page.locator('.vault-footer')).toContainText('105.000,00');
  await expect(page.locator('.vault-footer')).toContainText('127.548,34');
  await expect(page.locator('.vault-footer')).toContainText('GLM 5.3MAX');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
