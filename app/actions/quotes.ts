'use server';

import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { revalidateQuoteViews } from './revalidation';
import { requireProfile } from '../../lib/auth';
import { quotePayloadSchema, type QuotePayload } from '../../lib/validators/quote';

export type QuoteActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; reference?: string };

const expectedMessages = [
  'No autorizado', 'Cliente activo requerido', 'La vigencia debe ser posterior a la emisión',
  'Los porcentajes no pueden ser negativos', 'Agregue al menos un ítem', 'Cotización no encontrada',
  'La cotización ya fue convertida y no se puede editar', 'La categoría es obligatoria',
  'Cantidad y precio deben ser positivos', 'Solo se pueden convertir cotizaciones aprobadas',
  'Cliente inactivo o no disponible', 'Configuración de empresa no disponible',
];

function actionFailure(error: unknown, fallback = 'No se pudo guardar la cotización.'): QuoteActionResult<never> {
  if (error instanceof ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Revise los datos de la cotización.' };
  const message = error instanceof Error ? error.message : String(error);
  const expected = expectedMessages.find((candidate) => message.includes(candidate));
  if (expected) return { ok: false, message: expected };
  const reference = randomUUID().slice(0, 8);
  console.error(`[cotizaciones:${reference}]`, error);
  return { ok: false, message: `${fallback} Referencia: ${reference}.`, reference };
}

async function callQuoteRpc<T>(name: 'save_quote' | 'approve_and_convert_quote', payload: QuotePayload): Promise<QuoteActionResult<T>> {
  try {
    const { supabase } = await requireProfile();
    const { data, error } = await supabase.rpc(name, { payload });
    if (error) throw new Error(error.message);
    const record = data as T & { id?: string; quote_id?: string };
    try {
      revalidateQuoteViews(name === 'save_quote' ? record.id : record.quote_id ?? payload.id);
    } catch (revalidationError) {
      console.error('[cotizaciones:revalidación]', revalidationError);
    }
    return { ok: true, data: record };
  } catch (error) {
    return actionFailure(error, name === 'save_quote' ? 'No se pudo guardar la cotización.' : 'No se pudo convertir la cotización.');
  }
}

export async function saveQuote(input: unknown) {
  try { return await callQuoteRpc<Record<string, unknown>>('save_quote', quotePayloadSchema.parse(input)); }
  catch (error) { return actionFailure(error); }
}

export async function approveAndConvertQuote(input: unknown) {
  try { return await callQuoteRpc<{ id: string; quote_id?: string; quote_number?: string }>('approve_and_convert_quote', quotePayloadSchema.parse(input)); }
  catch (error) { return actionFailure(error, 'No se pudo convertir la cotización.'); }
}
