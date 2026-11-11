import { expect, test } from '@playwright/test';
import { managementMetrics } from '../../lib/management-report';
import { metricLabels } from '../../lib/analytics-detail';
import { metricReportFixture } from '../fixtures/analytics-improvements-data';

const fixture = '/tests/fixtures/analytics-improvements.html';
test('comercial muestra pendientes y filtra los segmentos por cliente y estado', async ({ page }) => {
  await page.goto(fixture);
  await expect(page.getByRole('button', { name: /^Valor pendiente de aprobación/ })).toContainText('2.000.000');
  await expect(page.getByRole('button', { name: /Filtrar Cliente principal · Enviada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrador: 1 · $ 0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Filtrar Cliente principal · Enviada/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/commercial_status=sent/); await expect(page).toHaveURL(/commercial_client=/);
});

test('cronograma conserva orden de categorías y añade el filtro', async ({ page }) => {
  await page.goto(`${fixture}?tab=operation`);
  const chart = page.getByRole('region', { name: 'Proyectos por estado', exact: true });
  await expect(chart.getByRole('button').first()).toHaveAttribute('aria-label', /En proceso: 6/);
  await expect(page.getByText('Activos por responsable')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtrar por Atrasados: 4' }).click();
  await expect(page).toHaveURL(/operation_schedule=overdue/);
});

for (const metric of managementMetrics) test(`informe completo ${metric}`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto(`${fixture}?view=report&metric=${metric}&management_month=1900-01`);
  await expect(page.getByRole('heading', { name: metricLabels[metric], exact: true })).toBeVisible();
  const rows = page.locator('table[data-metric-detail]').locator('tbody tr:not([class*=subtotal])');
  await expect(rows).toHaveCount(135);
  await expect(page.locator('[data-economic-summary] > div')).toHaveCount(6);
  await expect(page.getByText('Total general:')).toBeVisible();
  await expect(page.getByText(/El periodo de caja no limita este informe/)).toBeVisible();
  if (metric === 'management.profit') await expect(page.locator('[data-tone=danger]').first()).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: info.outputPath(`${metric}.pdf`), preferCSSPageSize: true, printBackground: true });
  await page.screenshot({ path: info.outputPath(`${metric}.png`) });
});

test('vista previa desde el modal conserva la página y permite reintentar', async ({ page }) => {
  let reportAttempts = 0;
  // The real report page is rendered inside its production iframe URL by Vite's fixture.
  await page.route('**/analisis/informe?**', async (route) => {
    if (reportAttempts++ === 0) { await route.fulfill({ contentType: 'text/html', body: '<p role="alert">Informe no disponible</p>' }); return; }
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${url.origin}${fixture}?${url.searchParams}&view=report` });
    await route.fulfill({ response });
  });
  await page.route('**/api/analisis/detalle?**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const metric = params.get('metric') as typeof managementMetrics[number];
    // Generate fixture in Node with the same amounts as the browser report.
    const report = metricReportFixture(metric);
    const pageNumber = Number(params.get('page')); const pageSize = Number(params.get('pageSize'));
    await route.fulfill({ json: { ...report, page: pageNumber, pageSize, records: report.records.slice((pageNumber - 1) * pageSize, pageNumber * pageSize) } });
  });
  await page.goto(`${fixture}?metrics=1`);
  await page.getByRole('button', { name: /^Cartera pendiente/ }).click();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Página 2 de 7')).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir como PDF', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Vista previa del informe' });
  await expect(preview.getByRole('button', { name: 'Imprimir / guardar PDF' })).toBeDisabled();
  await preview.getByRole('button', { name: 'Reintentar' }).click();
  await expect(preview.getByRole('button', { name: 'Imprimir / guardar PDF' })).toBeEnabled();
  await preview.getByRole('button', { name: 'Volver a Análisis' }).click();
  await expect(page.getByText('Página 2 de 7')).toBeVisible();
});

test('informe vacío y detalle de proyecto legibles en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  await page.goto(`${fixture}?view=report&metric=management.balance&empty=1`);
  await expect(page.getByText('Sin registros para los filtros aplicados.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/tests/fixtures/finance-workspace.html?view=project&section=summary');
  await expect(page.getByText('Ganancia proyectada', { exact: true })).toHaveCount(0);
  const header = page.locator('header').filter({ has: page.getByRole('heading', { name: 'Instalación eléctrica' }) });
  await expect(header.getByText('Gastos reales', { exact: false })).toContainText('1.000');
});

for (const width of [1440, 380]) test(`barras y cronograma adaptables ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  for (const tab of ['commercial', 'operation']) {
    await page.goto(`${fixture}?tab=${tab}`);
    await expect(page.getByRole('heading', { name: tab === 'commercial' ? 'Valor por cliente' : 'Estado del cronograma' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${tab}-${width}.png`), fullPage: true });
  }
});

for (const tab of ['operation', 'commercial']) test(`informe general actualizado ${tab}`, async ({ page }, info) => {
  await page.goto(`${fixture}?view=report&tab=${tab}`);
  await expect(page.getByRole('heading', { name: tab === 'operation' ? 'Estado del cronograma' : 'Valor por cliente', exact: true })).toBeVisible();
  if (tab === 'commercial') await expect(page.locator('[data-client-quote-bar]')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: info.outputPath(`${tab}.pdf`), preferCSSPageSize: true, printBackground: true });
});
