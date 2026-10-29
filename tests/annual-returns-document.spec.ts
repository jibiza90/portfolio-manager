import { expect, test } from '@playwright/test';

// Monta el panel del Informe anual de rendimientos con N meses del mismo año y comprueba la maquetacion.
const mountPanel = async (page: import('@playwright/test').Page, monthCount: number, withdrawals: number) => {
  await page.goto('/');
  await page.evaluate(async ({ monthCount: count, withdrawals: outs }) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { AnnualReturnsPanel } = await import('/src/components/AnnualReturns.tsx' as string);
    const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyStats = [];
    const movements = [{ iso: '2020-01-01', type: 'increment', amount: 100000 }];
    let balance = 100000;
    for (let index = 0; index < count; index += 1) {
      const year = 2020 + Math.floor(index / 12);
      const month = index % 12;
      if (index > 0 && index <= outs) {
        movements.push({ iso: `${year}-${String(month + 1).padStart(2, '0')}-15`, type: 'decrement', amount: 1000 });
        balance -= 1000;
      }
      const profit = balance * 0.02;
      balance += profit;
      monthlyStats.push({ month: `${names[month]} ${year}`, profit, profitPct: 2, endBalance: balance, hasData: true });
    }
    const root = document.getElementById('root')!;
    root.innerHTML = '';
    createRoot(root).render(React.createElement(AnnualReturnsPanel, {
      source: { monthlyStats, movements, saldo: balance, incrementos: 100000, decrementos: outs * 1000, beneficioTotal: balance - 100000 + outs * 1000 },
      commissions: { rate: 0.05, paidWithdrawalIsos: [] },
      holderName: 'Cliente de prueba',
      clientCode: 'demo1',
      clientId: 'client-001'
    }));
  }, { monthCount, withdrawals });
  await expect(page.locator('.ar-page').first()).toBeVisible();
};

const pagesOverflow = (page: import('@playwright/test').Page) => page.locator('.ar-page').evaluateAll((pages) => pages.map((node) => {
  const footerTop = node.querySelector<HTMLElement>('.ar-foot')!.getBoundingClientRect().top;
  const body = node.querySelector<HTMLElement>('.ar-body')!;
  return Math.max(...Array.from(body.querySelectorAll<HTMLElement>('*')).map((child) => child.getBoundingClientRect().bottom)) > footerTop + 1;
}));

test('annual returns document never runs into the footer, with few or many rows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Layout is checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 1100 });
  for (const [months, outs] of [[2, 1], [9, 6], [12, 11], [40, 39]] as const) {
    await mountPanel(page, months, outs);
    await page.getByLabel('Todo lo ganado en el año').check();
    expect(await pagesOverflow(page)).not.toContain(true);
    await page.getByLabel('Solo lo retirado').check();
    expect(await pagesOverflow(page)).not.toContain(true);
    await expect(page.locator('.ar-notice')).toHaveCount(1);
    await expect(page.locator('.ar-marks img')).toHaveCount(2);
  }
});

test('requires accepting the notice before downloading the annual returns PDF', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Download is checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 1100 });
  await mountPanel(page, 18, 3);
  // Se puede elegir cualquier año con cierres publicados; el que no tiene diciembre sale como provisional.
  await expect(page.locator('.ar-years button')).toHaveText(['2021Provisional', '2020']);
  await expect(page.getByRole('button', { name: /2021/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2020' }).click();
  await expect(page.getByRole('button', { name: '2020' })).toHaveAttribute('aria-pressed', 'true');
  const download = page.getByRole('button', { name: 'Descargar PDF' });
  await expect(download).toBeDisabled();
  await page.getByLabel(/He leído y acepto el aviso/).check();
  await expect(download).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await download.click();
  expect((await downloadPromise).suggestedFilename()).toBe('informe-rendimientos-2020-demo1.pdf');
});
