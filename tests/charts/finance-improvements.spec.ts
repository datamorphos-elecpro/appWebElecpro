import { expect, test } from '@playwright/test';
import { metricLabels, type AnalysisMetric } from '../../lib/analytics-detail';

const fixture = '/tests/fixtures/finance-workspace.html';
const projectRow = { kind: 'project', id: '33333333-3333-4333-8333-333333333333', project_id: '33333333-3333-4333-8333-333333333333', label: 'PRY-TEST', title: 'Instalación eléctrica', client_name: 'Cliente de prueba', status: 'approved', project_value: '1000000', paid: '900000', withheld: '100000', balance: '0', profit_mode: 'value', base: '1000000', expenses: '100', budget: '200', amount: '1000000' };
function detail(metric: AnalysisMetric, page = 1, pageSize = 20) {
  const quote = { kind: 'quote', id: projectRow.id, quote_id: projectRow.id, label: 'COT-TEST', title: 'Propuesta', client_name: 'Cliente de prueba', status: 'approved', date: '2026-10-22', valid_until: '2026-11-22', quote_value: '1000000', amount: '1' };
  const distribution = { kind: 'distribution', id: projectRow.id, label: 'Socio de prueba', mode: 'fixed', rule_value: '100', is_paid: true, is_active: true, date: '2026-10-22', paid_amount: '100', amount: metric === 'distribution.available' ? '-100' : '100' };
  const expense = { kind: 'expense', id: projectRow.id, project_id: projectRow.id, label: 'PRY-TEST', title: 'Instalación eléctrica', client_name: 'Cliente de prueba', date: '2026-10-22', category: 'Materiales', note: 'Conductor', amount: '100' };
  return { metric, page, pageSize, total: 25, unit: metric === 'commercial.approval' ? 'percent' : ['commercial.validSent','commercial.expired'].includes(metric) ? 'count' : 'money', value: metric === 'commercial.approval' ? '50' : '1000000', components: { approved: '1', decisions: '2', result: '1000000', paid: '100', pending: '0', assigned: '100' }, records: metric === 'management.expenses' ? [expense] : metric.startsWith('commercial.') ? [quote] : metric.startsWith('distribution.') && metric !== 'distribution.result' ? metric === 'distribution.available' ? [projectRow, distribution] : [distribution] : [projectRow] };
}

