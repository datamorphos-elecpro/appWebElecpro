import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  test(`portada pública ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /operación de tus proyectos eléctricos/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toHaveAttribute('href', '/login');
    await expect(page.getByAltText('Elecpro Ingeniería Eléctrica').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('el panel exige una sesión activa', async ({ page }) => {
  await page.goto('/panel');
  await expect(page).toHaveURL(/\/login$/);
});
