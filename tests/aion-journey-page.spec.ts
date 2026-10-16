import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

const openAion = async (page: import('@playwright/test').Page) => {
  const pageTwentyNine = page.locator('.demo-report-page-switcher button[aria-label$="29"]');
  await expect(pageTwentyNine).toContainText('CODEX');
  await pageTwentyNine.click();
  await expect(page.locator('.aion-root')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.aion-intro-curtain')).toBeHidden({ timeout: 5_000 });
};

test('renders AION as a cinematic data-driven capital journey', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-tablet', 'The real WebGL journey uses a dedicated tablet project to avoid competing with AETHER.');
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1728, height: 1080 });
  await mountDemoReport(page);
  await openAion(page);

  await expect(page.locator('.aion-brand')).toContainText('AION');
  await page.getByRole('button', { name: /Explorar/ }).click();
  await page.locator('.aion-scrubber-labels button').first().click();
  await expect(page.locator('.aion-current-value')).toContainText('49.200,00');
  await expect(page.locator('.aion-scene-canvas')).toBeVisible();
  await expect(page.locator('.aion-scrubber-labels button')).toHaveCount(14);
  await expect(page.locator('.aion-truth-grid article')).toHaveCount(4);
  await expect(page.locator('.aion-period-equation')).toContainText('127.548,34');

  const canvasSize = await page.locator('.aion-scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  expect(canvasSize.width).toBeGreaterThan(700);
  expect(canvasSize.height).toBeGreaterThan(500);

  await page.locator('.aion-scrubber-labels button').nth(12).click();
  await expect(page.locator('.aion-current-value')).toContainText('112.548,34');
  await expect(page.locator('.aion-breakdown')).toContainText('Aportación incorporada');
  await expect(page.locator('.aion-breakdown')).toContainText('Capital invertido hasta su retirada');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('supports story controls, sound, visual layers and cinema mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-tablet', 'Desktop controls share the dedicated AION tablet project.');
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);
  await openAion(page);

  await page.getByRole('button', { name: 'Explorar Control libre' }).click();
  await page.getByRole('button', { name: 'Capital', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capital', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Movimientos', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Activar sonido' }).click();
  await expect(page.getByRole('button', { name: 'Desactivar sonido' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Historia Recorrido guiado' }).click();
  await expect(page.getByRole('button', { name: /Pausar historia|Reproducir historia/ })).toBeVisible();
  await page.getByRole('button', { name: 'Periodo siguiente' }).click();
  await expect(page.locator('.aion-story-state')).toContainText('%');

  await page.getByRole('button', { name: 'Abrir a pantalla completa' }).click();
  await expect(page.locator('.aion-root')).toHaveClass(/is-cinema/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.aion-root')).not.toHaveClass(/is-cinema/);
});

test('keeps the journey legible and contained on iPhone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'The compact journey is exercised on one representative phone.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mountDemoReport(page);
  await openAion(page);

  await expect(page.locator('.aion-stage')).toBeVisible();
  await expect(page.locator('.aion-narrator')).toBeVisible();
  await expect(page.locator('.aion-current-value')).toBeVisible();
  await expect(page.locator('.aion-truth-layer')).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
  const stageWidth = await page.locator('.aion-stage').evaluate((element) => element.getBoundingClientRect().width);
  expect(stageWidth).toBeLessThanOrEqual(370);
});

test('preserves the complete journey when WebGL is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'The compatibility renderer only needs one representative project.');
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
  await openAion(page);

  await expect(page.locator('.aion-scene-fallback')).toBeVisible();
  await expect(page.locator('.aion-fallback-hits > button')).toHaveCount(14);
  await page.locator('.aion-fallback-hits > button').nth(12).click();
  await expect(page.locator('.aion-current-value')).toContainText('112.548,34');
  await expect(page.locator('.aion-truth-layer')).toContainText('marzo 2026');
});
