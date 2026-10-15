import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders PRISMA with safe published figures and a traceable bridge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyTwo = page.locator('[aria-label="Página 22"]');
  await expect(pageTwentyTwo).toContainText('Claude Fable 5.1');
  await pageTwentyTwo.click();

  await expect(page.locator('.prisma-root')).toBeVisible();
  await expect(page.locator('.prisma-brand')).toContainText('PRISMA');
  await expect(page.locator('.prisma-balance-card')).toContainText('127.548,34');
  await expect(page.locator('.prisma-kpi-grid')).toContainText('TWR acumulado');
  await expect(page.locator('.prisma-month-bar')).toHaveCount(13);
  await expect(page.locator('.prisma-month-table > tbody > tr:not(.prisma-detail-row)')).toHaveCount(13);

  const howSummaries = page.locator('.prisma-hero .prisma-how summary');
  await howSummaries.nth(0).click();
  await expect(page.locator('.prisma-hero .prisma-how[open]')).toHaveCount(1);
  await howSummaries.nth(2).click();
  await expect(page.locator('.prisma-hero .prisma-how[open]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ver detalle de Marzo 2026' }).click();
  await expect(page.locator('.prisma-tranches')).toContainText('La longitud de cada barra indica únicamente el tiempo');
  await expect(page.locator('.prisma-tranche-table')).toContainText('+4,08 %');
  await expect(page.locator('.prisma-reconciliation')).toContainText('cuadra con el resultado publicado');

  await page.getByRole('button', { name: 'Ver comparación' }).click();
  await expect(page.locator('.prisma-years-body')).toBeVisible();
  await expect(page.locator('.prisma-years-note')).toContainText('dato derivado');

  await page.getByRole('button', { name: '6 meses', exact: true }).click();
  await expect(page.locator('.prisma-month-bar')).toHaveCount(6);
  await expect(page.locator('.prisma-month-table > tbody > tr:not(.prisma-detail-row)')).toHaveCount(6);

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('keeps PRISMA usable on mobile without page overflow', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label="Página 22"]').click();

  await expect(page.locator('.prisma-root')).toBeVisible();
  await expect(page.locator('.prisma-controls')).toBeVisible();
  await expect(page.locator('.prisma-waterfall')).toBeVisible();
  await expect(page.locator('.prisma-month-table')).toBeVisible();

  const hasHorizontalPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalPageOverflow).toBe(false);
});
