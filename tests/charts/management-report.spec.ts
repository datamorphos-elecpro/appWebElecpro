import { expect, test } from '@playwright/test';

for (const months of [1, 12, 36]) test(`Gerencia completa: ${months} meses`, async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto(`/tests/fixtures/coverage-pages.html?view=report&months=${months}`);
  await expect(page.getByRole('heading', { name: 'Gerencia y rentabilidad' })).toBeVisible();
  await expect(page.getByText(/Colores financieros|Margen a la fecha|Ejecución presupuestal|continuación/)).toHaveCount(0);
  const charts = page.locator('[data-bar-chart]');
  await expect(charts).toHaveCount(2);
  await expect(charts.nth(0).locator('[data-bar-group]')).toHaveCount(months);
  await expect(charts.nth(0).locator('[data-bar-group] svg')).toHaveCount(months * 3);
  await expect(charts.nth(1).locator('[data-bar-group]')).toHaveCount(45);
  await expect(page.locator('table').last().locator('tbody tr')).toHaveCount(135);
  await expect(page.getByText('Importes en COP, sin decimales.')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: info.outputPath(`management-${months}.pdf`), preferCSSPageSize: true, printBackground: true });
});

for (const width of [1440, 380]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`Gerencia adaptable ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/tests/fixtures/coverage-pages.html?view=analytics&months=12');
    await expect(page.getByRole('button', { name: /^Resultado proyectado/ })).toBeVisible();
    await expect(page.getByText(/Colores financieros|Margen a la fecha|Ejecución presupuestal/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const charts = page.locator('[data-bar-chart]');
    const boxes = await Promise.all([charts.nth(0).boundingBox(), charts.nth(1).boundingBox()]);
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
    const first = page.getByRole('button', { name: /Filtrar por .*Cobros/ }).first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/management_month=2024-01/);
  });
}
