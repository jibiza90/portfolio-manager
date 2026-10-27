import { expect, test } from '@playwright/test';

const mountDemoReport = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13);
  }, '/tests/fixtures/report-view-harness.tsx');
};

test('renders page 20 as the full-width professional edition of page 1', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageTwentyButton = page.locator('[aria-label$="20"]');
  await expect(pageTwentyButton).toContainText('CODEX');
  await pageTwentyButton.click();

  await expect(pageTwentyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Investment Report' })).toBeVisible();
  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.report-pro-bar-col')).toHaveCount(13);
  await expect(page.locator('.pm-trend-month')).toHaveCount(13);

  const reportWidth = await page.locator('.report-pro-wide-sheet').evaluate((element) => element.getBoundingClientRect().width);
  expect(reportWidth).toBeGreaterThan(1320);

  // Con 13 meses en escritorio caben todos, sin barra lateral.
  const patrimonySection = page.locator('.report-pro-wide-sheet .report-pro-patrimony-section').last();
  await patrimonySection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await expect(patrimonySection.locator('.pm-trend-scroll')).not.toHaveClass(/is-scrollable/);
  await expect(patrimonySection.locator('.pm-trend-yaxis text').first()).toBeVisible();
  const visibleMonths = await patrimonySection.evaluate((root) => {
    const scroller = root.querySelector('.pm-trend-scroll');
    if (!scroller) return [];
    const viewport = scroller.getBoundingClientRect();
    return [...root.querySelectorAll('.pm-trend-month')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= viewport.left && rect.right <= viewport.right;
      })
      .map((element) => element.textContent);
  });
  expect(visibleMonths).toHaveLength(13);
  expect(visibleMonths.at(-1)).toBe('Mar 2026');

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('uses the page 20 layout on demo page 1', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);

  const pageOneButton = page.getByRole('button', { name: 'Página 1', exact: true });
  await expect(pageOneButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.report-pro-bar-col')).toHaveCount(13);
  // La pagina 1 de demo1 prueba el nuevo grafico de patrimonio con todos los meses visibles.
  await expect(page.locator('.pm-trend')).toBeVisible();
  await expect(page.locator('.pm-trend-month')).toHaveCount(13);
  await expect(page.locator('.pm-trend-scroll')).not.toHaveClass(/is-scrollable/);
  await expect(page.locator('.report-pro-dot-hit')).toHaveCount(0);
});

test('shows the contribution journey only when the client module is enabled', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13, 'client-007', true);
  }, '/tests/fixtures/report-view-harness.tsx');

  const module = page.locator('.report-pro-contribution-journey');
  await expect(module).toBeVisible();
  await expect(module.getByRole('heading', { name: 'Qué ocurrió con cada aportación' })).toBeVisible();
  await expect(module.locator('.contribution-journey-map > button')).toHaveCount(3);
  await expect(module.locator('.contribution-journey-withdrawal-list > div')).toHaveCount(2);
  await expect(module.locator('.contribution-journey-detail')).toContainText('40.000,00 €');

  const movementPanel = page.getByRole('heading', { name: 'Capital aportado y retirado' }).locator('..').locator('..');
  const journeyFollowsMovements = await page.evaluate(([movements, journey]) => (
    Boolean(movements.compareDocumentPosition(journey) & Node.DOCUMENT_POSITION_FOLLOWING)
  ), [await movementPanel.elementHandle(), await module.elementHandle()]);
  expect(journeyFollowsMovements).toBe(true);

  await module.getByRole('button', { name: 'Con retiradas' }).click();
  await expect(module.locator('.contribution-journey-map > button')).toHaveCount(1);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});

