import { expect, test } from '@playwright/test';
import { credentialsAvailable, login } from './auth';

test.skip(!credentialsAvailable, 'Requiere entorno de pruebas autenticado y la migración de navegación aplicada.');

const sources: Record<string, Array<[string, string]>> = {
  '/cotizaciones': [['Cotizaciones', '/cotizaciones'], ['Valor aprobado', '/cotizaciones?status=approved'], ['Propuestas vigentes', '/cotizaciones?segment=valid'], ['Tasa de aprobación', '/cotizaciones?segment=decided'], ['Proyectos', '/proyectos'], ['Activos', '/proyectos?segment=active'], ['Ganancia consolidada', '/proyectos']],
  '/proyectos': [['Proyectos', '/proyectos'], ['Activos', '/proyectos?segment=active'], ['Ganancia consolidada', '/proyectos']],
  '/panel': [['Proyectos activos', '/proyectos?segment=active'], ['Valor contratado', '/proyectos'], ['Pagos recibidos', '/proyectos?segment=paid'], ['Cartera pendiente', '/proyectos?segment=receivable'], ['Gastos acumulados', '/proyectos?segment=expenses'], ['Ganancia actual', '/proyectos'], ['Proyectos retrasados', '/proyectos?segment=delayed'], ['Próximas finalizaciones', '/proyectos?segment=ending_soon']],
};
for (const [source, metrics] of Object.entries(sources)) {
  test(`tarjetas y enlaces compartibles desde ${source}`, async ({ page }) => {
    await login(page);
    for (const [label, href] of metrics) {
      await page.goto(`${source}?q=BusquedaAnterior&page=999`);
      const metric = page.getByRole('link').filter({ has: page.getByText(label, { exact: true }) });
      await expect(metric).toHaveAttribute('href', href);
      await metric.focus(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+'$'));
      if (href.includes('?')) {
        await expect(page.getByLabel('Filtros aplicados')).toBeVisible();
        await page.reload(); await expect(page.getByLabel('Filtros aplicados')).toBeVisible();
        await page.getByRole('link', { name: /Quitar filtro:/ }).click();
        await expect(page.getByLabel('Filtros aplicados')).toHaveCount(0);
      }
    }
  });
}

test('botón de regreso desde una entrada directa al detalle', async ({ page }) => {
  await login(page); await page.goto('/proyectos');
  const project = page.getByRole('link', { name: 'Ver proyecto →' }).first();
  test.skip(await project.count() === 0, 'Requiere un proyecto de prueba.');
  const href = await project.getAttribute('href');
  await page.goto(href!);
  await page.getByRole('link', { name: '← Volver a proyectos' }).click();
  await expect(page).toHaveURL(/\/proyectos$/);
});

test('campos de catálogo admiten coma y convierten unidades inmediatamente', async ({ page }) => {
  await login(page); await page.goto('/catalogo');
  await page.getByRole('button', { name: '+ Crear', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo registro' });
  await dialog.getByLabel('Descripción', { exact: true }).fill('Prueba de entrada decimal');
  await dialog.getByLabel('Unidad').fill('und');
  await expect(dialog.getByLabel('Unidad')).toHaveValue('UND');
  const price = dialog.getByLabel('Precio base');
  await price.fill('1250,'); await dialog.getByLabel('Unidad').focus();
  await expect(price).toHaveValue('1250');
  await price.fill('1250,50');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar guardado' })).toBeVisible();
  // Cancelar antes de confirmar: esta prueba de entrada no modifica el catálogo.
});
