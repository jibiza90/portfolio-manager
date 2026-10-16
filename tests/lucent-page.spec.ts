import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

const openLucent = async (page: import('@playwright/test').Page) => {
  const pageTwentyEight = page.locator('.demo-report-page-switcher button[aria-label$="28"]');
  await expect(pageTwentyEight).toContainText('CODEX');
  await pageTwentyEight.click();
  await expect(page.locator('.lucent-root')).toBeVisible({ timeout: 20_000 });
};

test('renders LUCENT as a complete light 3D wealth report', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'The real WebGL scene is exercised once to avoid exhausting parallel GPU contexts.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1728, height: 1080 });
  await mountDemoReport(page);
  await openLucent(page);

  await expect(page.locator('.lucent-brand').first()).toContainText('LUCENT');
  await expect(page.locator('.lucent-hero-balance')).toContainText('127.548,34');
  await expect(page.locator('.lucent-timeline-rail button')).toHaveCount(14);
  await expect(page.locator('.lucent-scene-canvas')).toBeVisible();

  const canvasSize = await page.locator('.lucent-scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  expect(canvasSize.width).toBeGreaterThan(600);
  expect(canvasSize.height).toBeGreaterThan(500);

  await expect(page.locator('.lucent-kpis article')).toHaveCount(8);
  await expect(page.locator('.lucent-bar-chart').first().locator('button')).toHaveCount(13);
  await expect(page.locator('.lucent-table tbody > tr:not(.lucent-detail-row)')).toHaveCount(13);
  await expect(page.locator('.lucent-movement-grid article')).toHaveCount(5);

  const marchRow = page.locator('.lucent-table tbody > tr').filter({ hasText: '31/3/2026' }).first();
  await marchRow.getByRole('button').click();
  await expect(page.locator('.lucent-breakdown')).toContainText('Posición inicial del mes');
  await expect(page.locator('.lucent-breakdown')).toContainText('Aportación incorporada');
  await expect(page.locator('.lucent-breakdown')).toContainText('Capital invertido hasta su retirada');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('switches narrative, data layers, comparison and presentation mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Interactive desktop behaviour is exercised once.');
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);
  await openLucent(page);

  await page.getByRole('button', { name: 'Historia Recorrido guiado' }).click();
  await expect(page.getByRole('button', { name: /Pausar|Continuar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explorar Control tridimensional' }).click();
  await expect(page.locator('.lucent-root')).toContainText('Arrastra para rotar');

  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rentabilidad', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Comparar dos meses' }).click();
  await expect(page.locator('.lucent-compare')).toBeVisible();
  await expect(page.locator('.lucent-compare-grid article')).toHaveCount(4);

  await page.getByRole('button', { name: 'Presentar a pantalla completa' }).click();
  await expect(page.locator('.lucent-root')).toHaveClass(/is-cinema/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.lucent-root')).not.toHaveClass(/is-cinema/);

  await page.getByRole('button', { name: 'Historia Recorrido guiado' }).click();
  await expect(page.getByRole('button', { name: 'Mes anterior' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeVisible();
  await expect(page.locator('.lucent-story-progress')).toBeVisible();
});

test('keeps LUCENT usable on a phone without page overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'The compact WebGL layout is exercised on one representative phone.');
  await page.setViewportSize({ width: 390, height: 844 });
  await mountDemoReport(page);
  await openLucent(page);

  await expect(page.locator('.lucent-stage')).toBeVisible();
  await expect(page.locator('.lucent-focus-card')).toBeVisible();
  await expect(page.locator('.lucent-kpis')).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole('button', { name: 'Comparar dos meses' }).click();
  await expect(page.locator('.lucent-compare')).toBeVisible();
  const compareWidth = await page.locator('.lucent-compare').evaluate((element) => element.getBoundingClientRect().width);
  expect(compareWidth).toBeLessThanOrEqual(365);
});

test('preserves all financial information without WebGL', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'The compatibility renderer only needs one representative browser project.');
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return original.call(this, type as '2d', ...(args as []));
      }
    });
  });
  await mountDemoReport(page);
  await openLucent(page);

  await expect(page.locator('.lucent-scene-fallback')).toBeVisible();
  await expect(page.locator('.lucent-scene-fallback > button')).toHaveCount(14);
  await page.locator('.lucent-scene-fallback > button').nth(5).hover();
  await expect(page.locator('.lucent-fallback-tooltip').nth(5)).toBeVisible();
  await expect(page.locator('.lucent-fallback-tooltip').nth(5)).toContainText('Valor de cartera');

  const chartPoint = page.locator('.lucent-chart-point').nth(5);
  await chartPoint.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await chartPoint.locator('circle').hover();
  await expect(page.locator('.lucent-chart-tooltip')).toBeVisible();
  await expect(page.locator('.lucent-chart-tooltip')).toContainText('Valor de cartera');
  await expect(page.locator('.lucent-chart-tooltip')).toContainText('Rentabilidad');

  await page.locator('.lucent-scene-fallback > button').nth(12).click();
  await expect(page.locator('.lucent-focus-card')).toContainText('Marzo 2026');
  await expect(page.locator('.lucent-focus-card')).toContainText('112.548,34');
});
