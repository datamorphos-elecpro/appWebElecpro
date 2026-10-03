import { expect, test } from '@playwright/test';

for (const width of [1440, 900, 680, 380]) {
  test(`tamaños, persistencia e impresión exclusiva ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/fixtures/quote-document.html');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const dialog = page.getByRole('dialog'); const selector = dialog.getByLabel('Tamaño de letra');
    await expect(selector).toHaveValue('normal');
    await expect(dialog.getByText('En el diálogo de impresión puedes elegir orientación, papel y más opciones')).toBeVisible();
    await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'true'; }; });
    await dialog.getByRole('button', { name: 'Imprimir / guardar PDF' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');
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
    const table = dialog.getByRole('table', { name: 'Materiales y servicios' });
    const geometry = await table.evaluate((node) => {
      const cells = Array.from(node.querySelectorAll('thead th')).map((cell) => cell.getBoundingClientRect().width);
      const wrap = node.parentElement!;
      return { cells, scrollable: wrap.scrollWidth > wrap.clientWidth, pageFits: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(geometry.cells[2]).toBeGreaterThan(Math.max(...geometry.cells.filter((_, index) => index !== 2)));
    expect(geometry.pageFits).toBe(true);
    if (width <= 680) expect(geometry.scrollable).toBe(true);
    // Print pagination uses paper dimensions, independently of the preview viewport.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('heading', { name: 'Aplicación de prueba' })).toBeHidden();
    await expect(selector).toBeHidden();
    await expect(page.locator('.quote-print-portal')).toBeVisible();
    expect(await page.locator('.quote-print-portal article').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`quote-print-${width}.png`), fullPage: true });
    await page.pdf({ path: info.outputPath(`quote-${width}.pdf`), format: 'A4', printBackground: true });
  });
}
for (const width of [1440, 900, 680, 380]) {
  test(`vista previa con datos extensos ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/fixtures/quote-document.html?stress');
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (const size of ['compact', 'normal', 'large']) {
      await dialog.getByLabel('Tamaño de letra').selectOption(size);
      const table = dialog.getByRole('table', { name: 'Materiales y servicios' });
      expect(await table.evaluate((node) => Array.from(node.querySelectorAll('td')).every((cell) => cell.scrollWidth <= cell.clientWidth + 1))).toBe(true);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('stress-preview.png'), fullPage: true });
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

for (const format of ['Letter', 'A4'] as const) {
  for (const landscape of [false, true]) {
    for (const size of ['compact', 'normal', 'large'] as const) {
      test(`PDF ${format} ${landscape ? 'horizontal' : 'vertical'} ${size}`, async ({ page }, info) => {
        const paperWidth = format === 'A4' ? 794 : 816;
        const paperHeight = format === 'A4' ? 1123 : 1056;
        await page.setViewportSize({ width: landscape ? paperHeight : paperWidth, height: landscape ? paperWidth : paperHeight });
        await page.goto('/tests/fixtures/quote-document.html?stress');
        await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
        await page.getByLabel('Tamaño de letra').selectOption(size);
        await page.emulateMedia({ media: 'print' });
        const printed = page.locator('.quote-print-portal article');
        const table = printed.getByRole('table', { name: 'Materiales y servicios' });
        expect(await table.evaluate((node) => getComputedStyle(node).tableLayout)).toBe('auto');
        expect(await table.locator('thead').evaluate((node) => getComputedStyle(node).display)).toBe('table-header-group');
        expect(await table.locator('tbody tr').first().evaluate((node) => getComputedStyle(node).breakInside)).toBe('avoid');
        expect(await table.locator('tbody tr').first().locator('td').nth(3).evaluate((node) => [getComputedStyle(node).textAlign, getComputedStyle(node).whiteSpace])).toEqual(['right', 'nowrap']);
        const layout = await printed.evaluate((node) => ({
          fits: node.scrollWidth <= node.clientWidth,
          cellsFit: Array.from(node.querySelectorAll('td')).every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
          justified: Array.from(node.querySelectorAll('p, tbody td:nth-child(3)')).filter((cell) => getComputedStyle(cell).textAlign === 'justify').length,
        }));
        expect(layout.fits).toBe(true);
        expect(layout.cellsFit).toBe(true);
        expect(layout.justified).toBeGreaterThan(36);
        const greeting = printed.locator('> p');
        expect(await greeting.evaluate((node) => [getComputedStyle(node).textAlign, getComputedStyle(node).textAlignLast, getComputedStyle(node).whiteSpace])).toEqual(['justify', 'left', 'pre-line']);
        await expect(greeting).toContainText('\nGracias por su interés.');
        await page.screenshot({ path: info.outputPath('print.png'), fullPage: true });
        await page.pdf({ path: info.outputPath('quote.pdf'), format, landscape, printBackground: true, preferCSSPageSize: true });
      });
    }
  }
}
