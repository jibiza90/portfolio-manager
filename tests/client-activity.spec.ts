import { expect, test } from '@playwright/test';

// Pantalla "Actividad de clientes" del admin: ultima vez que entro cada cliente (datos inventados).
test('activity screen lists the last time each client came in, newest first', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Checked once on a representative viewport.');
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('/');
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await page.evaluate(async ({ today, oneDay }) => {
    const React = (await import('/node_modules/.vite/deps/react.js' as string)).default;
    const RDC = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const createRoot = RDC.createRoot ?? RDC.default.createRoot;
    const { ClientActivityView } = await import('/src/components/ClientActivityView.tsx' as string);
    const root = document.getElementById('root')!;
    root.innerHTML = '';
    const profile = (uid: string, clientId: string) => ({ uid, clientId, loginId: uid, role: 'client', active: true });
    const login = (uid: string, at: number) => ({ id: `${uid}-${at}`, uid, email: '', authEventKey: '', loginAt: at, createdAt: at });
    createRoot(root).render(React.createElement(ClientActivityView, {
      clients: [
        { id: 'client-901', label: 'Cliente Prueba A' },
        { id: 'client-902', label: 'Cliente Prueba B' },
        { id: 'client-903', label: 'Cliente Prueba C' },
        { id: 'client-904', label: 'Cliente sin acceso' }
      ],
      accessProfiles: [profile('uid-a', 'client-901'), profile('uid-b', 'client-902'), profile('uid-c', 'client-903')],
      downloadEvents: [],
      loginEvents: [
        login('uid-a', today - 10 * oneDay),
        login('uid-a', today - 3 * oneDay),
        login('uid-b', today - 60_000),
        login('uid-admin', today)
      ]
    }));
  }, { today: now, oneDay: day });

  const table = page.locator('.client-activity-last-access');
  await expect(table.getByRole('heading', { name: 'Última vez que entró cada cliente' })).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Cliente Prueba B');
  await expect(rows.nth(0)).toContainText('Hoy');
  await expect(rows.nth(1)).toContainText('Cliente Prueba A');
  await expect(rows.nth(1)).toContainText('Hace 3 días');
  await expect(rows.nth(2)).toContainText('Cliente Prueba C');
  await expect(rows.nth(2)).toContainText('Sin accesos registrados');
});
