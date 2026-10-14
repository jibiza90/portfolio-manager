import { expect, test } from '@playwright/test';

test('shows unpublished cash movements for a regular client', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13, 'client-007');
  }, '/tests/fixtures/report-view-harness.tsx');

  const pendingSection = page.getByLabel('Movimientos de capital posteriores al ultimo cierre');
  await expect(pendingSection).toBeVisible();
  await expect(pendingSection).toContainText('15.000,00');
  await expect(pendingSection).toContainText('127.548,34');
});
