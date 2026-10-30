import { expect, test, type Page } from '@playwright/test';

// Pinta el informe de demo1, un boton "Información fiscal" como el de la cabecera y la visita guiada.
const mountTour = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.removeItem('jigsa-news-tour-seen'));
  await page.evaluate(async ({ harnessPath }) => {
    const harness = await import(/* @vite-ignore */ harnessPath);
    harness.mountReportView(13, 'client-001', true);
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
  }, { harnessPath: '/tests/fixtures/report-view-harness.tsx' });
};

const bubble = (page: Page) => page.getByRole('dialog', { name: 'Novedades de la web' });

test('news tour walks through every new feature and is not shown again after finishing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 900 });
  await mountTour(page);

  await expect(bubble(page)).toContainText('1 de 5');
  await expect(bubble(page)).toContainText('Rentabilidad total más clara');
  await expect(page.locator('.nt-spot')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(bubble(page)).toContainText('Nuevo gráfico de tu patrimonio');
  await expect(page.locator('.nt-spot')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(bubble(page)).toContainText('Rentabilidad de cada retirada');
  await expect(bubble(page).getByRole('button', { name: 'Probar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(bubble(page)).toContainText('Justificante de cada movimiento');

  // "Probar" abre el justificante; la visita se esconde y vuelve al cerrarlo.
  await bubble(page).getByRole('button', { name: 'Probar' }).click();
  await expect(page.getByRole('dialog', { name: 'Justificante de operación' })).toBeVisible();
  await expect(bubble(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(bubble(page)).toContainText('4 de 5');

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

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(bubble(page)).toContainText('Información fiscal');
  await bubble(page).getByRole('button', { name: 'Probar' }).click();
  expect(await page.evaluate(() => (window as unknown as { fiscalClicks?: number }).fiscalClicks)).toBe(1);

  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(bubble(page)).toContainText('Justificante de cada movimiento');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: '¡Entendido!' }).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('jigsa-news-tour-seen'))).toBe('2026-10');
  const { hasSeen } = await page.evaluate(async () => {
    const module = await import('/src/components/NewsTour.tsx' as string);
    return { hasSeen: module.hasSeenNewsTour() };
  });
  expect(hasSeen).toBe(true);
});

test('news tour can be skipped and shows as a bottom card on phones', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 800 });
  await mountTour(page);
  await expect(bubble(page)).toContainText('1 de 5');
  const box = await bubble(page).boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(760);
  expect(box!.x).toBeGreaterThanOrEqual(10);
  expect(box!.x + box!.width).toBeLessThanOrEqual(380);

  await page.getByRole('button', { name: 'Saltar ✕' }).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('jigsa-news-tour-seen'))).toBe('2026-10');
});
