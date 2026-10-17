import { expect, test } from '@playwright/test';

const mountReport = async (page: import('@playwright/test').Page, monthCount = 13, clientId = 'client-001') => {
  await page.goto('/');
  await page.evaluate(async ({ modulePath, count, requestedClientId }) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(count, requestedClientId);
  }, { modulePath: '/tests/fixtures/report-view-harness.tsx', count: monthCount, requestedClientId: clientId });
};

const mountStressReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountContinuumStressReport();
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('keeps PDF designs isolated and renders ATLAS from real report data', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'The complete PDF studio is covered once on a representative large viewport.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountReport(page);

  await page.getByRole('tab', { name: /Diseños PDF/i }).click();
  await expect(page.locator('.pdf-studio')).toBeVisible();
  await expect(page.locator('.demo-report-page-switcher')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /PDF 2/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pdf2-document-page')).toHaveCount(4);
  await expect(page.locator('.pdf2-cover-page')).toContainText('112.548,34');
  await expect(page.locator('.pdf2-cover-page')).toContainText('Mar 2025 - Mar 2026');
  await expect(page.locator('.pdf2-monthly-table .pdf2-table-row')).toHaveCount(14);
  await expect(page.locator('.pdf2-movement-table .pdf2-table-row')).toHaveCount(5);
  await expect(page.locator('.pdf2-closing-page')).toContainText('TWR');

  await page.getByRole('button', { name: 'Pagina siguiente' }).click();
  await expect(page.locator('.pdf-studio-pagination')).toContainText('2');
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(page.locator('.pdf-studio-actions')).toContainText('%');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('informe-atlas-demo1');

  await page.getByRole('tab', { name: /PDF 1/i }).click();
  await expect(page.locator('.pdf1-preview iframe')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('tab', { name: /Páginas del portal/i }).click();
  await expect(page.locator('.demo-report-page-switcher')).toBeVisible();
  await expect(page.locator('.pdf-studio')).toHaveCount(0);
});

test('contains the PDF studio on a phone without changing non-demo clients', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'The compact PDF selector is checked on one representative phone.');
  await mountReport(page);
  await page.getByRole('tab', { name: /Diseños PDF/i }).click();
  await expect(page.locator('.pdf-studio')).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflows).toBe(false);
  await expect(page.locator('.pdf2-document-page').first()).toBeVisible();

  await mountReport(page, 13, 'client-007');
  await expect(page.locator('.demo-report-mode-switcher')).toHaveCount(0);
  await expect(page.locator('.pdf-studio')).toHaveCount(0);
});

test('paginates a 48-month history without overflowing A4 pages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Long PDF pagination is covered once on a representative large viewport.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountStressReport(page);
  await page.getByRole('tab', { name: /Diseños PDF/i }).click();

  await expect(page.locator('.pdf2-document-page')).toHaveCount(6);
  await expect(page.locator('.pdf2-monthly-table .pdf2-table-row')).toHaveCount(51);
  await expect(page.locator('.pdf2-closing-page')).toContainText('04 / CRITERIO');

  const pageOverflows = await page.locator('.pdf2-document-page').evaluateAll((pages) => pages.map((node) => {
    const pageRect = node.getBoundingClientRect();
    const footerTop = node.querySelector<HTMLElement>('.pdf2-page-footer')!.getBoundingClientRect().top - pageRect.top;
    const content = node.querySelector<HTMLElement>('.pdf2-page-content')!;
    const maxBottom = Math.max(...Array.from(content.querySelectorAll<HTMLElement>('*')).map((child) => child.getBoundingClientRect().bottom - pageRect.top));
    return maxBottom > footerTop + 1;
  }));
  expect(pageOverflows).not.toContain(true);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('informe-atlas-demo1');
});
