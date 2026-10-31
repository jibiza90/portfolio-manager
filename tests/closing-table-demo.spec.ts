import { expect, test, type Page } from '@playwright/test';

// demo1: la tabla de cierres va justo debajo de "Capital y beneficio acumulado", con titulos fijos,
// aportaciones en verde, retiradas en rojo y el total de cada año mas marcado. El resto de clientes, igual.

const mount = async (page: Page, clientId: string) => {
  await page.goto('/');
  await page.evaluate(async ({ id }) => {
    const harness = await import(/* @vite-ignore */ '/tests/fixtures/report-view-harness.tsx' as string);
    harness.mountReportView(13, id, true);
  }, { id: clientId });
  await expect(page.locator('.report-pro-closing-panel')).toBeVisible();
};

const sectionTitles = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('.report-pro-wide-sheet > section')].map((section) => section.querySelector('h4')?.textContent?.trim() ?? '').filter(Boolean)
);

test('demo1 shows the closing table under capital and profit with sticky headings and coloured movements', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-001');

  const titles = await sectionTitles(page);
  expect(titles.indexOf('Cierres y composición del resultado')).toBe(titles.indexOf('Capital y beneficio acumulado') + 1);

  const colours = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.report-pro-closing-table > tbody > tr')].find((tr) => tr.textContent?.includes('Ago 2025'))!;
    const cells = row.querySelectorAll('td');
    const withdrawalRow = [...document.querySelectorAll('.report-pro-closing-table > tbody > tr')].find((tr) => tr.textContent?.includes('Dic 2025'))!;
    return {
      contribution: getComputedStyle(cells[3]).color,
      emptyWithdrawal: getComputedStyle(cells[4]).color,
      withdrawal: getComputedStyle(withdrawalRow.querySelectorAll('td')[4]).color,
      result: getComputedStyle(cells[5]).color
    };
  });
  expect(colours.contribution).toBe('rgb(21, 128, 61)');
  expect(colours.withdrawal).toBe('rgb(185, 28, 28)');
  expect(colours.emptyWithdrawal).not.toBe('rgb(185, 28, 28)');
  expect(colours.result).not.toBe('rgb(21, 128, 61)');

  const total = page.locator('.report-pro-closing-year-total').first();
  expect(await total.locator('td').nth(2).evaluate((cell) => getComputedStyle(cell).fontSize)).toBe('16px');

  const gap = await page.evaluate(() => {
    const scroller = document.querySelector('.report-pro-closing-scroll') as HTMLElement;
    scroller.scrollTop = 250;
    return Math.round(scroller.querySelector('thead th')!.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  });
  expect(gap).toBeLessThanOrEqual(2);
});

test('every client gets the closing table under capital and profit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-004');
  const titles = await sectionTitles(page);
  expect(titles.indexOf('Cierres y composición del resultado')).toBe(titles.indexOf('Capital y beneficio acumulado') + 1);
  await expect(page.locator('.report-pro-closing-panel.is-demo-closing')).toHaveCount(1);
});

