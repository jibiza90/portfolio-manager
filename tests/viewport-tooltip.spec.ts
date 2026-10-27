import { expect, test } from '@playwright/test';
import { getViewportTooltipPosition } from '../src/utils/viewportTooltip';

test('keeps every tooltip inside the viewport and flips it when needed', () => {
  const viewport = { width: 320, height: 568 };
  const tooltip = { width: 280, height: 180 };
  const anchors = [
    { top: 4, right: 44, bottom: 44, left: 4, width: 40, height: 40 },
    { top: 4, right: 316, bottom: 44, left: 276, width: 40, height: 40 },
    { top: 524, right: 44, bottom: 564, left: 4, width: 40, height: 40 },
    { top: 524, right: 316, bottom: 564, left: 276, width: 40, height: 40 }
  ];

  for (const anchor of anchors) {
    const position = getViewportTooltipPosition(anchor, tooltip, viewport, 'top');
    expect(position.left).toBeGreaterThanOrEqual(12);
    expect(position.top).toBeGreaterThanOrEqual(12);
    expect(position.left + tooltip.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(position.top + tooltip.height).toBeLessThanOrEqual(viewport.height - 12);
  }

  expect(getViewportTooltipPosition(anchors[0], tooltip, viewport, 'top').placement).toBe('bottom');
  expect(getViewportTooltipPosition(anchors[2], tooltip, viewport, 'bottom').placement).toBe('top');
});

test('keeps every report tooltip visible inside the real page viewport', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(12);
  }, '/tests/fixtures/report-view-harness.tsx');
  // La pagina 1 de demo1 prueba un grafico nuevo; la 20 es la que ven los clientes.
  await page.locator('[aria-label$="20"]').click();
  // Aparta el raton del boton pulsado para que no reabra globos al desplazar la pagina.
  await page.mouse.move(1, 1);
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
  await expect(page.getByLabel('Periodo')).toHaveValue('all');

  // Grafico de patrimonio: empieza en el ultimo mes y el eje de importes se queda fijo al deslizar.
  const patrimonyChart = page.locator('.pm-trend-scroll');
  await expect(page.locator('.pm-trend-month')).toHaveCount(12);
  const patrimonyState = await patrimonyChart.evaluate((element) => ({
    scrollable: element.classList.contains('is-scrollable'),
    atLatestMonth: Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1
  }));
  expect(patrimonyState.atLatestMonth).toBe(true);
  if (patrimonyState.scrollable) {
    const fixedAxis = page.locator('.pm-trend-yaxis');
    const fixedAxisBeforeScroll = await fixedAxis.boundingBox();
    await patrimonyChart.evaluate((element) => { element.scrollLeft = 0; });
    const fixedAxisAfterScroll = await fixedAxis.boundingBox();
    expect(fixedAxisBeforeScroll).not.toBeNull();
    expect(fixedAxisAfterScroll).not.toBeNull();
    expect(fixedAxisAfterScroll!.x).toBeCloseTo(fixedAxisBeforeScroll!.x, 0);
    await patrimonyChart.evaluate((element) => { element.scrollLeft = Number.MAX_SAFE_INTEGER; });
  }

  const assertVisibleInsideViewport = async () => {
    const tooltip = page.locator('.report-pro-viewport-tooltip');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
  };

  const standardCards = page.locator('.report-pro-sheet [data-tooltip]');
  const standardCardCount = await standardCards.count();
  expect(standardCardCount).toBeGreaterThan(8);
  for (let index = 0; index < standardCardCount; index += 1) {
    await standardCards.nth(index).focus();
    await assertVisibleInsideViewport();
  }

  const customTriggers = [
    page.getByRole('button', { name: 'Ver desglose del saldo actualizado' }),
    page.locator('.report-pro-capital-history-card').first(),
    page.locator('.report-pro-capital-history-card').nth(1),
    page.getByRole('button', { name: 'Ejemplo' }),
    page.locator('.report-pro-bar-col').first(),
    page.locator('.report-pro-bar-col').last()
  ];

  for (const trigger of customTriggers) {
    await trigger.focus();
    await assertVisibleInsideViewport();
  }

  await page.getByRole('button', { name: 'Ampliar grafico' }).click();
  await expect(page.getByRole('dialog', { name: 'Grafico de evolucion de patrimonio ampliado' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Grafico de evolucion de patrimonio ampliado' })).toBeHidden();

  await page.reload();
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
  // La pagina 1 de demo1 prueba un grafico nuevo; la 20 es la que ven los clientes.
  await page.locator('[aria-label$="20"]').click();
  // Aparta el raton del boton pulsado para que no reabra globos al desplazar la pagina.
  await page.mouse.move(1, 1);
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
  await expect(page.getByLabel('Periodo')).toHaveValue('all');

  const scrollablePatrimonyChart = page.locator('.pm-trend-scroll');
  await expect(page.locator('.pm-trend-month')).toHaveCount(13);
  const latestMonthVisible = await scrollablePatrimonyChart.evaluate((element) => (
    Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1
  ));
  expect(latestMonthVisible).toBe(true);
});
