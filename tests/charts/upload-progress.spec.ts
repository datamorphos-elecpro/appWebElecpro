import { expect, test } from '@playwright/test';

const pdf = { name: 'soporte.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') };

for (const kind of ['payment', 'attachment', 'receipt'] as const) test(`${kind}: progreso, guardado demorado, reintento y Listo`, async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  await page.goto(`/tests/fixtures/project-files.html${kind === 'attachment' ? '' : '?section=payments'}`);
  await page.evaluate(() => {
    localStorage.setItem('elecpro:test:upload-delay', '500');
    localStorage.setItem('elecpro:test:save-delay', '1000');
    localStorage.setItem('elecpro:test:fail-save', '1');
  });
  if (kind === 'payment') {
    await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
    await page.getByLabel('Valor', { exact: true }).fill('2000');
  } else if (kind === 'receipt') await page.getByRole('button', { name: 'Agregar soporte', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Agregar archivo adjunto', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tipo de documento' }).fill('Informe');
    await page.getByRole('option', { name: 'Informe', exact: true }).click();
  }
  await page.locator('input[type=file]').setInputFiles(pdf);
  await expect(page.getByRole('status')).toContainText('Archivo seleccionado correctamente. Pendiente de guardar');
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:upload'))).toBeNull();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: kind === 'payment' ? 'Confirmar registro' : 'Confirmar archivo', exact: true });
  const saveLabel = kind === 'payment' ? 'Guardar registro' : 'Guardar archivo';
  await dialog.getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '25');
  await expect(dialog.locator('[data-state=uploading]')).toHaveCSS('color', 'rgb(23, 93, 168)');
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveText('Carga completada. Guardando…');
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '100');
  await expect(dialog.getByRole('button', { name: 'Listo' })).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar');
  await expect(dialog.locator('[data-state=error]')).toHaveCSS('color', 'rgb(180, 35, 24)');
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:project-record'))).toBeNull();
  await page.evaluate(() => localStorage.removeItem('elecpro:test:fail-save'));
  await dialog.getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Archivo cargado y guardado correctamente');
  await expect(dialog.locator('[data-state=success]')).toHaveCSS('color', 'rgb(24, 112, 68)');
  await expect(dialog.getByRole('button', { name: 'Listo', exact: true })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:upload-count'))).toBe('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${kind}-success.png`) });
  if (kind === 'receipt') await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('table').filter({ hasText: 'soporte.pdf' })).toHaveCount(1);
});

test('Análisis oculta Distribuciones y conserva las otras vistas', async ({ page }) => {
  await page.goto('/tests/fixtures/coverage-pages.html?view=analytics');
  await expect(page.getByRole('tab', { name: 'Distribuciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Gerencia y rentabilidad', exact: true })).toBeVisible();
});

test('cambiar y retirar la selección reinicia el indicador y permite guardar sin soporte', async ({ page }) => {
  await page.goto('/tests/fixtures/project-files.html?section=payments');
  await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
  await page.getByLabel('Valor', { exact: true }).fill('2000');
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.locator('input[type=file]').setInputFiles({ ...pdf, name: 'nuevo.pdf' });
  await expect(page.getByText(/nuevo.pdf ·/)).toBeVisible();
  await expect(page.getByText(/soporte.pdf ·/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Retirar selección', exact: true }).click();
  await expect(page.getByText('Archivo seleccionado correctamente. Pendiente de guardar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:upload'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('elecpro:test:project-record'))).toBeTruthy();
});

for (const kind of ['attachment', 'receipt'] as const) test(`${kind}: reemplaza el archivo conservando un solo registro vigente`, async ({ page }) => {
  await page.goto(`/tests/fixtures/project-files.html${kind === 'attachment' ? '' : '?section=payments'}`);
  await page.getByRole('button', { name: kind === 'attachment' ? 'Agregar archivo adjunto' : 'Agregar soporte', exact: true }).click();
  if (kind === 'attachment') {
    await page.getByRole('combobox', { name: 'Tipo de documento' }).fill('Informe');
    await page.getByRole('option', { name: 'Informe', exact: true }).click();
  }
  await page.locator('input[type=file]').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.getByRole('button', { name: kind === 'attachment' ? 'Editar soporte.pdf' : 'Reemplazar', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ ...pdf, name: 'reemplazo.pdf' });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  const files = await page.evaluate(() => JSON.parse(localStorage.getItem('elecpro:test:files')!));
  expect(files).toHaveLength(1); expect(files[0].original_name).toBe('reemplazo.pdf');
});
