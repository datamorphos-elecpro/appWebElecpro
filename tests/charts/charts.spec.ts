import { expect, test, type Page } from '@playwright/test';

async function assertBounds(page: Page) {
  await expect.poll(() => page.locator('[data-chart-value]').count()).toBeGreaterThan(30);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const errors = await page.locator('[data-chart-value]').evaluateAll((nodes) => nodes.flatMap((node) => {
    const text = node as SVGGraphicsElement;
    const svg = text.closest('svg')!;
    const box = text.getBBox(), name = svg.querySelector<SVGGraphicsElement>('[data-chart-name]')!.getBBox();
    const view = svg.viewBox.baseVal;
    return box.x < name.x + name.width || box.x + box.width > view.width || box.y < 0 || box.y + box.height > view.height ? [text.textContent] : [];
  }));
  expect(errors).toEqual([]);
}

for (const width of [320, 379, 380, 381, 479, 480, 481, 679, 680, 681, 899, 900, 901, 1180, 1181, 1440, 1920]) {
  test(`bounds and local scroll ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/fixtures/');
    await assertBounds(page);
    const region = page.getByRole('region', { name: 'Mixtos', exact: true });
    await region.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    const value = region.locator('[data-chart-value]').first();
    const box = await value.boundingBox(), container = await region.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(container!.x + container!.width);
    await page.screenshot({ path: info.outputPath(`charts-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Cambiar tamaño' }).click();
    await assertBounds(page);
    await page.getByRole('button', { name: 'Cambiar datos' }).click();
    await expect(region.locator('[data-chart-value]').first()).toHaveText('$ 1.000.000.000.000.000.000.000');
    await assertBounds(page);
  });
}

test('keyboard, dialog focus, landscape and print', async ({ page }, info) => {
  await page.setViewportSize({ width: 680, height: 320 });
  await page.goto('/tests/fixtures/');
  const region = page.getByRole('region', { name: 'Mixtos', exact: true });
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const bar = region.getByRole('button').first();
  await bar.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Selección')).toHaveText('0');
  await region.getByRole('button').nth(1).focus(); await page.keyboard.press('Space');
  await expect(page.getByLabel('Selección')).toHaveText('1');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const close = page.getByRole('button', { name: 'Volver a editar' });
  const box = await close.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Vista previa', exact: true })).toBeFocused();
  await page.emulateMedia({ media: 'print' });
  await assertBounds(page);
  expect(await region.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.pdf({ path: info.outputPath('charts.pdf'), format: 'A4', landscape: true, printBackground: true });
  await page.screenshot({ path: info.outputPath('print.png'), fullPage: true });
});

test('200% CSS zoom and touch scrolling', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 680, height: 900 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/tests/fixtures/');
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await assertBounds(page);
  await page.screenshot({ path: info.outputPath('zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.body.style.zoom = '1'; });
  const region = page.getByRole('region', { name: 'Mixtos', exact: true });
  const box = await region.boundingBox();
  const session = await context.newCDPSession(page);
  const y = box!.y + 40;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y }] });
  for (const x of [450, 380, 300, 220, 120]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await context.close();
});

test('long percentages and distribution names stay within the page', async ({ page }) => {
  for (const width of [320, 380, 680, 900, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/fixtures/?extras');
    await assertBounds(page);
    for (const value of await page.locator('[data-testid="project-percent-chart-margin"] output').all()) {
      expect(await value.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
  }
});
