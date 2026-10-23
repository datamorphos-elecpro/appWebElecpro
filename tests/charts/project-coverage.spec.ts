import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/finance-workspace.html?view=project&section=summary&coverage=1';

for (const width of [1440, 900, 680, 380]) test(`cobertura y desglose a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(fixture);
  const bar = page.locator('[aria-label="Cubierto: 100%"]');
  await expect(bar).toBeVisible();
  await expect(bar.locator('span')).toHaveAttribute('style', 'width: 100%;');
  await expect(bar.locator('..')).toContainText(/100\.000.*100%/);
  await expect(page.locator('header').filter({ hasText: 'PRY-TEST' })).toContainText(/Anticipos.*90\.000.*Retenciones.*10\.000.*Saldo.*\$\s*0/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`coverage-${width}.png`), fullPage: true });
});

test('retención anulada, excedente y valor cero', async ({ page }) => {
  await page.goto(`${fixture}&withheld=0`);
  await expect(page.locator('[aria-label="Cubierto: 90%"] span')).toHaveAttribute('style', 'width: 90%;');
  await expect(page.locator('header').filter({ hasText: 'PRY-TEST' })).toContainText(/Saldo.*10\.000/);
  await page.goto(`${fixture}&paid=110000`);
  await expect(page.locator('[aria-label="Cubierto: 120%"] span')).toHaveAttribute('style', 'width: 100%;');
  await page.goto(`${fixture}&value=0&paid=0&withheld=0`);
  await expect(page.locator('[aria-label="Cubierto: No calculable"] span')).toHaveAttribute('style', 'width: 0%;');
});

test('detalle de cartera muestra anticipos, retenciones y cubierto por separado', async ({ page }) => {
  await page.route('**/api/analisis/detalle?**', (route) => route.fulfill({ json: {
    metric: 'management.balance', page: 1, pageSize: 20, total: 1, unit: 'money', value: '0', components: {},
    records: [{ kind: 'project', id: '33333333-3333-4333-8333-333333333333', project_id: '33333333-3333-4333-8333-333333333333', label: 'PRY-TEST', title: 'Instalación', client_name: 'Cliente', status: 'approved', project_value: '100000', paid: '90000', withheld: '10000', balance: '0', profit_mode: 'value', base: '100000', expenses: '1000', budget: '2000', amount: '0' }],
  } }));
  await page.goto('/tests/fixtures/finance-workspace.html');
  await page.getByRole('button', { name: /^Cartera pendiente/ }).click();
  const table = page.getByRole('dialog').getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Proyecto', 'Cliente', 'Valor', 'Anticipos', 'Retenciones', 'Cubierto', 'Saldo']);
  const cells = table.locator('tbody tr').getByRole('cell');
  await expect(cells.nth(3)).toContainText('90.000');
  await expect(cells.nth(4)).toContainText('10.000');
  await expect(cells.nth(5)).toContainText('100.000');
  await expect(cells.nth(6)).toHaveText(/\$\s*0/);
});

for (const view of ['dashboard', 'projects', 'analytics', 'report']) {
  for (const width of [1440, 380]) test(`${view}: cobertura y efectivo separados a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/tests/fixtures/coverage-pages.html?view=${view}`);
    if (view === 'dashboard' || view === 'projects') {
      await expect(page.locator('[aria-label*="Cubierto:"]').first()).toBeVisible();
      await expect(page.locator('[aria-label*="Cubierto:"]').first()).toHaveAttribute('aria-label', /100%/);
      await expect(page.locator('[aria-label*="Cubierto:"]').first().locator('span')).toHaveAttribute('style', 'width: 100%;');
      await expect(page.getByText('Anticipos', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Retenciones', { exact: false }).first()).toBeVisible();
    } else {
      const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Cubierto', exact: true }) });
      const cells = table.locator('tbody tr').first().getByRole('cell');
      await expect(cells.nth(3)).toContainText('90.000');
      await expect(cells.nth(4)).toContainText('10.000');
      await expect(cells.nth(5)).toContainText('100.000');
      await expect(cells.nth(6)).toHaveText(/\$\s*0/);
      await expect(cells.nth(9)).toContainText('89.000');
    }
    if (view !== 'report') expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (view === 'report' && width === 1440) {
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: info.outputPath('coverage-report.pdf'), format: 'A4', landscape: true, printBackground: true });
    }
    await page.screenshot({ path: info.outputPath(`${view}-${width}.png`), fullPage: true });
  });
}
