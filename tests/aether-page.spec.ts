import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

const openAether = async (page: import('@playwright/test').Page) => {
  const pageTwentySeven = page.locator('.demo-report-page-switcher button[aria-label$="27"]');
  await pageTwentySeven.click();
  await expect(page.locator('.aether-root')).toBeVisible({ timeout: 20_000 });
};

test('renders AETHER as an isolated WebGL capital film with real report data', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'The real WebGL scene is exercised once to avoid exhausting parallel GPU contexts.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1728, height: 1080 });
  await mountDemoReport(page);
  await openAether(page);

  await expect(page.locator('.aether-brand')).toContainText('AETHER');
  await expect(page.locator('.aether-now')).toContainText('127.548,34');
  await expect(page.locator('.aether-time-node')).toHaveCount(14);
  await expect(page.locator('.aether-webgl')).toBeVisible();
  await expect.poll(async () => page.locator('.aether-scene').evaluate((element) => !element.classList.contains('is-fallback'))).toBe(true);

  const canvasSize = await page.locator('.aether-webgl').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  expect(canvasSize.width).toBeGreaterThan(500);
  expect(canvasSize.height).toBeGreaterThan(500);

  const marchNode = page.locator('.aether-time-node').nth(12);
  await marchNode.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.aether-overline')).toContainText('Marzo 2026');
  await expect(page.locator('.aether-chapter')).toContainText('4673,31');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('keeps the AETHER film operable on a phone without page overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'The compact WebGL layout is exercised on the smallest representative viewport.');
  await page.setViewportSize({ width: 390, height: 844 });
  await mountDemoReport(page);
  await openAether(page);

  await expect(page.locator('.aether-chapter')).toBeVisible();
  await expect(page.locator('.aether-cockpit')).toBeVisible();
  await expect(page.locator('.aether-timeline')).toBeVisible();
  await expect(page.locator('.aether-webgl')).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole('button', { name: 'Precisión' }).click();
  await expect(page.locator('.aether-dossier')).toHaveClass(/is-open/);
  const dossierBox = await page.locator('.aether-dossier').boundingBox();
  expect(dossierBox?.width).toBeLessThanOrEqual(391);
});

test('preserves the complete timeline when WebGL is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'The compatibility renderer only needs one representative browser project.');
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
  await openAether(page);

  await expect(page.locator('.aether-scene-fallback')).toBeVisible();
  await expect(page.locator('.aether-fallback-track button')).toHaveCount(14);
  await page.locator('.aether-fallback-track button').nth(12).click();
  await expect(page.locator('.aether-overline')).toContainText('Marzo 2026');

  await page.getByRole('button', { name: 'Precisión' }).click();
  await expect(page.locator('.aether-dossier')).toHaveClass(/is-open/);
  await expect(page.locator('.aether-tranches')).toContainText('Aportación incorporada');
  await expect(page.locator('.aether-tranches')).toContainText('Resultado conciliado');
  await page.keyboard.press('Escape');
  await expect(page.locator('.aether-dossier')).not.toHaveClass(/is-open/);

  await page.getByRole('button', { name: 'Pantalla total' }).click();
  await expect(page.locator('.aether-root')).toHaveClass(/is-cinema/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.aether-root')).not.toHaveClass(/is-cinema/);
});
