import { expect, test, type Page } from '@playwright/test';

const fixture = '/tests/fixtures/quote-editor.html';
const savedKey = 'elecpro:test:saved-quote';
async function setup(page: Page) {
  await page.goto(fixture);
  await page.getByLabel('Precio base', { exact: true }).fill('500000');
  for (const [name, value] of [['Incremento sobre materiales', '0'], ['Administración', '8'], ['Imprevistos', '3'], ['Utilidad', '10']]) await page.getByLabel(`${name} porcentaje`, { exact: true }).fill(value);
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const aiu of [true, false]) for (const vat of [true, false]) for (const kind of ['percent', 'fixed']) {
  test(`descuento ${kind}, AIU ${aiu}, IVA ${vat}: documento, guardado y conversión`, async ({ page }) => {
    await setup(page);
    await page.getByRole('switch', { name: 'Mostrar AIU en la cotización' }).setChecked(aiu);
    await page.getByRole('switch', { name: 'Aplicar IVA al costo directo' }).setChecked(vat);
    const toggle = page.getByRole('switch', { name: 'Aplicar descuento al costo directo' });
    await expect(toggle).not.toBeChecked(); await toggle.check();
    await page.getByLabel('Tipo de descuento', { exact: true }).selectOption(kind);
    await page.getByLabel(kind === 'fixed' ? 'Descuento fijo (COP)' : 'Descuento porcentaje', { exact: true }).fill(kind === 'fixed' ? '100000' : '10');
    const total = vat ? '1.277.100' : '1.106.100';
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('row', { name: /TOTAL PROPUESTA/ })).toContainText(total);
    await expect(dialog.getByRole('row', { name: /^Descuento/ })).toContainText('-$');
    await expect(dialog.getByRole('row', { name: /^Descuento/ })).toContainText('100.000');
    await expect(dialog.getByRole('table', { name: 'Materiales y servicios' })).toContainText('1.000.000');
    if (aiu) {
      await expect(dialog.getByRole('row', { name: /^Costo directo neto/ })).toContainText('900.000');
      await expect(dialog.getByRole('row', { name: /^Administración/ })).toContainText('72.000');
    } else {
      await expect(dialog.getByRole('row', { name: /^Subtotal del servicio antes/ })).toContainText('1.189.000');
      await expect(dialog.getByRole('row', { name: /^Subtotal del servicio —/ })).toContainText('1.089.000');
      await expect(dialog.getByRole('row', { name: /^Administración/ })).toHaveCount(0);
    }
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.quote-print-portal')).toContainText(total);
    await expect(page.locator('.quote-print-portal')).toContainText(kind === 'fixed' ? 'Descuento (valor fijo)' : 'Descuento porcentual');
    await page.emulateMedia({ media: 'screen' }); await page.keyboard.press('Escape');
    await save(page);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).total_amount, savedKey)).toBe(vat ? '1277100' : '1106100');
    await page.reload(); await expect(toggle).toBeChecked();
    await expect(page.getByLabel('Tipo de descuento', { exact: true })).toHaveValue(kind);
    await page.getByRole('button', { name: 'Convertir en proyecto', exact: true }).click();
    await page.getByRole('button', { name: 'Aprobar y convertir', exact: true }).click();
    await expect(toggle).toBeDisabled(); await expect(page.getByLabel('Tipo de descuento', { exact: true })).toBeDisabled();
    await page.reload(); await expect(toggle).toBeDisabled();
    await expect(page.getByLabel(kind === 'fixed' ? 'Descuento fijo (COP)' : 'Descuento porcentaje', { exact: true })).toBeDisabled();
  });
}

test('conserva ambos valores en borrador y servidor, y desactivar recupera total', async ({ page }) => {
  await setup(page);
  const toggle = page.getByRole('switch', { name: 'Aplicar descuento al costo directo' });
  const type = page.getByLabel('Tipo de descuento', { exact: true });
  await toggle.check(); await page.getByLabel('Descuento porcentaje', { exact: true }).fill('12,25');
  await type.selectOption('fixed'); await expect(page.getByLabel('Descuento fijo (COP)', { exact: true })).toHaveValue('0');
  await page.getByLabel('Descuento fijo (COP)', { exact: true }).fill('100000,50');
  await page.reload(); await page.getByRole('button', { name: 'Recuperar borrador', exact: true }).click();
  await expect(type).toHaveValue('fixed'); await expect(page.getByLabel('Descuento fijo (COP)', { exact: true })).toHaveValue('100000,50');
  await type.selectOption('percent'); await expect(page.getByLabel('Descuento porcentaje', { exact: true })).toHaveValue('12,25');
  await toggle.uncheck(); await save(page); await page.reload(); await expect(toggle).not.toBeChecked();
  await toggle.check(); await expect(page.getByLabel('Descuento porcentaje', { exact: true })).toHaveValue('12.25');
  await type.selectOption('fixed'); await expect(page.getByLabel('Descuento fijo (COP)', { exact: true })).toHaveValue('100000.50');
  await toggle.uncheck(); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('row', { name: /^Descuento/ })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('row', { name: /TOTAL PROPUESTA/ })).toContainText('1.229.000');
});

test('exceso al reducir ítems bloquea todas las operaciones y desactivar lo resuelve', async ({ page }) => {
  await setup(page); await page.getByRole('switch', { name: 'Aplicar descuento al costo directo' }).check();
  await page.getByLabel('Tipo de descuento', { exact: true }).selectOption('fixed');
  await page.getByLabel('Descuento fijo (COP)', { exact: true }).fill('750000');
  await page.getByLabel('Cant.', { exact: true }).fill('1');
  await expect(page.locator('#direct-discount-errors')).toContainText('no puede superar el costo directo');
  for (const name of ['Vista previa', 'Convertir en proyecto']) {
    await page.getByRole('button', { name, exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Revise los datos');
  expect(await page.evaluate((key) => localStorage.getItem(key), savedKey)).toBeNull();
  await page.keyboard.press('Escape'); await page.getByRole('switch', { name: 'Aplicar descuento al costo directo' }).uncheck();
  await save(page); await expect(page.locator('#direct-discount-errors')).toHaveCount(0);
});

for (const width of [1440, 380]) {
  test(`descuento cero, total cero, teclado e impresión a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await setup(page);
    await page.getByRole('switch', { name: 'Aplicar descuento al costo directo' }).check();
    await page.getByLabel('Tipo de descuento', { exact: true }).focus(); await page.keyboard.press('Tab');
    const pct = page.getByLabel('Descuento porcentaje', { exact: true }); await expect(pct).toBeFocused();
    for (const value of ['0', '100']) {
      await pct.fill(value); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('row', { name: /^Descuento/ })).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('row', { name: /TOTAL PROPUESTA/ })).toContainText(value === '0' ? '1.229.000' : '$ 0');
      if (value === '100') {
        await page.screenshot({ path: info.outputPath(`discount-${width}.png`), fullPage: true });
        await page.pdf({ path: info.outputPath(`discount-${width}.pdf`), format: 'A4', printBackground: true });
      }
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pct.fill('100.01'); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('#direct-discount-errors')).toContainText('entre 0 y 100');
  });
}
