import { expect, test, type Page } from '@playwright/test';

// Ninguna cifra de 4 cifras sin punto de miles ("3077,62 €" debe ser "3.077,62 €").
const findUngroupedAmounts = () => {
  const text = document.body.innerText;
  const matches = text.match(/(?:^|[^\d.,])[+\-−]?\d{4}(?:,\d{1,2})?\s?€/g) ?? [];
  return [...new Set(matches.map((item) => item.trim()))];
};

const expandEverything = async (page: Page) => {
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-revealed')));
  await page.waitForTimeout(400);
};

test('demo1 report shows every amount with a thousands separator', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(async () => {
    const harness = await import(/* @vite-ignore */ '/tests/fixtures/report-view-harness.tsx' as string);
    harness.mountReportView(13, 'client-001', true);
  });
  await expect(page.locator('.report-pro-explain-panel')).toBeVisible();
  await expandEverything(page);
  expect(await page.evaluate(findUngroupedAmounts)).toEqual([]);
});

test('guest demo shows every amount with a thousands separator', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.setItem('jigsa-guest-intro-seen', '1'));
  await page.goto('/invitado/');
  await expect(page.locator('[data-tour="patrimonio"]')).toBeVisible();
  await expandEverything(page);
  expect(await page.evaluate(findUngroupedAmounts)).toEqual([]);
});

test('demo1 total return is calculated over everything contributed and explains the change', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(async () => {
    window.localStorage.removeItem('jigsa-total-return-notice');
    const harness = await import(/* @vite-ignore */ '/tests/fixtures/report-view-harness.tsx' as string);
    harness.mountReportView(13, 'client-001', true);
  });
  const card = page.locator('[data-tour="rentabilidad"]');
  // Beneficio 22.548,34 € sobre 100.000 € aportados = +22,55 %.
  await expect(card.locator('strong')).toHaveText('+22.55%');
  await expect(page.locator('.report-pro-explain-panel')).toContainText('Es tu rentabilidad total: +22.55%');
  await expect(page.locator('.report-pro-note')).toContainText('Lo que has ganado sobre todo lo que has aportado desde el inicio');
});

test('demo1 explains the new total return once to clients whose figure changes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Cifra antigua distinta (como un cliente que ha retirado dinero).
  await page.evaluate(async () => {
    window.localStorage.removeItem('jigsa-total-return-notice');
    const harness = await import(/* @vite-ignore */ '/tests/fixtures/report-view-harness.tsx' as string);
    harness.mountReportView(13, 'client-001', true, { rentabilidad: 25.05 });
  });
  const badge = page.getByRole('button', { name: 'Nuevo cálculo' });
  await expect(badge).toBeVisible();
  await badge.click();
  const notice = page.getByRole('dialog', { name: 'Nuevo cálculo de la rentabilidad total' });
  await expect(notice).toContainText('+25.05%');
  await expect(notice).toContainText('+22.55%');
  await expect(notice).toContainText('Tu dinero y tu beneficio no cambian');
  await notice.getByRole('button', { name: 'Entendido' }).click();
  await expect(notice).toHaveCount(0);
  await expect(badge).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('jigsa-total-return-notice'))).toBe('1');
});
