import { describe, expect, it } from 'vitest';
import { calculateQuote, type QuoteItem } from '../lib/calculations';
import { catalogCategoryValues, quotePayloadSchema } from '../lib/validators/quote';

const rates = { materialIncreasePct: '20', laborIncreasePct: '10', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19', applyDirectVat: true, vatDirectPct: '19' };
const item = { category: 'labor' as const, quantity: '1', baseUnitPrice: '100000', vatPct: '19' };
const input = {
  client_id: '22222222-2222-4222-8222-222222222222', title: 'Mano de obra', status: 'draft', issued_on: '2026-11-10', valid_until: '2026-11-20',
  material_increase_pct: '20', administration_pct: '8', contingency_pct: '3', utility_pct: '10', vat_utility_pct: '19',
  items: [{ category: 'labor', quantity: '1', unit: 'UND', description: 'Servicio', code: '', base_unit_price: '100000', vat_pct: '19' }],
};

describe('incremento sobre mano de obra', () => {
  it.each([...catalogCategoryValues, ''] as QuoteItem['category'][])('aplica únicamente el incremento propio de %s', (category) => {
    const totals = calculateQuote([{ ...item, category }], rates);
    expect(totals.lines[0].costTotal.toString()).toBe('119000');
    expect(totals.lines[0].baseTotal.toString()).toBe('100000');
    expect(totals.directCost.toString()).toBe(category === 'material' ? '142800' : category === 'labor' ? '130900' : '119000');
  });

  it('no acumula el incremento al recalcular o cambiar de categoría', () => {
    for (const category of ['labor', 'material', 'labor'] as const) {
      const totals = calculateQuote([{ ...item, category }], rates);
      expect(totals.lines[0].finalUnitPrice.toString()).toBe(category === 'labor' ? '130900' : '142800');
    }
  });

  it('conserva cálculos anteriores al omitir el nuevo porcentaje', () => {
    const { laborIncreasePct: _labor, ...previousRates } = rates;
    expect(quotePayloadSchema.parse(input).labor_increase_pct).toBe('0');
    expect(calculateQuote([item], previousRates).totalAmount.toString()).toBe(calculateQuote([item], { ...rates, laborIncreasePct: '0' }).totalAmount.toString());
  });

  it('conserva precisión con IVA y cantidades fraccionarias', () => {
    const totals = calculateQuote([{ ...item, quantity: '1.25', baseUnitPrice: '1250.50', vatPct: '19.25' }], { ...rates, laborIncreasePct: '12.25' });
    expect(totals.lines[0].costTotal.toString()).toBe('1864.0265625');
    expect(totals.directCost.toString()).toBe('2092.36981640625');
  });

  it.each(['percent', 'fixed'] as const)('recalcula descuento %s, AIU e impuestos desde el precio incrementado', (directDiscountType) => {
    const totals = calculateQuote([item], { ...rates, applyDirectDiscount: true, directDiscountType, directDiscountPct: '10', directDiscountFixedAmount: '13090' });
    expect(totals.directCost.toString()).toBe('130900');
    expect(totals.netDirectCost.toString()).toBe('117810');
    expect(totals.administrationAmount.toString()).toBe('9424.8');
    expect(totals.contingencyAmount.toString()).toBe('3534.3');
    expect(totals.utilityAmount.toString()).toBe('11781');
    expect(totals.vatUtilityAmount.toString()).toBe('2238.39');
    expect(totals.vatDirectAmount.toString()).toBe('22383.9');
    expect(totals.totalAmount.toString()).toBe('167172.39');
  });

  it.each(['0', '10.25', '150', '99999.99'])('acepta %s y calcula porcentajes mayores de 100', (labor_increase_pct) => {
    expect(quotePayloadSchema.parse({ ...input, labor_increase_pct }).labor_increase_pct).toBe(labor_increase_pct);
    if (labor_increase_pct === '150') expect(calculateQuote([item], { ...rates, laborIncreasePct: labor_increase_pct }).directCost.toString()).toBe('297500');
  });

  it.each(['', '-1', '10.001', '100000', 'NaN', 'Infinity', '1e2', '10,25'])('rechaza %s incluso con descuento fijo activo', (labor_increase_pct) => {
    expect(quotePayloadSchema.safeParse({ ...input, labor_increase_pct, apply_direct_discount: true, direct_discount_type: 'fixed', direct_discount_fixed_amount: '125000' }).success).toBe(false);
  });

  it('usa el incremento para el límite fijo y exige categoría válida', () => {
    const payload = { ...input, labor_increase_pct: '10', apply_direct_discount: true, direct_discount_type: 'fixed', direct_discount_fixed_amount: '130900' };
    expect(quotePayloadSchema.safeParse(payload).success).toBe(true);
    expect(quotePayloadSchema.safeParse({ ...payload, labor_increase_pct: '0' }).success).toBe(false);
    expect(quotePayloadSchema.safeParse({ ...payload, items: [{ ...input.items[0], category: '' }] }).success).toBe(false);
  });
});
