import { expect, test } from '@playwright/test';

test('the login remains usable without horizontal page overflow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Iniciar sesion' })).toBeVisible();
  await expect(page.getByLabel('Usuario o email admin')).toBeVisible();
  await expect(page.locator('#pmPass')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar sesion' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test('password visibility and remembered user controls work by touch', async ({ page }) => {
  await page.goto('/');
  const password = page.locator('#pmPass');
  await password.fill('prueba-segura');
  await page.getByRole('button', { name: 'Mostrar contrasena' }).tap();
  await expect(password).toHaveAttribute('type', 'text');

  await page.getByText('Recordar usuario', { exact: true }).tap();
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('network state is announced and recovers automatically', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  await expect(page.getByRole('alert').filter({ hasText: 'Sin conexion' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Conexion recuperada' })).toBeVisible();
});
