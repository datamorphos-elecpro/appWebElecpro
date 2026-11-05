import { expect, test } from '@playwright/test';

test('edita y elimina un anticipo con motivo, conservando el soporte en auditoría', async ({ page }) => {
  await page.goto('/tests/fixtures/project-files.html?section=payments');
  const table = page.getByRole('table', { name: 'Anticipos registrados' });
  await table.getByRole('button', { name: 'Editar', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar anticipo', exact: true });
  await expect(editor.getByLabel('Valor', { exact: true })).toHaveValue('1000');
  await editor.getByLabel('Valor', { exact: true }).fill('2500.25');
  await editor.getByLabel('Observación').fill('Corrección de valor');
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirmar edición del anticipo' }).getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(table).toContainText('Corrección de valor');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('elecpro:test:payment-edit')!));
  expect(saved.amount).toBe('2500.25'); expect(saved.expected_updated_at).toBeTruthy(); expect(saved.request_id).toBeTruthy();
  await table.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Eliminar anticipo', exact: true });
  await confirmation.getByRole('button', { name: 'Eliminar anticipo', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('motivo');
  await confirmation.getByLabel('Motivo de eliminación').fill('Duplicado');
  await confirmation.getByRole('button', { name: 'Eliminar anticipo', exact: true }).click();
  await expect(table).toContainText('Sin registros');
});

test('permite soporte PNG y muestra las extensiones permitidas', async ({ page }) => {
  await page.goto('/tests/fixtures/project-files.html?section=payments');
  await page.getByRole('button', { name: 'Agregar soporte', exact: true }).click();
  await expect(page.getByText(/Un archivo \.pdf, \.jpg, \.jpeg o \.png/)).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'comprobante.png', mimeType: 'image/png', buffer: Buffer.from('imagen de prueba') });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar archivo', exact: true }).click();
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir soporte de pago comprobante.png' })).toBeVisible();
});

test('el estado pendiente informa la exclusión y mantiene disponibles los movimientos', async ({ page }) => {
  await page.goto('/tests/fixtures/project-files.html?section=payments&pending=1');
  await expect(page.getByText('Pendiente por aprobar: sus cifras no se incluyen en los consolidados financieros')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar anticipo', exact: true }).click();
  await expect(page.getByLabel('Valor', { exact: true })).toBeVisible();
});

for (const [profit, balance, value] of [['10000', '3000', '7.000'], ['2000', '3000', '-$ 1.000'], ['3000', '3000', '$ 0']]) {
  test(`tarjeta ganancia menos cartera: ${profit} menos ${balance}`, async ({ page }) => {
    await page.goto(`/tests/fixtures/coverage-pages.html?view=dashboard&profit=${profit}&balance=${balance}`);
    const card = page.getByRole('link', { name: /Ganancia menos cartera/ });
    await expect(card).toHaveAttribute('href', '/analisis?tab=management');
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain(value);
    await expect(page.getByText('Próximas finalizaciones', { exact: true })).toHaveCount(0);
  });
}

for (const view of ['analytics', 'report']) for (const width of [1440, 380]) {
  test(`${view}: total de cartera del agregado y encabezado a ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/tests/fixtures/coverage-pages.html?view=${view}&balance=123456`);
    await expect(page.getByText(/Total de Cartera:.*123\.456.*COP/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cartera Pendiente', exact: true })).toBeVisible();
    if (view === 'analytics') expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (view === 'report') await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: info.outputPath(`cartera-${view}-${width}.png`), fullPage: true });
  });
}
