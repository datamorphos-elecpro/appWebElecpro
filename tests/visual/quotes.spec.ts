import { expect, test, type Page } from '@playwright/test';

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas y fixtures deterministas.');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contraseña/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /ingresar/i }).click();
}

for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  test(`listado y modal inicial de cotizaciones ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.goto('/cotizaciones');
    await expect(page).toHaveScreenshot(`quotes-list-${viewport.width}.png`, { fullPage: true });
    await page.getByRole('link', { name: /nueva cotización/i }).click();
    await expect(page.getByRole('dialog', { name: /nueva cotización/i })).toBeVisible();
    await expect(page).toHaveScreenshot(`quotes-new-${viewport.width}.png`, { fullPage: true });
  });
}

test('editor y vista previa de una cotización guardada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto('/cotizaciones');
  const firstQuote = page.getByRole('link', { name: /abrir cotización/i }).first();
  test.skip(await firstQuote.count() === 0, 'El fixture autenticado no contiene cotizaciones.');
  await firstQuote.click();
  await expect(page.getByText('1. Información principal')).toBeVisible();
  await expect(page).toHaveScreenshot('quote-editor-1440.png', { fullPage: true });
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await expect(page.getByRole('dialog', { name: /vista previa/i })).toBeVisible();
  await expect(page).toHaveScreenshot('quote-preview-1440.png', { fullPage: true });
});

test('recupera el borrador desde el modal inicial tras salir del editor', async ({ page }) => {
  await login(page);
  await page.goto('/cotizaciones/nueva');
  const modal = page.getByRole('dialog', { name: 'Nueva cotización' });
  await modal.getByLabel('Nombre del proyecto o servicio').fill('Servicio pendiente de recuperar');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.includes(':quote:new')))).toBe(true);
  await page.goto('/cotizaciones');
  await page.goto('/cotizaciones/nueva');
  await expect(modal.getByRole('button', { name: 'Recuperar borrador' })).toBeVisible();
  await modal.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(modal.getByLabel('Nombre del proyecto o servicio')).toHaveValue('Servicio pendiente de recuperar');
});

test('recupera datos y sección activa de una cotización existente', async ({ page }) => {
  await login(page);
  await page.goto('/cotizaciones');
  const firstQuote = page.getByRole('link', { name: /abrir cotización/i }).first();
  test.skip(await firstQuote.count() === 0, 'Se requiere una cotización editable.');
  await firstQuote.click();
  test.skip(await page.getByText(/Esta cotización ya fue convertida/).count() > 0, 'La cotización está convertida.');
  const section = page.getByText('4. Alcance y condiciones');
  await section.click();
  await page.getByLabel('Alcance y actividades').fill('Alcance pendiente de recuperar');
  await page.goto('/cotizaciones');
  await page.goBack();
  const modal = page.getByRole('dialog', { name: 'Borrador de cotización' });
  await modal.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByLabel('Alcance y actividades')).toHaveValue('Alcance pendiente de recuperar');
  await expect(page.getByText('4. Alcance y condiciones').locator('..')).toHaveAttribute('open', '');
});
