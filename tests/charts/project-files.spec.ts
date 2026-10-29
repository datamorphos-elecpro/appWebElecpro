import { expect, test, type Page } from '@playwright/test';

const fixture = '/tests/fixtures/project-files.html';
const pdf = { name: 'comprobante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nprueba') };
const longFileName = `Memoria-de-calculo-${'instalacion-electrica-'.repeat(7)}revision-final.pdf`;

async function seedAttachment(page: Page, name = longFileName) {
  await page.addInitScript((fileName) => localStorage.setItem('elecpro:test:files', JSON.stringify([{
    id: 'fa000000-0000-4000-8000-000000000011', project_id: '33333333-3333-4333-8333-333333333333', kind: 'attachment',
    original_name: fileName, size_bytes: 125000, mime_type: 'application/pdf', payment_id: null,
    created_at: '2026-10-29T15:00:00Z', updated_at: '2026-10-29T15:00:00Z', uploader_name: 'Ana Rodríguez',
    project_attachment_types: { id: 'type-2', name: 'Informe' },
  }])), name);
}

test('crea categoría global y adjunto, permite reclasificarlo y eliminarlo', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Agregar archivo adjunto' }).click();
  await page.getByRole('combobox', { name: 'Tipo de documento' }).fill('Acta especial');
  await page.getByRole('option', { name: 'Crear «Acta especial»' }).click();
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  const table = page.getByRole('table', { name: 'Archivos adjuntos del proyecto' });
  await expect(table).toContainText('Acta especial'); await expect(table).toContainText('comprobante.pdf');
  await table.getByRole('button', { name: 'Editar comprobante.pdf', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tipo de documento' }).fill('Informe'); await page.getByRole('option', { name: 'Informe', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await expect(table).toContainText('Informe');
  await table.getByRole('button', { name: 'Eliminar comprobante.pdf', exact: true }).click(); await page.getByRole('button', { name: 'Eliminar archivo', exact: true }).click();
  await expect(table).toContainText('Aún no hay archivos adjuntos');
});

test('permite completar y retirar el soporte de un anticipo anterior', async ({ page }) => {
  await page.goto(`${fixture}?section=payments`);
  const table = page.getByRole('table', { name: 'Anticipos registrados' });
  await expect(table).toContainText('No tiene soporte de pago');
  await table.getByRole('button', { name: 'Agregar soporte' }).click();
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await expect(table.getByRole('button', { name: 'Abrir soporte de pago comprobante.pdf' })).toBeVisible();
  await table.getByRole('button', { name: 'Quitar', exact: true }).click(); await page.getByRole('button', { name: 'Quitar soporte', exact: true }).click();
  await expect(table).toContainText('No tiene soporte de pago'); await expect(table).toContainText('1.000');
});

test('una carga fallida no crea el anticipo; conserva el formulario para reintentar', async ({ page }) => {
  await page.goto(`${fixture}?section=payments`);
  await page.evaluate(() => localStorage.setItem('elecpro:test:fail-upload', '1'));
  await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill('2000');
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se completó la carga');
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:project-record'))).toBeNull();
  await page.evaluate(() => localStorage.removeItem('elecpro:test:fail-upload'));
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Anticipos registrados' })).toContainText('comprobante.pdf');
});

test('rechaza otros formatos en soporte y no guarda archivos en el borrador', async ({ page }) => {
  await page.goto(`${fixture}?section=payments`);
  await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill('2000');
  await page.locator('input[type=file]').setInputFiles({ name: 'imagen.png', mimeType: 'image/png', buffer: Buffer.from('imagen') });
  await expect(page.getByRole('alert')).toContainText('debe ser un PDF');
  await page.locator('input[type=file]').setInputFiles(pdf);
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('draft')).map((key) => JSON.parse(localStorage.getItem(key)!)));
  for (const draft of drafts) expect(draft.value).not.toHaveProperty('support_file');
});

