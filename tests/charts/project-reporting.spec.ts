import { expect, test } from '@playwright/test';

for (const width of [380, 680, 900, 1440]) test(`facturas y costo directo a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/api/proyectos/archivos/*?format=json', (route) => route.fulfill({ json: { url: 'about:blank' } }));
  await page.goto('/tests/fixtures/coverage-pages.html?view=analytics');
  const table = page.getByRole('table', { name: 'Resultado financiero por proyecto' });
  await expect(table.getByRole('columnheader')).toHaveText(['Proyecto', 'Facturas', 'Estado', 'Valor', 'Costo Directo', 'Anticipos', 'Retenciones', 'Cubierto', 'Cartera Pendiente', 'Presupuesto', 'Gastos', 'Diferencia de caja', 'Distribuciones pagadas', 'Actual']);
  await table.getByRole('button', { name: 'Factura-electronica.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('iframe')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('button', { name: 'Factura-electronica.pdf', exact: true })).toBeFocused();
  await table.getByRole('button', { name: 'Factura-anterior.xlsx', exact: true }).click();
  await expect(dialog).toContainText('Este formato está disponible para descarga.');
  await expect(dialog.getByRole('link', { name: 'Descargar archivo' })).toBeVisible();
});

test('el informe imprime facturas con viñetas sin controles', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto('/tests/fixtures/coverage-pages.html?view=report&months=18');
  const table = page.locator('table').last();
  await expect(table.locator('th').filter({ hasText: /^Facturas$/ })).toBeVisible();
  await expect(table.locator('ul')).toHaveCount(135);
  await expect(table.locator('button')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  expect(await table.evaluate((node) => node.scrollWidth <= node.parentElement!.clientWidth + 1)).toBe(true);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('reporting-print.png') });
  await page.pdf({ path: info.outputPath('reporting.pdf'), preferCSSPageSize: true, printBackground: true });
});
