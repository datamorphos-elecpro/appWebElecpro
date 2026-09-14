import { expect, test } from '@playwright/test';

const credentialsAvailable = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
test.skip(!credentialsAvailable, 'Requiere credenciales de prueba autenticadas y datos deterministas.');

for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  for (const tab of ['management', 'operation', 'commercial']) {
    test(`análisis ${tab} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
      await page.getByLabel(/contrase(?:ñ|n)a/i).fill(process.env.E2E_TEST_PASSWORD!);
      await page.getByRole('button', { name: /ingresar/i }).click();
      await page.goto(`/analisis?tab=${tab}`);
      await expect(page.getByRole('tab', { name: new RegExp(tab === 'management' ? 'gerencia' : tab, 'i') })).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveScreenshot(`analytics-${tab}-${viewport.width}.png`, { fullPage: true });
    });
  }
}
