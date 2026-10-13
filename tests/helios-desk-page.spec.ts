import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders GLM 5.3MAX HELIOS with real reconciled portfolio data', async ({ page }) => {
  await mountDemoReport(page);

  const pageThirteenButton = page.getByRole('button', { name: 'Página 13' });
  await expect(pageThirteenButton).toContainText('GLM 5.3MAX');
  await pageThirteenButton.click();

  await expect(pageThirteenButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'HELIOS' })).toBeVisible();
  await expect(page.locator('.helios-rail')).toContainText('127.548,34');
  await expect(page.locator('.helios-rail')).toContainText('+22.548,34');
  await expect(page.locator('.helios-rail')).toContainText('+18,34 %');
  await expect(page.locator('.helios-pending')).toContainText('+15.000,00');
  await page.locator('.helios-kpi').first().hover();
  await expect(page.locator('.helios-help-tooltip')).toBeVisible();

  await expect(page.locator('.helios-chart-line')).toHaveAttribute('d', /M/);
  await expect(page.locator('.helios-point')).toHaveCount(13);
  await expect(page.locator('.helios-flow.is-increment')).toHaveCount(2);
  await expect(page.locator('.helios-flow.is-decrement')).toHaveCount(2);
  await expect(page.locator('.helios-chart-hud')).toContainText('Marzo 2026');
  await expect(page.locator('.helios-chart-hud')).toContainText('112.548,34');
  await expect(page.locator('.helios-histogram button')).toHaveCount(13);
  await expect(page.locator('.helios-table-row')).toHaveCount(13);
  const mobileHistoryToggle = page.locator('.helios-mobile-history-toggle');
  await expect(mobileHistoryToggle).toContainText('13 cierres');
  if (await mobileHistoryToggle.isVisible()) {
    await mobileHistoryToggle.click();
    await expect(mobileHistoryToggle).toHaveAttribute('aria-expanded', 'true');
  }

  await page.getByRole('button', { name: '6 meses', exact: true }).click();
  await expect(page.locator('.helios-point')).toHaveCount(6);
  await expect(page.locator('.helios-table-row')).toHaveCount(6);

  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await page.locator('.helios-table-row').first().click();
  await expect(page.locator('.helios-breakdown')).toContainText('Conciliado');
  await expect(page.locator('.helios-breakdown')).toContainText('Posición inicial del mes');
  await expect(page.locator('.helios-breakdown')).toContainText('Aportación incorporada');
  await expect(page.locator('.helios-breakdown')).toContainText('Posición retirada');

  const chart = page.locator('.helios-chart');
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.helios-chart-hud')).toContainText('Febrero 2026');

  await page.getByRole('button', { name: '⛶ Ampliar' }).click();
  await expect(page.locator('.helios-custody')).toHaveClass(/is-fullscreen/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('.helios-custody')).not.toHaveClass(/is-fullscreen/);

  await expect(page.locator('.helios-footer')).toContainText('105.000,00');
  await expect(page.locator('.helios-footer')).toContainText('127.548,34');
  await expect(page.locator('.helios-footer')).toContainText('GLM 5.3MAX');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
