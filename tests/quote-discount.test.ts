import { describe, expect, it } from 'vitest';
import { calculateQuote } from '../lib/calculations';
import { directDiscountExcessMessage, quotePayloadSchema } from '../lib/validators/quote';

const rates = { materialIncreasePct: '0', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19', applyDirectVat: true, vatDirectPct: '19' };
const items = [{ category: 'labor' as const, quantity: '1', baseUnitPrice: '1000000' }];
const input = { client_id: '22222222-2222-4222-8222-222222222222', title: 'Descuento', status: 'draft', issued_on: '2026-10-22', valid_until: '2026-11-01',
  material_increase_pct: '0', administration_pct: '8', contingency_pct: '3', utility_pct: '10', vat_utility_pct: '19',
  items: [{ category: 'labor', quantity: '1', unit: 'UND', description: 'Servicio', code: '', base_unit_price: '1000000' }] };

describe('descuento comercial del costo directo', () => {
  it.each(['percent', 'fixed'] as const)('recalcula AIU y ambos IVA con descuento %s', (directDiscountType) => {
    const totals = calculateQuote(items, { ...rates, applyDirectDiscount: true, directDiscountType, directDiscountPct: '10', directDiscountFixedAmount: '100000' });
    expect(Object.fromEntries(['directCost', 'directDiscountAmount', 'netDirectCost', 'administrationAmount', 'contingencyAmount', 'utilityAmount', 'vatUtilityAmount', 'vatDirectAmount', 'totalAmount'].map((key) => [key, totals[key as keyof typeof totals].toString()]))).toEqual({
      directCost: '1000000', directDiscountAmount: '100000', netDirectCost: '900000', administrationAmount: '72000', contingencyAmount: '27000', utilityAmount: '90000', vatUtilityAmount: '17100', vatDirectAmount: '171000', totalAmount: '1277100',
    });
    expect(totals.lines[0].costTotal.toString()).toBe('1000000');
    expect(totals.lines[0].finalTotal.toString()).toBe('1000000');
  });

  it('incluye IVA por ítem e incremento sin redondeos intermedios', () => {
    const result = calculateQuote([{ category: 'material', quantity: '1', baseUnitPrice: '100', vatPct: '19.25' }], {
      ...rates, materialIncreasePct: '12.25', applyDirectDiscount: true, directDiscountPct: '12.25',
    });
    expect(result.directCost.toString()).toBe('133.858125');
    expect(result.directDiscountAmount.toString()).toBe('16.3976203125');
    expect(result.netDirectCost.toString()).toBe('117.4605046875');
    expect(result.lines[0].costTotal.toString()).toBe('119.25');
  });

  it('acepta cero y 100 %, y desactivar excluye el descuento guardado', () => {
    for (const pct of ['0', '100']) {
      const result = calculateQuote(items, { ...rates, applyDirectDiscount: true, directDiscountPct: pct });
      expect(result.totalAmount.toString()).toBe(pct === '0' ? '1419000' : '0');
    }
    const result = calculateQuote(items, { ...rates, applyDirectDiscount: false, directDiscountPct: '100', directDiscountFixedAmount: '2000000' });
    expect(result.directDiscountAmount.toString()).toBe('0');
    expect(result.totalAmount.toString()).toBe('1419000');
    expect(calculateQuote(items, { ...rates, applyDirectVat: false, applyDirectDiscount: true, directDiscountPct: '10' }).totalAmount.toString()).toBe('1106100');
  });

  it('mantiene defaults históricos y normaliza ambos valores independientes', () => {
    expect(quotePayloadSchema.parse(input)).toMatchObject({ apply_direct_discount: false, direct_discount_type: 'percent', direct_discount_pct: '0', direct_discount_fixed_amount: '0' });
    expect(quotePayloadSchema.parse({ ...input, direct_discount_pct: '12,25', direct_discount_fixed_amount: '100,50' })).toMatchObject({ direct_discount_pct: '12.25', direct_discount_fixed_amount: '100.50' });
    expect(quotePayloadSchema.safeParse({ ...input, apply_direct_discount: true, direct_discount_type: 'fixed', direct_discount_fixed_amount: '1000000' }).success).toBe(true);
  });

  it.each([
    { direct_discount_pct: '-1' }, { direct_discount_pct: '100.01' }, { direct_discount_pct: '10.001' }, { direct_discount_pct: 'NaN' }, { direct_discount_pct: '' },
    { direct_discount_fixed_amount: '-1' }, { direct_discount_fixed_amount: '0.001' }, { direct_discount_fixed_amount: 'Infinity' }, { direct_discount_fixed_amount: '1.000.000' }, { direct_discount_fixed_amount: '' }, { direct_discount_type: 'other' },
  ])('rechaza valores inválidos sin lanzar excepciones: %j', (changes) => {
    expect(quotePayloadSchema.safeParse({ ...input, ...changes }).success).toBe(false);
  });

  it('exige corregir excesos solo si el descuento fijo está seleccionado y activado', () => {
    const excessive = { ...input, apply_direct_discount: true, direct_discount_type: 'fixed', direct_discount_fixed_amount: '1000000.01' };
    const result = quotePayloadSchema.safeParse(excessive);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe(directDiscountExcessMessage);
    expect(quotePayloadSchema.safeParse({ ...excessive, apply_direct_discount: false }).success).toBe(true);
    expect(quotePayloadSchema.safeParse({ ...excessive, direct_discount_type: 'percent', direct_discount_pct: '10' }).success).toBe(true);
    expect(quotePayloadSchema.safeParse({ ...excessive, material_increase_pct: 'incorrecto', items: [{ ...input.items[0], quantity: 'incorrecto' }] }).success).toBe(false);
  });

  it('valida el límite contra IVA por ítem e incremento actuales', () => {
    const changed = { ...input, apply_direct_discount: true, direct_discount_type: 'fixed', direct_discount_fixed_amount: '1309000', material_increase_pct: '10', items: [{ ...input.items[0], category: 'material', vat_pct: '19' }] };
    expect(quotePayloadSchema.safeParse(changed).success).toBe(true);
    expect(quotePayloadSchema.safeParse({ ...changed, material_increase_pct: '0' }).success).toBe(false);
  });
});
