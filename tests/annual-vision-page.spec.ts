import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders the annual vision for Demo1 and keeps its controls coherent', async ({ page }) => {
  await mountDemoReport(page);

  const pageThreeButton = page.getByRole('button', { name: 'Página 3' });
  await expect(pageThreeButton).toBeVisible();
  await pageThreeButton.click();

  await expect(pageThreeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /Tu año, de un vistazo/i })).toBeVisible();
  await expect(page.locator('.pv3-balance > strong')).toHaveText(/127\.548,34/);
  await expect(page.locator('.pv3-year-controls > strong')).toHaveText('2026');
  await expect(page.locator('.pv3-calendar-row')).toHaveCount(1);
  await expect(page.locator('.pv3-month-cell.has-data')).toHaveCount(3);
  await expect(page.getByRole('gridcell', { name: /Abr 2026: sin cierre todavía/i })).toBeVisible();
  await expect(page.getByLabel('Leyenda de la matriz')).toContainText('Aportación');
  await expect(page.getByLabel('Leyenda de la matriz')).toContainText('Sin datos');

  const marchCell = page.getByRole('gridcell', { name: /Marzo.*2026/i });
  await expect(marchCell).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pv3-month-insight')).toContainText('4673,31');
  await expect(page.locator('.pv3-month-insight')).toContainText('4,33 %');
  await expect(page.locator('.pv3-month-story')).toContainText('Marzo fue el mes con mayor beneficio de 2026');
  await expect(page.locator('.pv3-year-digest')).toContainText('Mayor beneficio mensual');

  const profitLayer = page.getByRole('button', { name: /Beneficio €.*Resultado en euros/i });
  await profitLayer.click();
  await expect(profitLayer).toHaveAttribute('aria-pressed', 'true');
  await expect(marchCell).toContainText('+4,7 mil €');

  const februaryCell = page.getByRole('gridcell', { name: /Febrero.*2026/i });
  await februaryCell.click();
  await expect(page.locator('.pv3-month-insight h2')).toContainText('Febrero');
  await februaryCell.press('ArrowLeft');
  await expect(page.locator('.pv3-month-insight h2')).toContainText('Enero');

  await page.getByRole('button', { name: 'Año anterior' }).click();
  await expect(page.locator('.pv3-year-controls > strong')).toHaveText('2025');
  await expect(page.locator('.pv3-calendar-row')).toHaveCount(1);
  await expect(page.locator('.pv3-month-cell.has-data')).toHaveCount(10);

  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(page.locator('.pv3-year-controls > strong')).toHaveText('Todo');
  await expect(page.locator('.pv3-calendar-row')).toHaveCount(2);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 1' }).click();
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
  await page.getByRole('button', { name: 'Página 2' }).click();
  await expect(page.getByRole('heading', { name: /Patrimonio.*en perspectiva/i })).toBeVisible();
});
