import { expect, test } from '@playwright/test';

const viewports = [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }];

for (const viewport of viewports) {
  test(`las pantallas de acceso son adaptables a ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const path of ['/login', '/recuperar-acceso']) {
      await page.goto(path);
      const card = page.locator('section[aria-labelledby]');
      const logo = page.getByAltText('Elecpro Ingeniería Eléctrica');

      await expect(card).toBeVisible();
      await expect(logo).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs((box!.x + box!.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(2);
    }
  });
}

test('el login conserva campos, enlaces y mensaje de error accesibles', async ({ page }) => {
  await page.goto('/login?error=Correo%20o%20contraseña%20inválidos');
  await expect(page.getByLabel(/correo electrónico/i)).toBeVisible();
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar-acceso');
  await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña inválidos' })).toHaveText('Correo o contraseña inválidos');
});

test('recuperar acceso conserva sus controles y enlace de regreso', async ({ page }) => {
  await page.goto('/recuperar-acceso');
  await expect(page.getByRole('heading', { name: 'Recuperar acceso' })).toBeVisible();
  await expect(page.getByLabel(/correo electrónico/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login');
});

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
