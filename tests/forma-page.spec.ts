import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const mountReport = async (page: import('@playwright/test').Page, clientId = 'client-001') => {
  await page.goto('/');
  await page.evaluate(async ({ modulePath, requestedClientId }) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13, requestedClientId);
  }, { modulePath: '/tests/fixtures/report-view-harness.tsx', requestedClientId: clientId });
};

const openForma = async (page: import('@playwright/test').Page) => {
  const pageThirty = page.locator('.demo-report-page-switcher button[aria-label$="30"]');
  await expect(pageThirty).toContainText('CODEX');
  await pageThirty.click();
  await expect(page.locator('.forma-root')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.forma-intro')).toBeHidden({ timeout: 6_000 });
};

test('renders FORMA as an isolated data-driven patrimony construction', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13-landscape', 'The real WebGL scene uses its own project to avoid GPU contention.');
  test.setTimeout(150_000);
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.setViewportSize({ width: 1728, height: 1080 });
  await mountReport(page);
  await openForma(page);

  await expect(page.locator('.forma-brand')).toContainText('FORMA');
  await expect(page.locator('.forma-active-reading')).toContainText('49.200,00');
  await expect(page.locator('.forma-scene-canvas')).toBeVisible();
  await expect(page.locator('.forma-timeline button')).toHaveCount(14);
  await expect(page.locator('.forma-current-equation')).toContainText('127.548,34');

  const canvasSize = await page.locator('.forma-scene-canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
  expect(canvasSize.width).toBeGreaterThan(900);
  expect(canvasSize.height).toBeGreaterThan(600);

  await page.getByRole('button', { name: 'Recorrido Historia guiada' }).click();
  await expect(page.getByRole('button', { name: 'Pausar recorrido' })).toBeVisible();
  await expect.poll(async () => page.locator('.forma-timeline button.is-active').getAttribute('data-index'), { timeout: 6_000 }).toBe('1');
  await page.getByRole('button', { name: 'Pausar recorrido' }).click();
  await expect(page.getByRole('button', { name: 'Reproducir recorrido' })).toBeVisible();
  const pausedIndex = await page.locator('.forma-timeline button.is-active').getAttribute('data-index');
  await page.waitForTimeout(400);
  await expect(page.locator('.forma-timeline button.is-active')).toHaveAttribute('data-index', pausedIndex ?? '1');
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.locator('.forma-timeline button.is-active')).toHaveAttribute('data-index', String(Number(pausedIndex ?? 1) + 1));
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page.locator('.forma-timeline button.is-active')).toHaveAttribute('data-index', pausedIndex ?? '1');
  await page.getByRole('button', { name: 'Reiniciar recorrido' }).click();
  await expect(page.locator('.forma-timeline button.is-active')).toHaveAttribute('data-index', '0');
  await page.getByRole('button', { name: 'Pausar recorrido' }).click();

  await page.getByRole('button', { name: 'Explorar Control manual' }).click();
  await page.getByRole('button', { name: 'Trayectoria', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trayectoria', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Movimientos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Composición', exact: true }).click();
  await page.getByRole('button', { name: 'Acercar visualización' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer acercamiento' })).toContainText('110%');
  await page.getByRole('button', { name: 'Restablecer acercamiento' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer acercamiento' })).toContainText('100%');

  await page.locator('.forma-timeline').evaluate((timeline) => { timeline.scrollLeft = timeline.scrollWidth; });
  await page.locator('.forma-timeline button').nth(12).click();
  await expect(page.locator('.forma-active-reading')).toContainText('112.548,34');
  await page.getByRole('button', { name: 'Abrir detalle exacto' }).click();
  await expect(page.locator('.forma-precision-sheet')).toHaveClass(/is-open/);
  await expect(page.locator('.forma-tranches')).toContainText('Aportación incorporada');
  await expect(page.locator('.forma-tranches')).toContainText('Capital invertido hasta su retirada');
  await expect(page.locator('.forma-tranches .is-total')).toContainText('4673,31');

  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await page.locator('.forma-timeline button').nth(13).click();
  await expect(page.locator('.forma-active-reading')).toContainText('127.548,34');
  await page.getByRole('button', { name: 'Abrir detalle exacto' }).click();
  await expect(page.locator('.forma-movement-ledger')).toContainText('15.000,00');
  await expect(page.locator('.forma-movement-ledger')).toContainText('último cierre publicado');
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();

  await page.getByRole('button', { name: 'Activar sonido' }).click();
  await expect(page.getByRole('button', { name: 'Desactivar sonido' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Desactivar sonido' }).click();
  await expect(page.getByRole('button', { name: 'Activar sonido' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Abrir a pantalla completa' }).click();
  await expect(page.locator('.forma-root')).toHaveClass(/is-cinema/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.forma-root')).not.toHaveClass(/is-cinema/);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole('button', { name: 'Página 1', exact: true }).click();
  await expect(page.locator('.forma-root')).toHaveCount(0);
  await expect(page.locator('.forma-scene-canvas')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('keeps FORMA legible and contained on iPhone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'The compact experience is checked on one representative phone.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mountReport(page);
  await openForma(page);

  await expect(page.locator('.forma-stage')).toBeVisible();
  await expect(page.locator('.forma-active-reading')).toBeVisible();
  await expect(page.locator('.forma-narrative')).toBeVisible();
  await expect(page.locator('.forma-console')).toBeVisible();

  await page.locator('.forma-timeline').evaluate((timeline) => { timeline.scrollLeft = timeline.scrollWidth; });
  await page.locator('.forma-timeline button').nth(12).tap();
  await expect(page.locator('.forma-active-reading')).toContainText('112.548,34');

  const touchTargets = await page.locator('.forma-header-actions button, .forma-lenses button, .forma-playback button').evaluateAll((buttons) =>
    buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }))
  );
  expect(touchTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  await page.getByRole('button', { name: 'Abrir detalle exacto' }).click();
  const sheetBox = await page.locator('.forma-precision-sheet').boundingBox();
  expect(sheetBox?.width).toBeLessThanOrEqual(391);
  await expect(page.locator('.forma-precision-facts article')).toHaveCount(4);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('preserves every period and control when WebGL is unavailable', async ({ page }, testInfo) => {
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
  await mountReport(page);
  await openForma(page);

  await expect(page.locator('.forma-scene-fallback')).toBeVisible();
  await expect(page.locator('.forma-fallback-hits button')).toHaveCount(14);
  await page.locator('.forma-fallback-hits button').nth(12).click();
  await expect(page.locator('.forma-active-reading')).toContainText('112.548,34');
  await page.getByRole('button', { name: 'Abrir detalle exacto' }).click();
  await expect(page.locator('.forma-tranches')).toContainText('Resultado mensual publicado');
});

test('does not expose Page 30 outside demo1', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'Isolation only needs one representative project.');
  await mountReport(page, 'client-002');
  await expect(page.locator('.demo-report-page-switcher')).toHaveCount(0);
  await expect(page.locator('.forma-root')).toHaveCount(0);
  await expect(page.locator('.report-pro-sheet')).toBeVisible();
});

test('respects reduced motion without removing manual controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'Reduced motion only needs one representative project.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountReport(page);
  await openForma(page);

  await page.getByRole('button', { name: 'Recorrido', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reproducir recorrido' })).toBeVisible();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.locator('.forma-timeline button.is-active')).toHaveAttribute('data-index', '1');
});
