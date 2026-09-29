import { describe, expect, it } from 'vitest';
import { barChartLayout, wrapChartLabel } from '../lib/bar-chart-layout';
const measure = (text: string) => text.length * 8;
describe('horizontal bar geometry', () => {
  for (const values of [[], ['0'], ['0', '0'], ['1', '999999999999.99'], ['-1', '-999999999999.99'], ['-999999999999.99', '0', '700000000000'], Array.from({ length: 80 }, (_, i) => String(i - 40))]) {
    it(`keeps all labels inside the canvas: ${values.slice(0, 3)}`, () => {
      const data = values.map((value, i) => ({ key: String(i), label: 'Proyecto de ingeniería ' + 'NombreSinEspacios'.repeat(8), value, formattedValue: '$ ' + value }));
      const layout = barChartLayout(data, 320, measure);
      for (const row of layout.rows) {
        const left = row.negative ? row.labelX - measure(row.formattedValue) : row.labelX;
        const right = row.negative ? row.labelX : row.labelX + measure(row.formattedValue);
        expect(left).toBeGreaterThanOrEqual(222);
        expect(right).toBeLessThanOrEqual(layout.width - 11);
        expect(row.lines.join('')).toBe(row.label);
        expect(row.lines.every((line) => measure(line) <= 200)).toBe(true);
        expect(Number.isFinite(row.barWidth)).toBe(true);
      }
    });
  }
  it('uses proportional positive and negative lengths', () => {
    const layout = barChartLayout(['-100', '300'].map((value) => ({ key: value, label: value, value, formattedValue: value })));
    expect(layout.rows[1].barWidth / layout.rows[0].barWidth).toBeCloseTo(3);
  });
  it('preserves unicode and whitespace', () => {
    const text = 'Ingeniería  eléctrica🛠️ en Bogotá';
    expect(wrapChartLabel(text, 32, measure).join('')).toBe(text);
  });
});