test('el selector admite teclado y la vista previa conserva descarga', async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Agregar archivo adjunto' }).click();
  const type = page.getByRole('combobox', { name: 'Tipo de documento' });
  await type.fill('Informe'); await type.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(type).toHaveValue('Informe');
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await page.route('**/api/proyectos/archivos/*?format=json', (route) => route.fulfill({ json: { url: 'about:blank' } }));
  await page.getByRole('table').getByRole('button', { name: 'Abrir comprobante.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'comprobante.pdf', exact: true });
  await expect(dialog.getByTitle('Vista previa de comprobante.pdf')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Descargar archivo' })).toHaveAttribute('href', /download=1/);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
});

for (const width of [1440, 900, 680, 380]) test(`adjuntos y soporte se adaptan a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`${fixture}?section=payments`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Seleccionar soporte de pago' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto(fixture); await page.getByRole('button', { name: 'Agregar archivo adjunto' }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo de documento' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`attachments-${width}.png`), fullPage: true });
});

test('las acciones muestran etiquetas con cursor y teclado, y conservan descarga', async ({ page }) => {
  await seedAttachment(page, 'informe.pdf'); await page.goto(fixture);
  const table = page.getByRole('table', { name: 'Archivos adjuntos del proyecto' });
  const open = table.getByRole('button', { name: 'Abrir informe.pdf', exact: true });
  await open.hover(); await expect(page.getByRole('tooltip', { name: 'Abrir', exact: true })).toBeVisible();
  // The tooltip is outside the scrollable table, can be hovered, and Escape dismisses it.
  await page.getByRole('tooltip').hover(); await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.move(0, 0);
  const download = table.getByRole('link', { name: 'Descargar informe.pdf', exact: true });
  await download.focus(); await expect(download).toBeFocused(); await expect(page.getByRole('tooltip', { name: 'Descargar', exact: true })).toBeVisible();
  await expect(download).toHaveAttribute('href', '/api/proyectos/archivos/fa000000-0000-4000-8000-000000000011?download=1');
  await page.keyboard.press('Tab'); await expect(table.getByRole('button', { name: 'Editar informe.pdf', exact: true })).toBeFocused();
  await expect(page.getByRole('tooltip', { name: 'Editar', exact: true })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(table.getByRole('button', { name: 'Eliminar informe.pdf', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog', { name: 'Eliminar archivo adjunto', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(table.getByRole('button', { name: 'Eliminar informe.pdf', exact: true })).toBeFocused();
});

for (const width of [1440, 900, 680, 380]) test(`tabla de adjuntos comparte estilo con gastos a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(fixture);
  await expect(page.getByRole('table')).toContainText('Aún no hay archivos adjuntos.');
  await page.screenshot({ path: info.outputPath(`attachments-empty-${width}.png`), fullPage: true });
  await seedAttachment(page); await page.reload();
  const table = page.getByRole('table', { name: 'Archivos adjuntos del proyecto' });
  await expect(table.getByRole('columnheader')).toHaveText(['Tipo de documento', 'Nombre del archivo', 'Tamaño', 'Fecha de carga', 'Cargado por', 'Acciones']);
  await expect(table.getByRole('button', { name: longFileName, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dimension = width <= 680 ? '44px' : '36px';
  const open = table.getByRole('button', { name: `Abrir ${longFileName}`, exact: true });
  await expect(open).toHaveCSS('width', dimension); await expect(open).toHaveCSS('height', dimension);
  const nameCell = table.locator('tbody td').nth(1);
  expect((await nameCell.boundingBox())!.width).toBeGreaterThanOrEqual(220);
  if (width <= 680) {
    expect(await table.locator('..').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await open.focus(); await expect(open).toBeInViewport();
    await expect(page.getByRole('tooltip', { name: 'Abrir', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Agregar archivo adjunto', exact: true }).focus();
    await table.locator('..').evaluate((element) => { element.scrollLeft = 0; });
  }
  await expect(page.getByRole('combobox', { name: 'Filas por página' })).toHaveValue('20');
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
  // Compare the computed appearance to the existing production reference, not a duplicate stylesheet.
  const appearance = await table.evaluate((element) => {
    const section = getComputedStyle(element.closest('section')!); const header = getComputedStyle(element.closest('section')!.querySelector('header')!);
    const button = getComputedStyle(element.closest('section')!.querySelector('header button')!); const th = getComputedStyle(element.querySelector('th')!);
    return { section: [section.backgroundColor, section.border, section.borderRadius, section.padding], header: [header.display, header.gap, header.marginBottom], button: [button.backgroundColor, button.border, button.borderRadius, button.color, button.padding, button.fontWeight], th: [th.padding, th.borderBottom, th.fontSize, th.color, th.textAlign] };
  });
  await page.screenshot({ path: info.outputPath(`attachments-table-${width}.png`), fullPage: true });
  await page.goto('/tests/fixtures/finance-workspace.html?view=project&section=costs');
  const reference = await page.getByRole('table', { name: 'Gastos registrados' }).evaluate((element) => {
    const section = getComputedStyle(element.closest('section')!); const article = element.closest('article')!; const header = getComputedStyle(article.firstElementChild!);
    const button = getComputedStyle(article.querySelector('button')!); const th = getComputedStyle(element.querySelector('th')!);
    return { section: [section.backgroundColor, section.border, section.borderRadius, section.padding], header: [header.display, header.gap, header.marginBottom], button: [button.backgroundColor, button.border, button.borderRadius, button.color, button.padding, button.fontWeight], th: [th.padding, th.borderBottom, th.fontSize, th.color, th.textAlign] };
  });
  expect(appearance).toEqual(reference);
  await page.screenshot({ path: info.outputPath(`costs-reference-${width}.png`), fullPage: true });
});
