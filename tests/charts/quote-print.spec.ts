import { expect, test } from '@playwright/test';

for (const width of [1440, 900, 680, 380]) {
  test(`tamaños, persistencia e impresión exclusiva ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/fixtures/quote-document.html');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const dialog = page.getByRole('dialog'); const selector = dialog.getByLabel('Tamaño de letra');
    await expect(selector).toHaveValue('normal');
    await expect(page.locator('.quote-print-portal')).toBeHidden();
    for (const [size, bodyPt, tablePt, headingPt] of [['compact', 9, 8, 11], ['normal', 10, 9, 12], ['large', 12, 10, 14]] as const) {
      await selector.selectOption(size);
      const preview = dialog.getByRole('article'); const printed = page.locator('.quote-print-portal article');
      for (const document of [preview, printed]) {
        await expect(document).toHaveAttribute('data-print-size', size);
        expect(await document.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(bodyPt * 96 / 72, 3);
        expect(await document.locator('table').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(tablePt * 96 / 72, 3);
        expect(await document.locator('h3').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(headingPt * 96 / 72, 3);
      }
    }
    await page.reload(); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await expect(selector).toHaveValue('large');
    expect(await selector.evaluate((node) => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
    await page.screenshot({ path: info.outputPath(`quote-preview-${width}.png`), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('heading', { name: 'Aplicación de prueba' })).toBeHidden();
    await expect(selector).toBeHidden();
    await expect(page.locator('.quote-print-portal')).toBeVisible();
    expect(await page.locator('.quote-print-portal article').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`quote-print-${width}.png`), fullPage: true });
    await page.pdf({ path: info.outputPath(`quote-${width}.pdf`), format: 'A4', printBackground: true });
  });
}
test('almacenamiento deshabilitado y preferencia inválida', async ({ page }) => {
  await page.goto('/tests/fixtures/quote-document.html');
  await page.evaluate(() => localStorage.setItem('elecpro:quote-print-size:v1', 'invalid'));
  await page.reload(); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByLabel('Tamaño de letra')).toHaveValue('normal');
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }); });
  await page.reload(); await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await page.getByLabel('Tamaño de letra').selectOption('large');
  await expect(page.locator('.quote-print-portal article')).toHaveAttribute('data-print-size', 'large');
});
