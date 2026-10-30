import { expect, test, type Page } from '@playwright/test';

// Demostracion /invitado: datos ficticios, sin base de datos y con marca de agua en los PDF.

const openGuest = async (page: Page, skipIntro = true) => {
  if (skipIntro) await page.addInitScript(() => window.localStorage.setItem('jigsa-guest-intro-seen', '1'));
  await page.goto('/invitado/');
  await expect(page.getByRole('heading', { name: 'Área Cliente' })).toBeVisible();
};

test('guest demo opens with the presentation, never talks to the database and walks through every section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(180_000);
  const databaseRequests: string[] = [];
  page.on('request', (request) => {
    if (/firestore|identitytoolkit|securetoken|firebase/i.test(request.url())) databaseRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1300, height: 900 });
  await openGuest(page, false);

  const intro = page.getByRole('dialog', { name: 'Cómo funciona' });
  await expect(intro).toContainText('1 de 5');
  for (let step = 0; step < 4; step += 1) await intro.getByRole('button', { name: 'Siguiente' }).click();
  await expect(intro).toContainText('Todo documentado');
  await intro.getByRole('button', { name: 'Ver la web por dentro' }).click();

  const tour = page.getByRole('dialog', { name: 'Visita guiada' });
  await expect(tour).toContainText('1 de 11', { timeout: 20_000 });
  await expect(tour).toContainText('Tamaño de letra');
  const titles: string[] = [];
  for (let step = 0; step < 11; step += 1) {
    titles.push((await tour.locator('.nt-title').innerText()).trim());
    await tour.getByRole('button', { name: step === 10 ? '¡Entendido!' : 'Siguiente' }).click();
  }
  expect(titles).toEqual([
    'Tamaño de letra', 'Tu resumen', 'Movimientos en curso', 'Tu capital y tu beneficio', 'Evolución de tu patrimonio', 'Mes a mes',
    'Justificante de cada movimiento', 'Qué ocurrió con cada aportación', 'Tu informe en PDF', 'Información fiscal', 'Mensajes con administración'
  ]);
  await expect(tour).toHaveCount(0);

  // La presentacion ya no vuelve a salir sola, pero se puede abrir desde el aviso.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Área Cliente' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Cómo funciona' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cómo funciona' }).click();
  await expect(page.getByRole('dialog', { name: 'Cómo funciona' })).toBeVisible();
  await page.getByRole('button', { name: 'Saltar ✕' }).click();

  expect(databaseRequests).toEqual([]);
});

test('guest withdrawal receipt shows the 8 % commission and the documents carry the watermark', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1300, height: 900 });
  await openGuest(page);

  await expect(page.locator('.report-pro-pending-cash')).toContainText('+5.000,00 €');
  await page.getByRole('button', { name: 'Descargar justificante de la retirada del 20/03/2026' }).click();
  const receipt = page.getByRole('dialog', { name: 'Justificante de operación' });
  await expect(receipt.locator('.mr-compact')).toContainText('Comisión de éxito (8 %)');
  await expect(receipt.locator('.mr-compact')).toContainText('240,00 €');
  await expect(receipt.locator('.mr-compact .mr-total')).toContainText('37.760,00 €');
  await expect(receipt.locator('.mr-compact')).toContainText('Laura Martín Vidal');
  const download = page.waitForEvent('download');
  await receipt.getByRole('button', { name: 'Descargar resumido' }).click();
  expect((await download).suggestedFilename()).toBe('justificante-retirada-2026-03-20-invitado-resumido.pdf');
  await receipt.getByRole('button', { name: 'Cerrar' }).click();

  // La marca de agua se escribe en cada pagina del PDF.
  const watermark = await page.evaluate(async () => {
    const { jsPDF } = await import('/node_modules/.vite/deps/jspdf.js' as string);
    const { applyPdfWatermark } = await import('/src/utils/pdfWatermark.ts' as string);
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
    doc.addPage();
    applyPdfWatermark(doc);
    return (doc.output() as string).split('(EJEMPLO)').length - 1;
  });
  expect(watermark).toBe(2);

  await page.getByRole('button', { name: 'Información fiscal' }).click();
  const fiscal = page.getByRole('dialog', { name: 'Información fiscal' });
  await expect(fiscal.locator('.ar-years button')).toHaveText(['2026Provisional', '2025']);
  await fiscal.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByRole('button', { name: 'Mensajes' }).click();
  await expect(page.locator('.gx-messages')).toContainText('recibirás 37.760 €');
  await expect(page.locator('.gx-messages textarea')).toBeDisabled();
});
