import { expect, test, type Page } from '@playwright/test';

// Pinta el informe de un cliente normal, un boton "Información fiscal" como el de la cabecera y la visita guiada.
// (En esta prueba no esta la barra de tamaño de letra, asi que ese paso no sale.)
const mountTour = async (page: Page, { clientId = 'client-004', journey = true } = {}) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.removeItem('jigsa-news-tour-seen'));
  await page.evaluate(async ({ harnessPath, id, showJourney }) => {
    const harness = await import(/* @vite-ignore */ harnessPath);
    harness.mountReportView(13, id, showJourney);
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { NewsTour } = await import('/src/components/NewsTour.tsx' as string);
    const fiscal = document.createElement('button');
    fiscal.dataset.tour = 'fiscal';
    fiscal.textContent = 'Información fiscal';
    fiscal.onclick = () => { (window as unknown as { fiscalClicks: number }).fiscalClicks = ((window as unknown as { fiscalClicks?: number }).fiscalClicks ?? 0) + 1; };
    document.body.prepend(fiscal);
    const host = document.createElement('div');
    host.id = 'tour-host';
    document.body.appendChild(host);
    const tourRoot = createRoot(host);
    const close = () => { tourRoot.render(null); (window as unknown as { tourClosed: boolean }).tourClosed = true; };
    tourRoot.render(React.createElement(NewsTour, { onClose: close }));
  }, { harnessPath: '/tests/fixtures/report-view-harness.tsx', id: clientId, showJourney: journey });
};

const bubble = (page: Page) => page.getByRole('dialog', { name: 'Novedades de la web' });
const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

const TITLES = [
  'Información fiscal',
  'Rentabilidad total más clara',
  'Cierres mensuales por año',
  'Beneficios mensuales renovados',
  'Nuevo gráfico de tu patrimonio',
  'Aportaciones y retiradas',
  'Justificante de cada movimiento',
  'Rentabilidad de cada retirada',
  'Cómo se forma tu saldo',
  'De cada 100 €…'
];

test('news tour walks through every new feature and is not shown again after finishing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 900 });
  await mountTour(page);

  await expect(bubble(page)).toContainText(`1 de ${TITLES.length}`);
  await expect(bubble(page)).toContainText(TITLES[0]);
  await bubble(page).getByRole('button', { name: 'Probar' }).click();
  expect(await page.evaluate(() => (window as unknown as { fiscalClicks?: number }).fiscalClicks)).toBe(1);

  for (let index = 1; index < TITLES.length; index += 1) {
    await next(page);
    await expect(bubble(page)).toContainText(`${index + 1} de ${TITLES.length}`);
    await expect(bubble(page)).toContainText(TITLES[index]);
    await expect(page.locator('.nt-spot')).toBeVisible();
    if (TITLES[index] !== 'Justificante de cada movimiento') continue;

    // "Probar" abre el justificante; la visita se esconde y vuelve al cerrarlo.
    await bubble(page).getByRole('button', { name: 'Probar' }).click();
    await expect(page.getByRole('dialog', { name: 'Justificante de operación' })).toBeVisible();
    await expect(bubble(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(bubble(page)).toContainText(TITLES[index]);

    // El globo apunta al boton de la tabla: queda pegado a el.
    const target = await page.locator('[data-tour="justificante"]').first().boundingBox();
    const box = await bubble(page).boundingBox();
    expect(target && box).toBeTruthy();
    const distance = Math.min(Math.abs(box!.y - (target!.y + target!.height)), Math.abs(box!.y + box!.height - target!.y));
    expect(distance).toBeLessThan(40);

    // Si el cliente mueve la pagina y el apartado deja de verse, el globo sigue dentro de la pantalla.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => {
      const moved = await bubble(page).boundingBox();
      return Boolean(moved && moved.y >= 0 && moved.y + moved.height <= 900);
    }).toBe(true);
  }

  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(bubble(page)).toContainText(TITLES[TITLES.length - 2]);
  await next(page);
  await page.getByRole('button', { name: '¡Entendido!' }).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('jigsa-news-tour-seen'))).toBe('2026-11');
  const { hasSeen } = await page.evaluate(async () => {
    const module = await import('/src/components/NewsTour.tsx' as string);
    return { hasSeen: module.hasSeenNewsTour() };
  });
  expect(hasSeen).toBe(true);
});

test('news tour leaves out the withdrawals step for clients without that module', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 900 });
  await mountTour(page, { journey: false });
  const titles = TITLES.filter((title) => title !== 'Rentabilidad de cada retirada');
  await expect(bubble(page)).toContainText(`1 de ${titles.length}`);
  for (let index = 1; index < titles.length; index += 1) {
    await next(page);
    await expect(bubble(page)).toContainText(titles[index]);
  }
});

test('news tour can be skipped and shows as a bottom card on phones', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 800 });
  await mountTour(page);
  await expect(bubble(page)).toContainText(`1 de ${TITLES.length}`);
  const box = await bubble(page).boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(760);
  expect(box!.x).toBeGreaterThanOrEqual(10);
  expect(box!.x + box!.width).toBeLessThanOrEqual(380);

  await page.getByRole('button', { name: 'Saltar ✕' }).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('jigsa-news-tour-seen'))).toBe('2026-11');
});
