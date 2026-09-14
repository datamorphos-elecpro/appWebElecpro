import { expect, test, type Page } from '@playwright/test';

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas y fixtures deterministas.');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contraseña/i).fill(process.env.E2E_TEST_PASSWORD!);
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
