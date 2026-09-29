import { expect, type Page } from '@playwright/test';
export const credentialsAvailable = Boolean(process.env.E2E_TEST_ENVIRONMENT === 'true' && process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
export async function login(page: Page) {
  if (!credentialsAvailable) throw new Error('Configure una cuenta y entorno de prueba: E2E_TEST_ENVIRONMENT=true');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
