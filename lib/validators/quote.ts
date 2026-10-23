import { z } from 'zod';
import { calculateQuote, decimal } from '../calculations';
import { basePriceMessage, itemVatMessage, normalizeBasePrice, normalizeItemVat, normalizeUnit } from '../item-input';
export const basePriceSchema = z.string().transform((value, context) => {
  const normalized = normalizeBasePrice(value);
  if (normalized === null) { context.addIssue({ code: z.ZodIssueCode.custom, message: basePriceMessage }); return z.NEVER; }
  return normalized;
});
export const unitSchema = z.string().transform(normalizeUnit).pipe(z.string().min(1, 'La unidad es obligatoria.'));

export const catalogCategoryValues = ['material', 'design', 'technical_visit', 'labor', 'all_inclusive', 'transport'] as const;
export const itemVatSchema = z.string().default('0').transform((value, context) => {
  const normalized = normalizeItemVat(value);
  if (normalized === null) { context.addIssue({ code: z.ZodIssueCode.custom, message: itemVatMessage }); return z.NEVER; }
  return normalized;
});
export const quoteDecimalString = (integerDigits: number) => z.string().trim().regex(
  new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,2})?$`),
  'Debe ser un decimal no negativo con máximo dos decimales.',
);

export const directDiscountPctMessage = 'Ingrese un descuento entre 0 y 100 %, con máximo dos decimales.';
export const directDiscountFixedMessage = 'Ingrese un descuento fijo no negativo, sin separadores de miles y con máximo dos decimales.';
export const directDiscountExcessMessage = 'El descuento fijo no puede superar el costo directo. Corríjalo o desactive el descuento.';
export const directDiscountPctSchema = z.string().default('0').transform((value, context) => {
  const normalized = value.trim() === '' ? null : normalizeItemVat(value);
  if (normalized === null) { context.addIssue({ code: z.ZodIssueCode.custom, message: directDiscountPctMessage }); return z.NEVER; }
  return normalized;
});
export const directDiscountFixedSchema = z.string().default('0').transform((value, context) => {
  const normalized = normalizeBasePrice(value);
  if (normalized === null) { context.addIssue({ code: z.ZodIssueCode.custom, message: directDiscountFixedMessage }); return z.NEVER; }
  return normalized;
});

export const quoteItemSchema = z.object({
  catalog_item_id: z.string().uuid().nullable().optional().or(z.literal('')),
  code: z.string(),
  description: z.string().trim().min(1, 'La descripción es obligatoria.'),
  category: z.enum(catalogCategoryValues, { required_error: 'La categoría es obligatoria.', invalid_type_error: 'La categoría es obligatoria.' }),
  quantity: quoteDecimalString(12),
  unit: unitSchema,
  base_unit_price: basePriceSchema,
  vat_pct: itemVatSchema,
});

export const quotePayloadSchema = z.object({
  id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  client_id: z.string().uuid('Seleccione un cliente.'),
  status: z.enum(['draft', 'sent', 'approved', 'rejected']),
  issued_on: z.string().date('Ingrese una fecha de emisión válida.'),
  valid_until: z.string().date('Ingrese una fecha de vigencia válida.'),
  title: z.string().trim().min(1, 'El título es obligatorio.'),
  address: z.string().default(''),
  city: z.string().default(''),
  material_increase_pct: quoteDecimalString(5),
  administration_pct: quoteDecimalString(5),
  contingency_pct: quoteDecimalString(5),
  utility_pct: quoteDecimalString(5),
  vat_utility_pct: quoteDecimalString(5),
  show_aiu: z.boolean().default(true),
  apply_direct_vat: z.boolean().default(false),
  vat_direct_pct: itemVatSchema.default('19'),
  apply_direct_discount: z.boolean().default(false),
  direct_discount_type: z.enum(['percent', 'fixed']).default('percent'),
  direct_discount_pct: directDiscountPctSchema,
  direct_discount_fixed_amount: directDiscountFixedSchema,
  items: z.array(quoteItemSchema).min(1, 'Agregue al menos un ítem.'),
  greeting: z.string().default(''),
  project_description: z.string().default(''),
  objective: z.string().default(''),
  notes: z.string().default(''),
  scope: z.string().default(''),
  benefits: z.string().default(''),
  exclusions: z.string().default(''),
  payment_terms: z.string().default(''),
  execution_time: z.string().default(''),
  deliverable: z.string().default(''),
}).superRefine((value, context) => {
  // Refinements can run with dirty fields; only calculate once dependencies are valid.
  if (value.apply_direct_discount && value.direct_discount_type === 'fixed'
    && directDiscountFixedSchema.safeParse(value.direct_discount_fixed_amount).success
    && quoteDecimalString(5).safeParse(value.material_increase_pct).success
    && z.array(quoteItemSchema).safeParse(value.items).success) {
    const { directCost } = calculateQuote(value.items.map((item) => ({ category: item.category, quantity: item.quantity, baseUnitPrice: item.base_unit_price, vatPct: item.vat_pct })), {
      materialIncreasePct: value.material_increase_pct, administrationPct: '0', contingencyPct: '0', utilityPct: '0', vatUtilityPct: '0',
    });
    if (decimal(value.direct_discount_fixed_amount).greaterThan(directCost)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['direct_discount_fixed_amount'], message: directDiscountExcessMessage });
  }
  if (value.valid_until < value.issued_on) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_until'], message: 'La vigencia debe ser posterior o igual a la emisión.' });
  }
});

export type QuotePayload = z.infer<typeof quotePayloadSchema>;

export function quoteValidationMessages(input: unknown) {
  const result = quotePayloadSchema.safeParse(input);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.path.at(-1) === 'category' ? 'La categoría es obligatoria.' : issue.message))];
}
