import { describe, expect, it } from 'vitest';
import { calculateQuote } from '../lib/calculations';
import { normalizeItemVat } from '../lib/item-input';
import { categoryOptions, categoryText } from '../lib/presentation';
import { catalogCategoryValues, itemVatSchema, quoteItemSchema } from '../lib/validators/quote';

const rates = { materialIncreasePct: '10', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19' };
const item = { description: 'Instalación', code: 'MO-001', category: 'material', quantity: '2', unit: 'UND', base_unit_price: '100000' };

describe('IVA opcional por ítem', () => {
  it.each([[undefined, '0'], ['', '0'], ['  ', '0'], ['0', '0'], ['19', '19'], ['19,25', '19.25'], [' 19.25 ', '19.25'], ['100,00', '100.00']])('normaliza %s como %s', (input, expected) => {
    expect(itemVatSchema.parse(input)).toBe(expected);
    expect(quoteItemSchema.parse({ ...item, vat_pct: input }).vat_pct).toBe(expected);
  });
  it.each(['-1', '100.01', '101', '999', '1e1', '19.001', '19,', '1.000,00', 'NaN', 'Infinity'])('rechaza %s sin modificar el valor', (input) => {
    expect(normalizeItemVat(input)).toBeNull();
    expect(itemVatSchema.safeParse(input).success).toBe(false);
  });
  it('incluye IVA en el costo y aplica una sola vez el incremento comercial', () => {
    const parsed = quoteItemSchema.parse({ ...item, vat_pct: '19' });
    const result = calculateQuote([{ category: parsed.category, quantity: parsed.quantity, baseUnitPrice: parsed.base_unit_price, vatPct: parsed.vat_pct }], rates);
    expect(result.lines[0].baseTotal.toString()).toBe('200000');
    expect(result.lines[0].costTotal.toString()).toBe('238000');
    expect(result.lines[0].finalUnitPrice.toString()).toBe('130900');
    expect(result.directCost.toString()).toBe('261800');
    expect(result.vatUtilityAmount.toString()).toBe('4974.2');
    expect(result.totalAmount.toString()).toBe('321752.2');
  });
  it.each(catalogCategoryValues)('calcula IVA en %s y solo incrementa Material', (category) => {
    const result = calculateQuote([{ category, quantity: '2', baseUnitPrice: '100000', vatPct: '19' }], rates);
    expect(result.lines[0].costTotal.toString()).toBe('238000');
    expect(result.lines[0].finalTotal.toString()).toBe(category === 'material' ? '261800' : '238000');
  });
  it('conserva precisión con cantidades e IVA fraccionarios', () => {
    const result = calculateQuote([{ category: 'transport', quantity: '1.25', baseUnitPrice: '1250.50', vatPct: '19.25' }], rates);
    expect(result.lines[0].costTotal.toString()).toBe('1864.0265625');
    expect(result.lines[0].finalTotal.toString()).toBe('1864.0265625');
    expect(result.totalAmount.toString()).toBe('2290.8886453125');
  });
  it.each([undefined, null, '', '0'])('conserva resultados históricos con IVA %s', (vatPct) => {
    const result = calculateQuote([{ category: 'material', quantity: '1.25', baseUnitPrice: '1250.50', vatPct }], rates);
    expect(result.lines[0].costTotal.toString()).toBe(result.lines[0].baseTotal.toString());
    expect(result.totalAmount.toString()).toBe('2113.1886875');
  });
});

describe('categorías compartidas', () => {
  it('ofrece Todocosto y Transporte con prefijos y validación consistentes', () => {
    expect(categoryOptions.map((entry) => entry.value)).toEqual([...catalogCategoryValues]);
    expect(categoryOptions.slice(-2)).toEqual([
      { value: 'all_inclusive', label: 'Todocosto', prefix: 'TODO' },
      { value: 'transport', label: 'Transporte', prefix: 'TRA' },
    ]);
    expect(categoryText('all_inclusive')).toBe('Todocosto');
    expect(categoryText('transport')).toBe('Transporte');
  });
});
