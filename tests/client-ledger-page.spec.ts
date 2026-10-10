import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the Kimi 2.7 ledger concept for Demo1 and reconciles its statement', async ({ page }) => {
  await mountDemoReport(page);

  await expect(page.locator('.demo-report-page-switcher')).toContainText('ChatGPT');
  await expect(page.locator('.demo-report-page-switcher')).toContainText('SWE2');
  await expect(page.locator('.demo-report-page-switcher')).toContainText('Kimi 2.7');

  const pageSixButton = page.getByRole('button', { name: 'Página 6' });
  await expect(pageSixButton).toBeVisible();
  await pageSixButton.click();

  await expect(pageSixButton).toHaveAttribute('aria-pressed', 'true');
  await expect(pageSixButton).toHaveClass(/is-active/);
  await expect(page.getByRole('button', { name: 'Página 1' })).not.toHaveClass(/is-active/);
  await expect(page.getByRole('heading', { name: 'Tu inversión, mes a mes.' })).toBeVisible();
  await expect(page.locator('.ledger-balance-seal')).toContainText('127.548,34');
  await expect(page.locator('.ledger-kpis')).toContainText('105.000,00');
  await expect(page.locator('.ledger-kpis')).toContainText('+22.548,34');
  await expect(page.locator('.ledger-global-equation')).toContainText('Saldo reconciliado');
  await expect(page.locator('.ledger-statement-rows > button')).toHaveCount(13);
  await expect(page.locator('.ledger-dossier-title')).toContainText('Marzo 2026');
  await expect(page.locator('.ledger-dossier-title')).toContainText('+4,33 %');
  await expect(page.locator('.ledger-pending')).toContainText('15.000,00');

  const january = page.locator('.ledger-statement-rows > button').filter({ hasText: 'Ene 26' });
  await january.click();
  await expect(page.locator('.ledger-dossier-title')).toContainText('Enero 2026');

  await page.getByRole('button', { name: '3 meses' }).click();
  await expect(page.locator('.ledger-statement-rows > button')).toHaveCount(3);
  await page.locator('.ledger-statement-rows > button').filter({ hasText: 'Mar 26' }).click();
  await expect(page.locator('.ledger-dossier-title')).toContainText('Marzo 2026');

  await page.locator('.ledger-breakdown summary').click();
  await expect(page.locator('.ledger-breakdown')).toContainText('Aportación incorporada');
  await expect(page.locator('.ledger-breakdown')).toContainText('+4,08 %');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 5' }).click();
  await expect(page.getByRole('heading', { name: 'La historia de tu patrimonio, contada con claridad.' })).toBeVisible();
  await page.getByRole('button', { name: 'Página 1' }).click();
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
});
