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
