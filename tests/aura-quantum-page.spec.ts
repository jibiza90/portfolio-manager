import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders Aura Quantum for Demo1 with real balances and auditable periods', async ({ page }) => {
  await mountDemoReport(page);

  const pageNineButton = page.getByRole('button', { name: 'Página 9' });
  await expect(pageNineButton).toBeVisible();
  await pageNineButton.click();

  await expect(pageNineButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Lienzo cuántico patrimonial' })).toBeVisible();
  await expect(page.locator('.aura-balance-monolith')).toContainText('127.548,34');
  await expect(page.locator('.aura-executive')).toContainText('+4,33 %');
  await expect(page.locator('.aura-capital-core')).toContainText('+22.548,34');
  await expect(page.locator('.aura-pending')).toContainText('+15.000,00');
  await expect(page.locator('.aura-chart-capsule')).toContainText('Marzo 2026');
  await expect(page.locator('.aura-table-row')).toHaveCount(13);

  await page.getByRole('button', { name: 'Enfocar Enero 2026' }).click();
  await expect(page.locator('.aura-chart-capsule')).toContainText('Enero 2026');
  await expect(page.locator('.aura-table-row.is-selected')).toContainText('Enero 2026');

  await page.getByRole('button', { name: 'Abrir detalle de Marzo 2026' }).click();
  await expect(page.locator('.aura-table-detail')).toContainText('Aportación incorporada');
  await expect(page.locator('.aura-table-detail')).toContainText('Posición retirada');

  await page.getByRole('button', { name: '12M', exact: true }).click();
  await expect(page.locator('.aura-table-row')).toHaveCount(12);
  await expect(page.locator('.aura-period-control')).toContainText('Abr 25 — Mar 26');

  await page.getByRole('button', { name: '¿Por qué pueden diferir?' }).click();
  await expect(page.locator('.aura-twr-explanation')).toBeVisible();

  await page.getByRole('button', { name: /Ampliar/ }).click();
  await expect(page.locator('.aura-quantum-canvas')).toHaveClass(/is-expanded/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.aura-quantum-canvas')).not.toHaveClass(/is-expanded/);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 8' }).click();
  await expect(page.getByRole('heading', { name: /Cada mes es una pieza/ })).toBeVisible();
});
