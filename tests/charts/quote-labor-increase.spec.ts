import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/quote-editor.html';
const savedKey = 'elecpro:test:saved-quote';
const draftKey = 'elecpro:draft:v1:11111111-1111-4111-8111-111111111111:quote:33333333-3333-4333-8333-333333333333';
const laborLabel = 'Incremento sobre mano de obra porcentaje';

test('incremento MO: categorías, borrador, guardado, reapertura y conversión', async ({ page }) => {
  await page.goto(fixture);
  const labor = page.getByLabel(laborLabel, { exact: true });
  await expect(labor).toHaveValue('0');
  await page.getByLabel('Cant.', { exact: true }).fill('1');
  await page.getByLabel('IVA (%)', { exact: true }).fill('19');
  await page.getByLabel('Incremento sobre materiales porcentaje').fill('20');
  await labor.fill('10');
  for (const [category, price] of [['labor', '130.900'], ['material', '142.800'], ['design', '119.000'], ['technical_visit', '119.000'], ['all_inclusive', '119.000'], ['transport', '119.000'], ['', '119.000'], ['labor', '130.900']]) {
    await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(category);
    await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText(price);
  }
  await page.reload(); await page.getByRole('button', { name: 'Recuperar borrador', exact: true }).click();
  await expect(labor).toHaveValue('10');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('row', { name: /TOTAL PROPUESTA/ })).toContainText('130.900');
  await expect(page.getByRole('dialog')).not.toContainText('Incremento sobre');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').labor_increase_pct, savedKey)).toBe('10');
  await page.reload(); await expect(labor).toHaveValue('10');
  await page.getByRole('button', { name: 'Convertir en proyecto', exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar y convertir', exact: true }).click();
  await expect(labor).toBeDisabled();
  await page.reload(); await expect(labor).toBeDisabled(); await expect(labor).toHaveValue('10');
});

test('borradores anteriores toman 0 y el descuento fijo responde al incremento', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('labor');
  await page.getByLabel('Cant.', { exact: true }).fill('1');
  await page.getByLabel(laborLabel).fill('150.25');
  await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText('250.250');
  await page.getByRole('switch', { name: 'Aplicar descuento al costo directo' }).check();
  await page.getByLabel('Tipo de descuento', { exact: true }).selectOption('fixed');
  await page.getByLabel('Descuento fijo (COP)', { exact: true }).fill('200000');
  await expect(page.locator('#direct-discount-errors')).toHaveCount(0);
  // Simular un borrador anterior al nuevo campo durante la siguiente carga.
  await page.addInitScript((key) => {
    const draft = JSON.parse(localStorage.getItem(key)!);
    delete draft.value.form.labor_increase_pct;
    localStorage.setItem(key, JSON.stringify(draft));
  }, draftKey);
  await page.reload(); await page.getByRole('button', { name: 'Recuperar borrador', exact: true }).click();
  await expect(page.getByLabel(laborLabel)).toHaveValue('0');
  await expect(page.locator('#direct-discount-errors')).toContainText('no puede superar el costo directo');
});

for (const aiu of [true, false]) for (const vat of [true, false]) for (const discount of [true, false]) {
  test(`IVA utilidad: AIU ${aiu}, IVA directo ${vat}, descuento ${discount}`, async ({ page }, info) => {
    await page.goto(fixture);
    for (const [label, value] of [['Administración', '8'], ['Imprevistos', '3'], ['Utilidad', '10']]) await page.getByLabel(`${label} porcentaje`, { exact: true }).fill(value);
    await page.getByRole('switch', { name: 'Mostrar AIU en la cotización' }).setChecked(aiu);
    await page.getByRole('switch', { name: 'Aplicar IVA al costo directo' }).setChecked(vat);
    await page.getByRole('switch', { name: 'Aplicar descuento al costo directo' }).setChecked(discount);
    if (discount) await page.getByLabel('Descuento porcentaje', { exact: true }).fill('10');
    await expect(page.getByLabel('IVA sobre utilidad porcentaje')).toBeVisible();
    const expectedTotal = vat ? (discount ? '280.962' : '312.180') : (discount ? '243.342' : '270.380');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    for (const container of [page.getByRole('dialog'), page.locator('.quote-print-portal')]) {
      await expect(container.locator('tr').filter({ hasText: /^IVA sobre utilidad/ })).toHaveCount(!aiu && vat ? 0 : 1);
      await expect(container.locator('tr').filter({ hasText: /TOTAL PROPUESTA/ })).toContainText(expectedTotal);
    }
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.quote-print-portal')).toBeVisible();
    if (!aiu && vat) await page.pdf({ path: info.outputPath('iva-utilidad-oculto.pdf'), format: 'A4', printBackground: true });
    await page.emulateMedia({ media: 'screen' }); await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: 'Mostrar AIU en la cotización' }).setChecked(!aiu);
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('row', { name: /TOTAL PROPUESTA/ })).toContainText(expectedTotal);
  });
}

for (const width of [1440, 380]) {
  test(`nuevo porcentaje accesible sin desbordamiento a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(fixture);
    await page.getByLabel('Incremento sobre materiales porcentaje').focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel(laborLabel)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('resumen-economico.png'), fullPage: true });
  });
}
