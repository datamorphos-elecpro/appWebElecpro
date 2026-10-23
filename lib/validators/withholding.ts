import { z } from 'zod';
import { decimal } from '../calculations';

export const withholdingTypes = [
  { value: 'income', label: 'Retención en la fuente' }, { value: 'vat', label: 'ReteIVA' },
  { value: 'ica', label: 'ReteICA' }, { value: 'other', label: 'Otra retención' },
] as const;
const amountPattern = /^\d{1,12}(?:\.\d{1,2})?$/;
export const withholdingSchema = z.object({
  project_id: z.string().uuid(), request_id: z.string().uuid(), withholding_date: z.string().date('Indique una fecha válida.'),
  kind: z.enum(['income', 'vat', 'ica', 'other']),
  amount: z.string().trim().regex(amountPattern, 'Use un importe con máximo dos decimales.').refine((value) => amountPattern.test(value) && decimal(value).gt(0), 'El importe debe ser mayor que cero.'),
  note: z.string().trim().default(''),
}).refine((value) => value.kind !== 'other' || value.note.length > 0, { path: ['note'], message: 'Describa la otra retención.' });
export const voidWithholdingSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1, 'Indique el motivo de anulación.') });
export type ProjectWithholding = {
  id: string; project_id: string; withholding_date: string; kind: typeof withholdingTypes[number]['value']; amount: string;
  note: string; request_id: string; voided_at: string | null; voided_by: string | null; void_reason: string | null;
  created_by: string; created_at: string;
};
