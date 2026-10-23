import { expect, test } from '@playwright/test';

for (const width of [1440, 380]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`alertas y fondos ${width}px ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/tests/fixtures/current-alerts.html');
    const card = page.getByRole('link').filter({ hasText: 'Cartera pendiente' });
    await expect(card).toContainText(/PRY-42.*Cliente verificable.*Instalación eléctrica.*En proceso/);
    await expect(card).toContainText(/Valor contratado.*100.000.*Anticipos.*60.000.*Retenciones vigentes.*10.000.*Total cubierto.*70.000.*Saldo pendiente.*30.000/);
    await expect(page.getByRole('link').filter({ hasText: 'Sobrecosto' })).toContainText(/Exceso.*1.*1.0 %/);
    await expect(page.getByRole('link', { name: /^Retraso/ })).toContainText('1 día de retraso');
    await expect(page.getByRole('link', { name: /^Finalización próxima/ })).toContainText('15 días restantes');
    const cells = page.getByRole('cell');
    for (const [index, tone] of [[0, 'danger'], [1, 'success'], [3, 'warning'], [5, 'danger']] as const) {
      await expect(cells.nth(index)).toHaveAttribute('data-tone', tone);
      await expect(cells.nth(index)).toHaveAttribute('aria-description', /.+/);
    }
    for (const index of [2, 4, 6]) await expect(cells.nth(index)).not.toHaveAttribute('data-tone');
    const percentages = page.getByTestId('project-percent-chart-execution').locator('output');
    await expect(percentages.nth(0)).toHaveText('100.0%');
    await expect(percentages.nth(0)).toHaveAttribute('data-tone', 'danger');
    await expect(percentages.nth(1)).not.toHaveAttribute('data-tone');
    const contrast = await page.locator('td[data-tone]').evaluateAll((nodes) => nodes.map((node) => {
      const luminance = (color: string) => {
        const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
      };
      const style = getComputedStyle(node);
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }));
    expect(contrast.every((ratio) => ratio >= 4.5)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Actualizar' }).focus();
    await page.keyboard.press('Tab');
    await expect(card).toBeFocused();
    await page.screenshot({ path: info.outputPath('current-alerts.png'), fullPage: true });
  });
}

test('entrada sin doble consulta, botón y retorno con foco/visibilidad deduplicados', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { refreshes: number }).refreshes = 0;
    window.addEventListener('fixture:refresh', () => { (window as unknown as { refreshes: number }).refreshes++; });
  });
  await page.goto('/tests/fixtures/current-alerts.html');
  const count = () => page.evaluate(() => (window as unknown as { refreshes: number }).refreshes);
  await expect(page.locator('div[aria-busy]').getByRole('status')).toContainText('11:00:00');
  expect(await count()).toBe(0);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  expect(await count()).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await count()).toBe(2);
});

for (const date of ['', 'inválida']) test(`fecha no disponible: ${date}`, async ({ page }) => {
  await page.goto(`/tests/fixtures/current-alerts.html?date=${encodeURIComponent(date)}`);
  await expect(page.locator('div[aria-busy]').getByRole('status')).toHaveText('Última actualización: no disponible');
  await expect(page.getByRole('link').filter({ hasText: 'Cartera pendiente' })).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.locator('div[aria-busy]').getByRole('status')).toHaveText('Última actualización: no disponible');
});

for (const view of ['dashboard', 'alerts']) for (const date of ['missing', '', 'invalid', '2026-10-23T16:00:00Z']) {
  test(`${view} sin alertas con fecha ${date}`, async ({ page }) => {
    await page.goto(`/tests/fixtures/coverage-pages.html?view=${view}&date=${encodeURIComponent(date)}`);
    const status = page.locator('div[aria-busy]').getByRole('status');
    await expect(status).toContainText(date.includes('T16:') ? '11:00:00' : 'Última actualización: no disponible');
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeEnabled();
    if (view === 'alerts') await expect(page.getByText('No hay alertas activas con estos filtros.')).toBeVisible();
  });
}

for (const view of ['dashboard', 'alerts']) for (const width of [1440, 900, 680, 380]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`presentacion ${view} ${width}px ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme });
    await page.goto(`/tests/fixtures/coverage-pages.html?view=${view}&alerts=1`);
    if (view === 'dashboard') {
      const refresh = page.getByRole('button', { name: 'Actualizar', exact: true });
      const excel = page.getByRole('link', { name: 'Exportar Excel' });
      const a = (await refresh.boundingBox())!, b = (await excel.boundingBox())!;
      expect(a.x + a.width).toBeLessThanOrEqual(b.x);
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      await refresh.focus();
      await page.keyboard.press('Tab');
      await expect(excel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: '+ Nuevo proyecto' })).toBeFocused();
      await expect(page.getByRole('columnheader')).toHaveText(['Proyecto', 'Estado', 'Responsable', 'Valor', 'Cubierto']);
    }
    const colors: string[] = [];
    for (const label of ['Retraso', 'Sobrecosto', 'Cartera pendiente', 'Finalizaci\u00f3n pr\u00f3xima']) {
      const card = page.getByRole('link').filter({ has: page.locator('strong', { hasText: label }) });
      await expect(card).toBeVisible();
      const result = await card.evaluate((node) => {
        const style = getComputedStyle(node), title = getComputedStyle(node.querySelector('strong')!);
        const lum = (color: string) => {
          const c = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
        };
        const bg = lum(style.backgroundColor);
        return { color: title.color, ratios: [style.color, title.color].map(c => (Math.max(lum(c), bg) + .05) / (Math.min(lum(c), bg) + .05)) };
      });
      expect(result.ratios.every(r => r >= 4.5)).toBe(true);
      colors.push(result.color);
    }
    expect(colors[0]).toBe(colors[1]);
    expect(new Set(colors).size).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('presentation.png'), fullPage: true });
  });
}
