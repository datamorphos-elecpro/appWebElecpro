import { expect, test } from '@playwright/test';
import { credentialsAvailable, login } from './auth';

const widths = [320, 379, 380, 381, 479, 480, 481, 599, 600, 601, 679, 680, 681, 699, 700, 701, 899, 900, 901, 1179, 1180, 1181, 1440, 1920];
for (const width of widths) {
  test(`públicas ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/login', '/recuperar-acceso']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${path.replaceAll('/', '') || 'portada'}-${width}.png`), fullPage: true });
    }
  });
  test(`privadas ${width}px`, async ({ page }, info) => {
    test.skip(!credentialsAvailable, 'Pendiente: cuenta y entorno de prueba confirmados.');
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const path of ['/panel', '/analisis', '/analisis?tab=operation', '/analisis?tab=commercial', '/analisis?tab=distribution', '/proyectos', '/cotizaciones', '/clientes', '/proveedores', '/catalogo', '/alertas', '/administracion/usuarios', ...(process.env.E2E_PROJECT_ID ? [`/proyectos/${process.env.E2E_PROJECT_ID}`] : []), ...(process.env.E2E_QUOTE_ID ? [`/cotizaciones/${process.env.E2E_QUOTE_ID}`] : [])]) {
      await page.goto(path);
      await expect(page.locator('[data-app-shell]')).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${path.replaceAll(/[^a-z0-9]/gi, '-')}-${width}.png`), fullPage: true });
    }
  });
}
