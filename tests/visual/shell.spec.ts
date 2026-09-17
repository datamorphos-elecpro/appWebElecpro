import { expect, test } from '@playwright/test';

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas, no datos ni secretos versionados.');

for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  test(`shell ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
    await page.getByLabel(/contraseña/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole('link', { name: /panel general/i })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveScreenshot(`shell-${viewport.width}.png`, { fullPage: true });
  });
}
