import { describe, expect, it } from 'vitest';
import { finishBasePrice, normalizeBasePrice, normalizeUnit } from '../lib/item-input';
import { basePriceSchema, quoteItemSchema } from '../lib/validators/quote';
import { calculateQuote } from '../lib/calculations';
import { parseQuotePrintSize } from '../lib/quote-print';

describe('precios base y unidades', () => {
  it.each(['1250,50', '1250.50', ' 1250,50 '])('normaliza %s sin perder centavos', (input) => {
    expect(normalizeBasePrice(input)).toBe('1250.50');
    expect(basePriceSchema.parse(input)).toBe('1250.50');
  });
  it.each(['0', '0,00', '999999999999.99'])('acepta cero y los límites del importe: %s', (input) => {
    expect(basePriceSchema.safeParse(input).success).toBe(true);
  });
  it.each(['', '-1', '1e3', '1.250,50', '1,250.50', '1.250', '1,250', '0.001', '1000000000000', '1250,', '1250.'])('rechaza %s sin redondearlo ni truncarlo', (input) => {
    expect(normalizeBasePrice(input)).toBeNull();
    expect(basePriceSchema.safeParse(input).success).toBe(false);
  });
  it('completa un separador final al perder foco, pero no completa una entrada inválida', () => {
    expect(finishBasePrice('1250,')).toBe('1250');
    expect(finishBasePrice('1250.')).toBe('1250');
    expect(finishBasePrice('1,250,')).toBe('1,250,');
  });
  it('normaliza los valores recibidos directamente por el servidor', () => {
    const item = quoteItemSchema.parse({ description: 'Conductor', code: '', category: 'material', quantity: '1.25', unit: ' und ', base_unit_price: '1250,50' });
    expect(item.unit).toBe('UND'); expect(item.base_unit_price).toBe('1250.50');
    expect(normalizeUnit(' m² ')).toBe('M²');
    expect(quoteItemSchema.safeParse({ ...item, unit: '   ' }).success).toBe(false);
    const total = calculateQuote([{ category: item.category, quantity: item.quantity, baseUnitPrice: item.base_unit_price }], { materialIncreasePct: '10', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19' });
    expect(total.lines[0].finalUnitPrice.toString()).toBe('1375.55');
    expect(total.directCost.toString()).toBe('1719.4375');
    expect(total.totalAmount.toString()).toBe('2113.1886875');
  });
});

describe('preferencia de impresión', () => {
  it.each(['compact', 'normal', 'large'])('conserva %s', (size) => expect(parseQuotePrintSize(size)).toBe(size));
  it.each([null, undefined, '', 'huge', {}])('usa normal ante una preferencia inválida %s', (size) => expect(parseQuotePrintSize(size)).toBe('normal'));
});
