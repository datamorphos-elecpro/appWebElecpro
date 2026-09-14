import { describe, expect, it } from 'vitest';
import { quotePayloadSchema, quoteValidationMessages } from '../lib/validators/quote';

const validPayload = {
  client_id: '11111111-1111-4111-8111-111111111111',
  status: 'draft',
  issued_on: '2026-09-14',
  valid_until: '2026-09-29',
  title: 'Adecuación eléctrica',
  material_increase_pct: '0',
  administration_pct: '8',
  contingency_pct: '3',
  utility_pct: '10',
  vat_utility_pct: '19',
  items: [{ code: 'MAT-01', description: 'Conductor', category: 'material', quantity: '2', unit: 'm', base_unit_price: '1250.50' }],
  greeting: '', project_description: '', objective: '', notes: '', scope: '', benefits: '', exclusions: '', payment_terms: '', execution_time: '', deliverable: '',
};

describe('validación compartida del editor de cotizaciones', () => {
  it('acepta el borrador completo que puede autoguardarse', () => {
    expect(quotePayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('mantiene en memoria un ítem incompleto sin enviarlo al servidor', () => {
    const messages = quoteValidationMessages({ ...validPayload, items: [{ ...validPayload.items[0], description: '', category: '' }] });
    expect(messages).toContain('La descripción es obligatoria.');
    expect(messages).toContain('La categoría es obligatoria.');
  });

  it('rechaza una vigencia anterior a la emisión', () => {
    expect(quoteValidationMessages({ ...validPayload, valid_until: '2026-09-13' })).toContain('La vigencia debe ser posterior o igual a la emisión.');
  });

  it('limita importes y porcentajes a dos decimales', () => {
    expect(quotePayloadSchema.safeParse({ ...validPayload, administration_pct: '8.125' }).success).toBe(false);
    expect(quotePayloadSchema.safeParse({ ...validPayload, items: [{ ...validPayload.items[0], base_unit_price: '-1' }] }).success).toBe(false);
  });
});
