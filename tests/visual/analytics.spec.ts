import { expect, test } from '@playwright/test';

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas y datos deterministas.');

test('análisis cambia de vista por clic y conserva los filtros de cada submódulo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contrase(?:ñ|n)a/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.goto('/analisis?management_status=approved&operation_status=in_progress&commercial_status=sent&distribution_activity=active');

  const management = page.getByRole('tab', { name: /gerencia/i });
  const operation = page.getByRole('tab', { name: /operación/i });
  const commercial = page.getByRole('tab', { name: /comercial/i });
  const distribution = page.getByRole('tab', { name: /distribuciones/i });

  await expect(management).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/analisis\?[^#]*management_status=approved/);
  await expect(page).not.toHaveURL(/[?&]tab=/);
  await expect(page.getByLabel(/Estado: 1 seleccionados/)).toContainText('Aprobado');
  await expect(page.getByText('Resultado financiero por proyecto', { exact: true })).toBeVisible();

  await operation.click();
  await expect(page).toHaveURL(/[?&]tab=operation/);
  await expect(operation).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Estado: 1 seleccionados/)).toContainText('En proceso');
  await expect(page.getByText('Cronograma y retrasos', { exact: true })).toBeVisible();

  await commercial.click();
  await expect(page).toHaveURL(/[?&]tab=commercial/);
  await expect(commercial).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Estado: 1 seleccionados/)).toContainText('Enviada');
  await expect(page.getByText('Detalle de cotizaciones', { exact: true })).toBeVisible();

  await distribution.click();
  await expect(page).toHaveURL(/[?&]tab=distribution/);
  await expect(distribution).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Estado: 1 seleccionados/)).toContainText('Activas');
  await expect(page.getByText('Participaciones', { exact: true })).toBeVisible();

  await management.click();
  await expect(page).not.toHaveURL(/[?&]tab=/);
  await expect(management).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Estado: 1 seleccionados/)).toContainText('Aprobado');
  await expect(page.getByText('Resultado financiero por proyecto', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/management_status=approved/);
  await expect(page).toHaveURL(/operation_status=in_progress/);
  await expect(page).toHaveURL(/commercial_status=sent/);
  await expect(page).toHaveURL(/distribution_activity=active/);
});

test('los gráficos porcentuales muestran etiquetas completas sin desbordar y filtran con teclado', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 820 });
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contrase(?:ñ|n)a/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.goto('/analisis');

  const execution = page.getByTestId('project-percent-chart-execution');
  const margin = page.getByTestId('project-percent-chart-margin');
  await expect(execution).toBeVisible();
  await expect(margin).toBeVisible();
  expect(await execution.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  expect(await margin.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();

  const project = execution.getByRole('button').first();
  await expect(project).toHaveAttribute('aria-label', /Filtrar por .+: Ejecución \d+\.\d+%/);
  await project.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/management_project=/);
});

test('el informe abre en un modal y conserva filtros múltiples', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contrase(?:ñ|n)a/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.goto('/analisis?management_status=approved&management_status=in_progress');
  await expect(page.getByLabel(/Estado: 2 seleccionados/)).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir / guardar PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vista previa del informe' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /management_status=approved.*management_status=in_progress/);
  await expect(dialog.getByRole('button', { name: 'Imprimir / guardar PDF' })).toBeEnabled();
  const report = dialog.frameLocator('iframe');
  await expect(report.locator('.analysis-print-root')).toBeVisible();
  await expect(report.locator('[data-app-shell]')).toHaveCount(0);
  await expect(report.getByText('Diferencia de caja')).toBeVisible();
  await dialog.getByRole('button', { name: 'Volver a Análisis' }).click();
  await expect(dialog).toHaveCount(0);
});

test('solo un filtro de análisis permanece abierto', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contrase(?:ñ|n)a/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.goto('/analisis');
  const client = page.getByRole('button', { name: /Cliente: Todos/ });
  const project = page.getByRole('button', { name: /Proyecto: Todos/ });
  await client.click();
  await expect(client).toHaveAttribute('aria-expanded', 'true');
  await project.click();
  await expect(client).toHaveAttribute('aria-expanded', 'false');
  await expect(project).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(project).toHaveAttribute('aria-expanded', 'false');
});

for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  for (const tab of ['management', 'operation', 'commercial']) {
    test(`análisis ${tab} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
      await page.getByLabel(/contrase(?:ñ|n)a/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
      await page.getByRole('button', { name: /ingresar/i }).click();
      await page.goto(`/analisis?tab=${tab}`);
      await expect(page.getByRole('tab', { name: new RegExp(tab === 'management' ? 'gerencia' : tab, 'i') })).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveScreenshot(`analytics-${tab}-${viewport.width}.png`, { fullPage: true });
    });
  }
}
