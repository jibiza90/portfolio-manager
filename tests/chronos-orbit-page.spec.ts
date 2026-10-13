import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders Gemini 3.8 Chronos Orbit for Demo1 with real reconciled data', async ({ page }) => {
  await mountDemoReport(page);

  const pageElevenButton = page.getByRole('button', { name: 'Página 11' });
  await expect(pageElevenButton).toContainText('Gemini 3.8');
  await pageElevenButton.click();

  await expect(pageElevenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Chronos Orbit', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Órbita patrimonial' })).toBeVisible();
  await expect(page.locator('.chronos-core-card')).toContainText('127.548,34');
  await expect(page.locator('.chronos-core-card')).toContainText('+22.548,34');
  await expect(page.locator('.chronos-core-card')).toContainText('105.000,00');
  await expect(page.locator('.chronos-kpi-grid')).toContainText('+18,34 %');
  await expect(page.locator('.chronos-kpi-grid')).toContainText('+4,33 %');

  await expect(page.locator('.chronos-station')).toHaveCount(13);
  await expect(page.locator('.chronos-vector.is-injection')).toHaveCount(2);
  await expect(page.locator('.chronos-vector.is-extraction')).toHaveCount(2);
  await expect(page.locator('.chronos-pending-orbit')).toContainText('+15.000,00');
  await expect(page.locator('.chronos-probe')).toContainText('Marzo 2026');
  await expect(page.locator('.chronos-probe-equation')).toContainText('62.875,03');
  await expect(page.locator('.chronos-probe-equation')).toContainText('112.548,34');
  await expect(page.locator('.chronos-tranches')).toContainText('Aportación incorporada');
  await expect(page.locator('.chronos-tranches')).toContainText('Posición retirada');

  await page.getByRole('button', { name: /Enero 2026\. Saldo/ }).locator('.chronos-station-node').click();
  await expect(page.locator('.chronos-probe')).toContainText('Enero 2026');
  await expect(page.locator('.chronos-dial-controls')).toContainText('Enero 2026');

  const orbit = page.locator('.chronos-orbit-svg');
  await orbit.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.chronos-probe')).toContainText('Diciembre 2025');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.chronos-zoom')).toContainText('105%');

  await page.getByRole('button', { name: 'Año 2026' }).click();
  await page.getByRole('button', { name: 'Ver formato tabular' }).click();
  await expect(page.locator('.chronos-linear-row')).toHaveCount(4);
  await expect(page.locator('.chronos-linear-table')).toContainText('Marzo 2026');
  await page.getByRole('button', { name: 'Volver a la órbita' }).click();
  await expect(page.locator('.chronos-orbit-svg')).toBeVisible();

  await expect(page.locator('.chronos-audit-footer')).toContainText('Cuadre exacto al céntimo');
  await expect(page.locator('.chronos-flow-grid article')).toHaveCount(5);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
  const mobileRootIsStable = await page.evaluate(() => {
    const root = document.querySelector('.client-portal-page');
    const report = document.querySelector('.chronos-report');
    return (root?.scrollLeft ?? 0) === 0 && (report?.getBoundingClientRect().left ?? 0) >= 0;
  });
  expect(mobileRootIsStable).toBe(true);
});
