import { z } from 'zod';

export const catalogCategoryValues = ['material', 'design', 'technical_visit', 'labor'] as const;
export const quoteDecimalString = (integerDigits: number) => z.string().trim().regex(
  new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,2})?$`),
  'Debe ser un decimal no negativo con máximo dos decimales.',
);

export const quoteItemSchema = z.object({
  catalog_item_id: z.string().uuid().nullable().optional().or(z.literal('')),
  code: z.string(),
  description: z.string().trim().min(1, 'La descripción es obligatoria.'),
  category: z.enum(catalogCategoryValues, { required_error: 'La categoría es obligatoria.', invalid_type_error: 'La categoría es obligatoria.' }),
  quantity: quoteDecimalString(12),
  unit: z.string().trim().min(1, 'La unidad es obligatoria.'),
  base_unit_price: quoteDecimalString(12),
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
  if (value.valid_until < value.issued_on) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_until'], message: 'La vigencia debe ser posterior o igual a la emisión.' });
  }
});

export type QuotePayload = z.infer<typeof quotePayloadSchema>;

export function quoteValidationMessages(input: unknown) {
  const result = quotePayloadSchema.safeParse(input);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.path.at(-1) === 'category' ? 'La categoría es obligatoria.' : issue.message))];
}
