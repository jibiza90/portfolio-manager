import { expect, test, type Page } from '@playwright/test';

// Monta la pestaña "Retiradas" con datos de prueba y un guardado en memoria (no toca Firebase).
const mountView = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { AdminWithdrawalsView } = await import('/src/components/AdminWithdrawals.tsx' as string);
    const clients = [
      { id: 'client-030', label: 'Ana Prueba' },
      { id: 'client-031', label: 'Bruno Prueba' },
      { id: 'client-032', label: 'Carla Prueba' }
    ];
    const movementsByClient = {
      'client-030': { '2026-10-15': { decrement: 500 }, '2026-10-01': { increment: 20000 } },
      'client-031': { '2026-11-03': { decrement: 2000 }, '2026-11-16': { decrement: 300 } },
      'client-032': { '2026-01-10': { increment: 10000 } }
    };
    let state = {
      rules: [
        { id: 'a', clientId: 'client-030', amount: 500, day: 15, active: true, startMonth: '2026-10', createdAt: 0, updatedAt: 0 },
        { id: 'b', clientId: 'client-031', amount: 400, day: 16, active: true, startMonth: '2026-11', createdAt: 0, updatedAt: 0 }
      ],
      checks: {} as Record<string, { checkedAt: number }>
    };
    const root = createRoot(document.getElementById('root')!);
    const render = () => root.render(React.createElement(AdminWithdrawalsView, {
      clients,
      movementsByClient,
      state,
      todayIso: '2026-11-18',
      onUpdate: async (change: (current: typeof state) => typeof state) => {
        state = change(state);
        (window as unknown as { savedState: typeof state }).savedState = state;
        render();
      }
    }));
    render();
  });
};

test('withdrawals tab: pending, tick, add a fixed withdrawal and month list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1300, height: 1000 });
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await mountView(page);

  // Ana: 15/11 cae en domingo -> lunes 16, sin apuntar -> atrasada. Bruno: apuntados 300 € en vez de 400 €.
  const pending = page.locator('section', { has: page.getByRole('heading', { name: 'Pendientes' }) });
  await expect(pending.locator('.aw-item')).toHaveCount(2);
  await expect(pending).toContainText('Ana Prueba · 500,00 €');
  await expect(pending).toContainText('Pendiente desde el lun 16/11');
  await expect(pending).toContainText('Apuntada 300,00 € el lun 16/11 (la fija es de 400,00 €)');

  await pending.locator('.aw-item', { hasText: 'Ana Prueba' }).getByRole('button', { name: 'Hecha ✓' }).click();
  await expect(pending.locator('.aw-item')).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys((window as unknown as { savedState: { checks: object } }).savedState.checks))).toEqual(['a|2026-11']);

  // Añadir una fija nueva.
  await page.getByRole('button', { name: '+ Añadir' }).click();
  await page.getByLabel('Cliente').selectOption('client-032');
  await page.getByLabel('Cantidad (€)').fill('750,50');
  await page.getByLabel('Día del mes').fill('5');
  await expect(page.getByLabel('Empieza en')).toHaveValue('2026-12');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  const rules = page.locator('section', { has: page.getByRole('heading', { name: 'Retiradas fijas', exact: true }) }).locator('tbody tr');
  await expect(rules).toHaveCount(3);
  await expect(rules.filter({ hasText: 'Carla Prueba' })).toContainText('750,50 €');

  // Pausar y quitar: no se borra, solo deja de salir.
  await rules.filter({ hasText: 'Carla Prueba' }).getByRole('button', { name: 'Pausar' }).click();
  await expect(rules.filter({ hasText: 'Carla Prueba' })).toContainText('Pausada');
  await rules.filter({ hasText: 'Carla Prueba' }).getByRole('button', { name: 'Quitar' }).click();
  await expect(rules).toHaveCount(2);
  expect(await page.evaluate(() => (window as unknown as { savedState: { rules: Array<{ removedAt?: number }> } }).savedState.rules.length)).toBe(3);

  // Retiradas del mes: todas las apuntadas, con total, y cuáles son fijas.
  const month = page.locator('section', { has: page.getByRole('heading', { name: /Retiradas de noviembre 2026/ }) });
  await expect(month.locator('tbody tr')).toHaveCount(2);
  await expect(month.locator('tfoot')).toContainText('2 retiradas');
  await expect(month.locator('tfoot')).toContainText('2.300,00 €');
  await expect(month.locator('tbody tr', { hasText: '300,00 €' })).toContainText('Fija');
  await expect(month.locator('tbody tr', { hasText: '2.000,00 €' })).toContainText('Puntual');

  await page.getByRole('button', { name: '‹ Anterior' }).click();
  const october = page.locator('section', { has: page.getByRole('heading', { name: /Retiradas de octubre 2026/ }) });
  await expect(october.locator('.aw-item', { hasText: 'Ana Prueba' })).toContainText('Hecha');
  await expect(october.locator('tbody tr')).toHaveCount(1);
});

test('the tab opens on withdrawals and shows the month contributions and who made them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await mountView(page);
  await expect(page.getByRole('tab', { name: 'Retiradas (2)' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Ingresos' }).click();
  const income = page.locator('section', { has: page.getByRole('heading', { name: /Ingresos de/ }) });
  await expect(income).toContainText('No hay ingresos apuntados en noviembre 2026.');
  await income.getByRole('button', { name: '‹ Anterior' }).click();
  await expect(income.locator('tbody tr')).toHaveCount(1);
  await expect(income.locator('tbody tr')).toContainText('Ana Prueba');
  await expect(income.locator('tbody tr')).toContainText('20.000,00 €');
  await expect(income.locator('tbody tr')).toContainText('Cliente nuevo');
  await expect(income.locator('tfoot')).toContainText('1 ingreso de 1 cliente');
  // Al volver a Retiradas se mantiene el mes elegido.
  await page.getByRole('tab', { name: 'Retiradas (2)' }).click();
  await expect(page.getByRole('heading', { name: /Retiradas de octubre 2026/ })).toBeVisible();
});

test('withdrawals tab fits on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await mountView(page);
  await expect(page.locator('.aw-item').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