test('las 14 tarjetas abren su tabla, conservan filtros y restauran foco', async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/api/analisis/detalle?**', async (route) => {
    const params = new URL(route.request().url()).searchParams; queries.push(params);
    await route.fulfill({ json: detail(params.get('metric') as AnalysisMetric) });
  });
  await page.goto(`${fixture}?management_status=approved&commercial_month=2026-10&distribution_activity=active`);
  for (const [metric, label] of Object.entries(metricLabels)) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}\\s*0$`) });
    await button.focus(); await page.keyboard.press('Enter');
    const modal = page.getByRole('dialog', { name: label, exact: true });
    await expect(modal.getByRole('table')).toBeVisible();
    expect(queries.at(-1)?.get('metric')).toBe(metric);
    expect(queries.at(-1)?.get('management_status')).toBe('approved');
    await expect(modal.getByText('Total del conjunto:', { exact: false })).toContainText('25 registros');
    await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(button).toBeFocused();
  }
});

test('detalle pagina, cambia tamaño, informa error y permite reintentar', async ({ page }) => {
  let fail = true;
  await page.route('**/api/analisis/detalle?**', async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Error de prueba' } }); return; }
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: detail(params.get('metric') as AnalysisMetric, Number(params.get('page')), Number(params.get('pageSize'))) });
  });
  await page.goto(fixture); await page.getByRole('button', { name: /^Valor de proyectos/ }).click();
  const modal = page.getByRole('dialog'); await expect(modal.getByRole('alert')).toContainText('Error de prueba');
  await modal.getByRole('button', { name: 'Reintentar' }).click();
  await expect(modal.getByRole('link', { name: /PRY-TEST/ })).toHaveAttribute('href', `/proyectos/${projectRow.id}`);
  await modal.getByRole('button', { name: 'Siguiente' }).click(); await expect(modal).toContainText('Página 2 de 2');
  await modal.getByLabel('Registros por página').selectOption('50'); await expect(modal).toContainText('Página 1 de 1');
  await expect(modal.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});

test('detalle vacío y aprobación sin decisiones; una respuesta vieja no reemplaza otra métrica', async ({ page }) => {
  await page.route('**/api/analisis/detalle?**', async (route) => {
    const metric = new URL(route.request().url()).searchParams.get('metric') as AnalysisMetric;
    if (metric === 'management.projectValue') await new Promise((resolve) => setTimeout(resolve, 500));
    const body = { ...detail(metric), total: 0, records: [], value: metric === 'commercial.approval' ? null : '0', components: { approved: '0', decisions: '0' } };
    await route.fulfill({ json: body }).catch(() => {});
  });
  await page.goto(fixture); await page.getByRole('button', { name: /^Valor de proyectos/ }).click();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: /^Aprobación/ }).click();
  const modal = page.getByRole('dialog', { name: 'Aprobación', exact: true });
  await expect(modal).toContainText('No calculable'); await expect(modal).toContainText('Sin registros para estos filtros.');
  await expect(modal).toContainText('Sin decisiones'); await expect(modal).toContainText('Página 1 de 1');
  await expect(modal.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await page.waitForTimeout(600); await expect(modal).toContainText('No calculable');
});

for (const width of [1440, 900, 680, 380]) test(`detalle y retenciones adaptables a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/analisis/detalle?**', (route) => route.fulfill({ json: detail('management.balance') }));
  await page.goto(fixture); await page.getByRole('button', { name: /^Cartera pendiente/ }).click();
  await expect(page.getByRole('dialog').getByRole('columnheader', { name: 'Retenciones' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true });
  await page.keyboard.press('Escape');
  await page.goto(`${fixture}?view=project`); await page.getByRole('button', { name: 'Registrar retención', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Registrar retención', exact: true });
  await form.getByLabel('Tipo de retención').selectOption('other'); await form.getByLabel('Valor retenido').fill('100000');
  await form.getByLabel('Observación (obligatoria)').fill('Retención contractual');
  await form.getByRole('button', { name: 'Guardar retención' }).click();
  await page.getByRole('dialog', { name: 'Confirmar retención' }).getByRole('button', { name: 'Registrar retención' }).click();
  await expect(page.getByRole('status')).toContainText('Retención registrada');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elecpro:test:withholding')!).amount)).toBe('100000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`withholdings-${width}.png`), fullPage: true });
});

test('retenciones rechazan exceso y anulación sin motivo; gastos conservan historial y solo sugieren el listado fijo', async ({ page }) => {
  await page.goto(`${fixture}?view=project`); await page.getByRole('button', { name: 'Registrar retención', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Registrar retención', exact: true });
  await form.getByLabel('Valor retenido').fill('200001'); await form.getByRole('button', { name: 'Guardar retención' }).click();
  await expect(form.getByRole('alert')).toContainText('supera la cartera'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Anular', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Anular retención' }); await confirm.getByRole('button', { name: 'Anular retención' }).click();
  await expect(confirm.getByRole('alert')).toContainText('motivo'); await confirm.getByLabel('Motivo de anulación').fill('Error de registro');
  await confirm.getByRole('button', { name: 'Anular retención' }).click(); await expect(confirm).toHaveCount(0);
  await page.goto(`${fixture}?view=project&section=costs`); await page.getByRole('button', { name: 'Registrar gasto' }).click();
  const expense = page.getByRole('dialog', { name: 'Registrar gasto' });
  await expect(expense.locator('datalist option[value="Categoría histórica especial"]')).toHaveCount(0);
  expect(await expense.locator('datalist option').evaluateAll((options) => options.map((option) => option.getAttribute('value')))).toEqual(['Materiales', 'Mano de obra', 'Transporte', 'Terceros', 'Equipos', 'Alquiler de equipos', 'Herramientas', 'Viáticos y alimentación', 'Ingeniería y diseño', 'Permisos y certificaciones', 'Varios']);
  await expect(expense.getByText('Elija una categoría o escriba una nueva.')).toHaveCount(0);
  await expense.getByLabel('Categoría', { exact: false }).fill('Nueva categoría');
  await expense.getByLabel('Valor', { exact: true }).fill('100'); await expense.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirmar registro' }).getByRole('button', { name: 'Guardar registro' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elecpro:test:project-record')!).input.category)).toBe('Nueva categoría');
  await page.reload();
  await expect(page.getByText('Categoría histórica especial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar gasto' }).click();
  await expect(page.getByRole('dialog', { name: 'Registrar gasto' }).locator('datalist option[value="Nueva categoría"]')).toHaveCount(0);
});
