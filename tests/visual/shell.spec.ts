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

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(process.env.E2E_TEST_EMAIL!);
  await page.getByLabel(/contraseña/i, { exact: true }).fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

for (const viewport of [{ width: 900, height: 960 }, { width: 680, height: 900 }, { width: 380, height: 820 }]) {
  test(`mobile navigation ${viewport.width}px opens without moving content and closes through every control`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);

    const main = page.locator('main');
    const sidebar = page.locator('#app-sidebar');
    const menuToggle = page.getByRole('button', { name: 'Abrir navegación' });
    const before = await main.boundingBox();

    await expect(menuToggle).toHaveAttribute('aria-controls', 'app-sidebar');
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).not.toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar.getByRole('button', { name: 'Cerrar navegación' })).toBeFocused();

    const afterOpen = await main.boundingBox();
    expect(afterOpen).not.toBeNull();
    expect(before).not.toBeNull();
    expect(afterOpen!.x).toBeCloseTo(before!.x, 3);
    expect(afterOpen!.width).toBeCloseTo(before!.width, 3);

    const logo = sidebar.getByAltText('Elecpro Ingeniería Eléctrica');
    const logoBox = await logo.boundingBox();
    const logoContainerBox = await logo.locator('..').boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(logoContainerBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    expect(logoBox!.x).toBeGreaterThanOrEqual(logoContainerBox!.x);
    expect(logoBox!.y).toBeGreaterThanOrEqual(logoContainerBox!.y);
    expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(logoContainerBox!.x + logoContainerBox!.width);
    expect(logoBox!.y + logoBox!.height).toBeLessThanOrEqual(logoContainerBox!.y + logoContainerBox!.height);
    expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width);

    await sidebar.getByRole('button', { name: 'Cerrar navegación' }).click();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(menuToggle).toBeFocused();

    await menuToggle.click();
    await page.mouse.click(viewport.width - 2, 2);
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await menuToggle.click();
    await page.keyboard.press('Escape');
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await menuToggle.click();
    await sidebar.getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  });
}

test('desktop sidebar still collapses and expands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page);

  const sidebarToggle = page.locator('#app-sidebar').getByRole('button', { name: 'Contraer menú' });
  await sidebarToggle.click();
  await expect(page.locator('#app-sidebar').getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#app-sidebar').getByRole('button', { name: 'Expandir menú' }).click();
  await expect(page.locator('#app-sidebar').getByRole('button', { name: 'Contraer menú' })).toHaveAttribute('aria-pressed', 'false');
});