test('demo1 closing table shows every year by default and can show a single year', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-001');

  const years = page.getByRole('group', { name: 'Elegir año de los cierres' });
  await expect(years.getByRole('button')).toHaveText(['Todo', '2026', '2025']);
  await expect(years.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true');
  const totals = page.locator('.report-pro-closing-year-total td:nth-child(2) strong');
  await expect(totals).toHaveText(['Total 2025', 'Total 2026']);

  await years.getByRole('button', { name: '2025' }).click();
  await expect(years.getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');
  await expect(totals).toHaveText(['Total 2025']);
  const months2025 = await page.locator('.report-pro-closing-table > tbody > tr:not(.report-pro-closing-year-total) td:nth-child(2) strong').allTextContents();
  expect(months2025.length).toBeGreaterThan(0);
  expect(months2025.every((month) => month.endsWith('2025'))).toBe(true);

  await years.getByRole('button', { name: '2026' }).click();
  await expect(totals).toHaveText(['Total 2026']);
  await years.getByRole('button', { name: 'Todo' }).click();
  await expect(totals).toHaveText(['Total 2025', 'Total 2026']);
});

test('demo1 monthly profits: year or period selector with bold totals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-001');
  const panel = page.locator('.report-pro-benefits-panel');
  const options = panel.getByRole('group', { name: 'Elegir qué beneficios ver' });
  await expect(options.getByRole('button')).toHaveText(['Todo', '2026', '2025', 'Elegir periodo']);
  await expect(panel.locator('thead th')).toHaveText(['Mes', 'Beneficio del mes', 'Rentabilidad', 'Acumulado del año']);
  const totals = panel.locator('.report-pro-strong-total');
  await expect(totals).toHaveText([/Total 2025\s*\+10\.532,42\s€.*10\.532,42\s€/, /Total 2026\s*\+10\.088,35\s€.*10\.088,35\s€/]);

  // Se abre mostrando lo mas reciente (abajo del todo).
  const distanceToEnd = await page.evaluate(() => {
    const scroller = document.querySelector('.report-pro-benefits-scroll') as HTMLElement;
    return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  });
  expect(distanceToEnd).toBeLessThanOrEqual(2);

  await options.getByRole('button', { name: '2026' }).click();
  await expect(totals).toHaveText([/Total 2026\s*\+10\.088,35\s€/]);

  await options.getByRole('button', { name: 'Elegir periodo' }).click();
  await panel.getByLabel('Desde').selectOption('2025-10');
  await panel.getByLabel('Hasta').selectOption('2026-02');
  await expect(panel.locator('thead th').last()).toHaveText('Acumulado del periodo');
  await expect(totals).toHaveText([/Total del periodo\s*Oct 2025 – Feb 2026\s*\+8\.947,46\s€/]);
  expect(await totals.locator('td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor)).toBe('rgb(11, 85, 96)');
});

test('demo1 capital movements: period and type selectors with totals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-001');
  const panel = page.locator('.report-pro-movements-panel');
  const periods = panel.getByRole('group', { name: 'Elegir qué movimientos ver' });
  const types = panel.getByRole('group', { name: 'Elegir tipo de movimiento' });
  await expect(types.getByRole('button')).toHaveText(['Todos', 'Aportaciones', 'Retiradas']);
  const totals = panel.locator('.report-pro-strong-total');
  await expect(totals).toHaveText([
    /Total 2025.*\+50\.000,00\s€.*-5\.000,00\s€.*45\.000,00\s€/,
    /Total 2026.*\+65\.000,00\s€.*-5\.000,00\s€.*105\.000,00\s€/
  ]);

  await types.getByRole('button', { name: 'Retiradas' }).click();
  await expect(panel.locator('tbody tr:not(.report-pro-strong-total) td:nth-child(2)')).toHaveText(['Retirada', 'Retirada']);
  await expect(totals).toHaveText([/Total 2025\s*Retirado\s*-5\.000,00\s€/, /Total 2026\s*Retirado\s*-5\.000,00\s€/]);

  await types.getByRole('button', { name: 'Todos' }).click();
  await periods.getByRole('button', { name: '2026' }).click();
  await expect(totals).toHaveText([/Total 2026/]);

  await periods.getByRole('button', { name: 'Elegir periodo' }).click();
  await panel.getByLabel('Desde').selectOption('2025-12');
  await panel.getByLabel('Hasta').selectOption('2026-03');
  await expect(totals).toHaveText([/Total del periodo\s*Dic 2025 – Mar 2026.*\+50\.000,00\s€.*-10\.000,00\s€/]);
});

test('contributions in the patrimony chart are blue for every client', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const inflowFill = () => page.locator('.pm-trend-flow.is-in').first().evaluate((el) => getComputedStyle(el).fill);
  await mount(page, 'client-001');
  expect(await inflowFill()).toBe('rgb(37, 99, 235)');
  await mount(page, 'client-004');
  expect(await inflowFill()).toBe('rgb(37, 99, 235)');
});

test('charts draw themselves when they come into view, for every client', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, 'client-001');
  await expect(page.locator('[data-reveal]')).toHaveCount(4);
  const waterfall = page.locator('[data-reveal="waterfall"]');
  await waterfall.scrollIntoViewIfNeeded();
  await expect(waterfall).toHaveClass(/is-revealed/);
  // Los vasos se llenan hasta su altura y la superficie se mueve en ondas.
  await expect.poll(() => waterfall.locator('.report-pro-waterfall-bar span').first().evaluate((el) => el.getBoundingClientRect().height), { timeout: 10_000 }).toBeGreaterThan(40);
  expect(await waterfall.locator('.report-pro-waterfall-bar span').first().evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('liquidWave');

  // Explicacion final: 105.000 de 115.000 siguen invertidos (91 de cada 100) y 22.548 ganados sobre 100.000 aportados hasta el ultimo cierre (23 de cada 100).
  const explain = page.locator('.report-pro-explain-panel');
  await expect(explain).toContainText('De cada 100 € que pusiste, 91 € siguen trabajando para ti');
  await expect(explain).toContainText('Has retirado 10.000 € desde el inicio.');
  await expect(explain).not.toContainText('recuperado');
  await expect(explain).toContainText('Has ganado 23 € por cada 100 € que pusiste');
  await expect(explain).toContainText('Pusiste hasta el último cierre: 100.000 €');
  await expect(explain).toContainText('Lo que has aportado después del último cierre (15.000 €) cuenta a partir del próximo cierre.');

  await mount(page, 'client-004');
  await expect(page.locator('[data-reveal]')).toHaveCount(4);
  await expect(page.locator('.report-pro-explain-panel')).toHaveCount(1);
});
