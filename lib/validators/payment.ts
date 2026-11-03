import { z } from 'zod';
import { decimal } from '../calculations';

const uuid = z.string().uuid();
const revision = z.string().datetime({ offset: true });
const identity = { id: uuid, project_id: uuid, expected_updated_at: revision, request_id: uuid };
export const editPaymentSchema = z.object({
  ...identity,
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione una fecha válida.'),
  amount: z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use un importe con máximo dos decimales.').refine((value) => decimal(value).greaterThan(0), 'El importe debe ser mayor que cero.'),
  payment_method: z.string().trim().min(1, 'Indique el medio de pago.'),
  note: z.string().default(''),
});
export const deletePaymentSchema = z.object({ ...identity, reason: z.string().trim().min(1, 'Indique el motivo de eliminación.').max(1000) });
export type ProjectPayment = { id: string; project_id: string; updated_at: string; payment_date: string; amount: string; payment_method: string; note: string };
