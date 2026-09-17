import { expect, test } from '@playwright/test';

test('la contraseña se puede mostrar sin enviar el formulario ni perder el foco', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Contraseña', { exact: true });
  const toggle = page.getByRole('button', { name: 'Mostrar contraseña' });

  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('Secreta-123');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Secreta-123');
  await expect(password).toBeFocused();
  await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeVisible();
});

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

test('los filtros del listado conservan tamaño y reinician la página', async ({ page }) => {
  test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas y fixtures deterministas.');
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.goto('/cotizaciones?page=2&pageSize=50&sort=number&direction=asc');
  await page.getByLabel('Buscar').fill('prueba');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/q=prueba/);
  await expect(page).toHaveURL(/pageSize=50/);
  await expect(page).toHaveURL(/sort=number/);
  await expect(page).toHaveURL(/direction=asc/);
  await expect(page).not.toHaveURL(/(?:\?|&)page=2(?:&|$)/);
});
