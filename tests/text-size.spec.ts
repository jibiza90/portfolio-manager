import { expect, test, type Page } from '@playwright/test';

// Tamaño de letra del area de cliente: Normal, Grande y Muy grande, guardado en el navegador.

const open = async (page: Page) => {
  await page.addInitScript(() => window.localStorage.setItem('jigsa-guest-intro-seen', '1'));
  await page.goto('/invitado/');
  await expect(page.locator('[data-tour="patrimonio"]')).toBeVisible();
};

const zoomOf = (page: Page) => page.locator('.client-portal-text-zoom').evaluate((el) => Number(getComputedStyle(el).zoom));

test('clients can pick a larger text size and it is remembered', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked on chosen viewports below.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await open(page);

  const sizes = page.getByRole('radiogroup', { name: 'Elige el tamaño de letra' });
  await expect(sizes.locator('.tsc-label')).toHaveText(['Normal', 'Grande', 'Muy grande']);
  await expect(sizes.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
  expect(await zoomOf(page)).toBe(1);

  await sizes.getByRole('radio', { name: 'Muy grande' }).click();
  await expect(sizes.getByRole('radio', { name: 'Muy grande' })).toHaveAttribute('aria-checked', 'true');
  expect(await zoomOf(page)).toBeCloseTo(1.3, 3);

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Muy grande' })).toHaveAttribute('aria-checked', 'true');
  expect(await zoomOf(page)).toBeCloseTo(1.3, 3);
});

for (const { width, normal, largest } of [
  { width: 390, normal: 1, largest: 1.16 },
  { width: 1280, normal: 1.08, largest: 1.404 }
]) {
  test(`text sizes fit a ${width}px screen without sideways scrolling`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-mini', 'Checked on chosen viewports.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    // En portatiles la letra ya sale un poco mas grande por defecto.
    expect(await zoomOf(page)).toBeCloseTo(normal, 3);
    await page.getByRole('radio', { name: 'Muy grande' }).click();
    expect(await zoomOf(page)).toBeCloseTo(largest, 3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

// Ningun texto se sale de su casilla (tarjeta, pastilla, celda...) con la letra ampliada.
// Las tablas que se desplazan de lado y las etiquetas del grafico de barras quedan fuera a proposito.
const findOverflowingText = () => {
  const hasBox = (el: Element) => {
    const cs = getComputedStyle(el);
    const background = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const border = (['Top', 'Right', 'Bottom', 'Left'] as const).some((side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none');
    return background || border || cs.backgroundImage !== 'none';
  };
  const found: string[] = [];
  document.querySelectorAll('.client-portal-text-zoom, .client-portal-toolbar, .tsc-bar').forEach((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!node.textContent?.trim() || !parent || parent.closest('svg, [aria-hidden="true"], .report-pro-bars, .table-scroll, .report-pro-client-tag')) continue;
      let box: Element | null = parent;
      while (box && box !== root && !hasBox(box)) box = box.parentElement;
      if (!box) continue;
      let scroller: Element | null = parent;
      let scrolls = false;
      while (scroller && scroller !== box) {
        const cs = getComputedStyle(scroller);
        if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) { scrolls = true; break; }
        scroller = scroller.parentElement;
      }
      if (scrolls) continue;
      const b = box.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((r) => r.width > 0 && (r.left < b.left - 2 || r.right > b.right + 2 || r.top < b.top - 2 || r.bottom > b.bottom + 2))) {
        found.push(`${String(box.className).slice(0, 60)}: ${node.textContent.trim().slice(0, 30)}`);
      }
    }
  });
  return [...new Set(found)];
};

for (const width of [360, 768, 1024, 1600, 1920]) {
  test(`with very large text nothing spills out of its box at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-mini', 'Checked on chosen viewports.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => window.localStorage.setItem('jigsa-text-size', 'muy-grande'));
    await open(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(findOverflowingText)).toEqual([]);
  });
}

// Las tarjetas se reparten en filas equilibradas: nunca 5+1 o 4+2.
const rowsOf = (selector: string) => {
  const grid = document.querySelector(selector);
  if (!grid) return '';
  const tops: number[] = [];
  const counts: number[] = [];
  [...grid.children].forEach((child) => {
    const top = Math.round(child.getBoundingClientRect().top);
    const index = tops.findIndex((value) => Math.abs(value - top) < 6);
    if (index === -1) { tops.push(top); counts.push(1); } else counts[index] += 1;
  });
  return counts.join('+');
};

for (const { width, level } of [
  { width: 768, level: 'muy-grande' },
  { width: 1024, level: 'grande' },
  { width: 1280, level: 'normal' },
  { width: 1600, level: 'muy-grande' },
  { width: 1920, level: 'normal' }
]) {
  test(`card blocks stay balanced at ${width}px with ${level} text`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-mini', 'Checked on chosen viewports.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => window.localStorage.setItem('jigsa-text-size', value), level);
    await open(page);
    expect(['6', '3+3', '2+2+2', '1+1+1+1+1+1']).toContain(await page.evaluate(rowsOf, '.report-pro-period-summary'));
    for (const selector of ['.report-pro-kpis-demo', '.report-pro-capital-grid']) {
      expect(['5', '3+2', '2+2+1', '1+1+1+1+1']).toContain(await page.evaluate(rowsOf, selector));
    }
  });
}

// demo1 (tablas y apartados propios) con la letra ampliada: nada se sale y las tarjetas no quedan sueltas.
for (const { width, zoom } of [
  { width: 360, zoom: 1.16 },
  { width: 1024, zoom: 1.242 },
  { width: 1280, zoom: 1.404 },
  { width: 1920, zoom: 1.3 }
]) {
  test(`demo1 report keeps everything inside its box at ${width}px with zoom ${zoom}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-mini', 'Checked on chosen viewports.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(async (z) => {
      const harness = await import(/* @vite-ignore */ '/tests/fixtures/report-view-harness.tsx' as string);
      harness.mountReportView(13, 'client-001', true);
      const root = document.getElementById('root') as HTMLElement;
      root.classList.add('client-portal-text-zoom');
      root.style.zoom = String(z);
    }, zoom);
    await expect(page.locator('.report-pro-explain-panel')).toBeVisible();
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-revealed')));
    await page.waitForTimeout(1600);
    expect(await page.evaluate(findOverflowingText)).toEqual([]);
    expect(['6+1', '3+3+1', '2+2+2+1', '4+3', '2+2+2+1', '1+1+1+1+1+1+1']).toContain(await page.evaluate(rowsOf, '.report-pro-period-summary'));
    expect(await page.evaluate(rowsOf, '.report-pro-period-summary')).not.toMatch(/^(6\+1|3\+3\+1)$/);
  });
}

test('full screen button enters full screen, shows how to leave and can exit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const button = page.getByRole('button', { name: 'Pantalla completa' });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  // En pantallas tactiles el aviso indica el boton; con teclado, la tecla Esc.
  await expect(page.locator('.fsb-hint')).toContainText(/Esc para volver a la pantalla normal|Para volver, pulsa Salir de pantalla completa/);
  await expect(page.locator('.fsb-hint')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});