test('allocates withdrawals to the oldest contribution before moving to the next one', async ({ page }) => {
  await page.goto('/');
  const lots = await page.evaluate(async (modulePath) => {
    const { buildCapitalModel } = await import(/* @vite-ignore */ modulePath);
    const report = {
      clientId: 'fifo-test',
      clientName: 'FIFO Test',
      clientCode: 'fifo-test',
      incrementos: 70000,
      decrementos: 35000,
      saldo: 35000,
      beneficioTotal: 0,
      rentabilidad: 0,
      beneficioUltimoMes: 0,
      rentabilidadUltimoMes: 0,
      twrYtd: 0,
      monthlyStats: [],
      patrimonioEvolution: [],
      movements: [
        { iso: '2026-01-10', type: 'increment', amount: 30000, balance: 30000 },
        { iso: '2026-02-10', type: 'increment', amount: 40000, balance: 70000 },
        { iso: '2026-03-10', type: 'decrement', amount: 35000, balance: 35000 }
      ],
      contributionBreakdowns: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000
    };
    return buildCapitalModel(report, [], []).lots.map((lot: {
      allocatedWithdrawal: number;
      remainingCapital: number;
      withdrawalAllocations: Array<{ amount: number }>;
    }) => ({
      allocatedWithdrawal: lot.allocatedWithdrawal,
      remainingCapital: lot.remainingCapital,
      allocationAmounts: lot.withdrawalAllocations.map((allocation) => allocation.amount)
    }));
  }, '/src/components/CapitalFlowReportPage.tsx');

  expect(lots).toEqual([
    { allocatedWithdrawal: 30000, remainingCapital: 0, allocationAmounts: [30000] },
    { allocatedWithdrawal: 5000, remainingCapital: 35000, allocationAmounts: [5000] }
  ]);
});

test('uses page 20 as the standard client report with annual closing totals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(async (modulePath) => {
    const harness = await import(/* @vite-ignore */ modulePath);
    harness.mountReportView(13, 'client-007');
  }, '/tests/fixtures/report-view-harness.tsx');

  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.demo-report-page-switcher')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cierres y composición del resultado' })).toBeVisible();

  const kpiLabels = await page.locator('.report-pro-kpis-demo > .report-pro-kpi > span').allTextContents();
  expect(kpiLabels).toEqual([
    'Capital aportado',
    'TWR acumulado',
    'Beneficio acumulado',
    'Capital retirado',
    'Rentabilidad total'
  ]);

  const headers = await page.locator('.report-pro-closing-table thead th').allTextContents();
  expect(headers).toEqual([
    '',
    'Mes',
    'Saldo inicial',
    'Aportaciones',
    'Retiradas',
    'Resultado',
    'Rentabilidad',
    'Saldo final'
  ]);

  const yearlyTotals = page.locator('.report-pro-closing-year-total');
  await expect(yearlyTotals).toHaveCount(2);
  await expect(yearlyTotals.nth(0)).toContainText('Total 2025');
  await expect(yearlyTotals.nth(1)).toContainText('Total 2026');
  await expect.poll(() => page.locator('.report-pro-closing-scroll').evaluate((element) => (
    Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1
  ))).toBe(true);

  await page.getByRole('button', { name: 'Ver detalle de Mar 2026' }).click();
  await expect(page.locator('#report-month-detail-monthly-2026-03')).toBeVisible();

  const positiveBarStyle = await page.locator('.report-pro-bar.positive').first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor };
  });
  expect(positiveBarStyle.backgroundImage).toBe('none');
  expect(positiveBarStyle.backgroundColor).toBe('rgb(22, 163, 74)');
});

test('keeps the expanded page 20 patrimony chart aligned and fully labelled', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountDemoReport(page);
  await page.locator('[aria-label$="20"]').click();
  await page.locator('.report-pro-wide-sheet .report-pro-expand-chart-button').click();

  const overlay = page.locator('.report-pro-chart-overlay');
  const monthRow = overlay.locator('.report-pro-month-row-expanded');
  await expect(monthRow).toBeVisible();
  await expect(monthRow.locator('span')).toHaveCount(13);
  await expect(overlay.locator('.report-pro-month-guide')).toHaveCount(13);

  const fitsOverlay = await overlay.evaluate((root) => {
    const section = root.querySelector('.report-pro-patrimony-section');
    const row = root.querySelector('.report-pro-month-row-expanded');
    if (!section || !row) return false;
    return row.getBoundingClientRect().bottom <= section.getBoundingClientRect().bottom + 1;
  });
  expect(fitsOverlay).toBe(true);
});

test('keeps page 20 usable on compact screens', async ({ page }) => {
  await mountDemoReport(page);
  await page.locator('[aria-label$="20"]').click();

  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await expect(page.locator('.report-pro-chart-toolbar select')).toBeVisible();
  await expect(page.locator('.report-pro-expand-chart-button')).toBeVisible();
  await expect.poll(() => page.locator('.report-pro-chart-scroll').evaluate((element) => (
    Math.abs(element.scrollWidth - element.clientWidth - element.scrollLeft) <= 20
  ))).toBe(true);

  const hasHorizontalPageOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  expect(hasHorizontalPageOverflow).toBe(false);
});
