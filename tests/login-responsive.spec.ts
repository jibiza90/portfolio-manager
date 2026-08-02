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

test('the mobile financial summary and monthly detail control remain readable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#root').evaluate((root) => {
    root.innerHTML = `
      <main class="client-portal-page">
        <section class="report-pro-waterfall-panel">
          <div class="report-pro-panel-head report-pro-waterfall-head">
            <div>
              <span class="report-pro-waterfall-eyebrow">Resumen financiero</span>
              <h4>Composicion del valor actual</h4>
            </div>
            <div class="report-pro-waterfall-check is-ok">Cuadra con el saldo actual</div>
          </div>
          <div class="report-pro-waterfall-visual">
            <div class="report-pro-waterfall-axis"></div>
            ${[
              ['is-capital', '200.000,00 EUR', 'Capital aportado', 'Todo el dinero ingresado'],
              ['is-withdrawal', '-10.000,00 EUR', 'Capital retirado', 'Dinero que ya ha salido'],
              ['is-profit', '+45.083,36 EUR', 'Beneficio acumulado', 'Resultado generado'],
              ['is-total', '235.083,36 EUR', 'Saldo actual', 'Valor final de cartera']
            ].map(([type, value, title, subtitle]) => `
              <div class="report-pro-waterfall-step ${type}" style="--bar-height: 70%">
                <div class="report-pro-waterfall-value">${value}</div>
                <div class="report-pro-waterfall-bar"><span></span></div>
                <strong>${title}</strong><small>${subtitle}</small>
              </div>
            `).join('')}
          </div>
        </section>
        <section class="report-pro-panel">
          <div class="table-scroll">
            <table class="monthly-table report-pro-table report-pro-demo-monthly-table">
              <tbody><tr><td>
                <span class="report-pro-month-cell">
                  <span>30/06/2026</span>
                  <button type="button" class="report-pro-detail-button">
                    <span class="report-pro-detail-button-icon">+</span><span>Ver detalle</span>
                  </button>
                  <span class="report-pro-movement-pill">Aportacion</span>
                </span>
              </td><td class="text-right">7.994,17 EUR</td><td class="text-right">5,81%</td><td class="text-right">150.832,34 EUR</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>`;
  });

  const detailButton = page.getByRole('button', { name: 'Ver detalle' });
  await expect(detailButton).toBeVisible();
  await expect(page.locator('.report-pro-waterfall-step')).toHaveCount(4);

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const detailRect = document.querySelector('.report-pro-detail-button')?.getBoundingClientRect();
    const values = [...document.querySelectorAll('.report-pro-waterfall-value')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      viewportWidth,
      pageWidth: document.documentElement.scrollWidth,
      detailLeft: detailRect?.left ?? -1,
      detailRight: detailRect?.right ?? viewportWidth + 1,
      values
    };
  });

  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.detailLeft).toBeGreaterThanOrEqual(0);
  expect(layout.detailRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.values.every((value) => value.left >= 0 && value.right <= layout.viewportWidth && value.width > 0)).toBe(true);
});
