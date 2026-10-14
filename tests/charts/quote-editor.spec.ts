import { expect, test } from '@playwright/test';

const fixture = '/tests/fixtures/quote-editor.html';
const savedKey = 'elecpro:test:saved-quote';
const draftKey = 'elecpro:draft:v1:11111111-1111-4111-8111-111111111111:quote:33333333-3333-4333-8333-333333333333';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/search/**', async (route) => {
    const catalog = new URL(route.request().url()).pathname.endsWith('/catalog');
    await route.fulfill({ json: { records: [catalog ? {
      id: '55555555-5555-4555-8555-555555555555', primary: 'TRA-0001 · Transporte', secondary: 'UND · 100000',
      metadata: { code: 'TRA-0001', description: 'Transporte', category: 'transport', unit: 'UND', base_unit_price: '100000' },
    } : { id: '22222222-2222-4222-8222-222222222222', primary: 'Cliente de prueba', secondary: '', metadata: {} }] } });
  });
});

test('ítem agregado desde catálogo inicia sin IVA', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Catálogo: Todos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Buscar catálogo', exact: true }).fill('TRA');
  await page.getByRole('option', { name: /TRA-0001/ }).click();
  await expect(page.getByLabel('IVA (%)', { exact: true }).nth(1)).toHaveValue('0');
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true }).nth(1)).toHaveValue('transport');
  await expect(page.getByRole('status', { name: 'Precio final', exact: true }).nth(1)).toContainText('100.000');
});

test('IVA inicial, vista previa inmediata, guardado y reapertura', async ({ page }) => {
  await page.goto(fixture);
  await expect(page.getByLabel('IVA (%)', { exact: true })).toHaveValue('0');
  await page.getByLabel('IVA (%)', { exact: true }).fill('19');
  await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText('130.900');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('table', { name: 'Materiales y servicios' })).toContainText('261.800');
  await expect(dialog.getByRole('table', { name: 'Materiales y servicios' })).not.toContainText('IVA');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').items?.[0]?.vat_pct, savedKey)).toBe('19');
  await page.reload();
  await expect(page.getByLabel('IVA (%)', { exact: true })).toHaveValue('19');
  await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText('130.900');
  await page.getByLabel('IVA (%)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').items?.[0]?.vat_pct, savedKey)).toBe('0');
});

test('borrador conserva IVA decimal y recupera borradores anteriores sin IVA', async ({ page }) => {
  await page.goto(fixture);
  await page.getByLabel('IVA (%)', { exact: true }).fill('19,25');
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar borrador', exact: true }).click();
  await expect(page.getByLabel('IVA (%)', { exact: true })).toHaveValue('19,25');
  await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText('131.175');
  await page.addInitScript((key) => { const draft = JSON.parse(localStorage.getItem(key)!); delete draft.value.items[0].vat_pct; localStorage.setItem(key, JSON.stringify(draft)); }, draftKey);
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar borrador', exact: true }).click();
  await expect(page.getByLabel('IVA (%)', { exact: true })).toHaveValue('0');
});

test('categorías nuevas, IVA inválido y bloqueo tras convertir', async ({ page }) => {
  await page.goto(fixture);
  for (const category of ['all_inclusive', 'transport']) {
    await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(category);
    await page.getByLabel('IVA (%)', { exact: true }).fill('19');
    await expect(page.getByRole('status', { name: 'Precio final', exact: true })).toContainText('119.000');
  }
  await page.getByRole('button', { name: '+ Agregar ítem manual', exact: true }).click();
  await expect(page.getByLabel('IVA (%)', { exact: true }).nth(1)).toHaveValue('0');
  await page.getByRole('button', { name: 'Eliminar ítem 2', exact: true }).click();
  const vat = page.getByLabel('IVA (%)', { exact: true });
  await vat.fill('100.01');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Ingrese un IVA entre 0 y 100');
  await vat.fill('19');
  await page.getByRole('button', { name: 'Convertir en proyecto', exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar y convertir', exact: true }).click();
  await expect(vat).toBeDisabled();
  await page.reload();
  await expect(vat).toBeDisabled();
  await expect(vat).toHaveValue('19');
});

for (const width of [1440, 900, 680, 380]) {
  test(`Precio base e IVA juntos, teclado y layout ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(fixture);
    const base = page.getByLabel('Precio base', { exact: true });
    const vat = page.getByLabel('IVA (%)', { exact: true });
    await base.focus(); await page.keyboard.press('Tab'); await expect(vat).toBeFocused();
    const a = (await base.boundingBox())!; const b = (await vat.boundingBox())!;
    expect(width > 380 ? b.x > a.x && Math.abs(a.y - b.y) < 1 : b.y > a.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
