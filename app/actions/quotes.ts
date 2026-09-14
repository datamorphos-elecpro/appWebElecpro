'use server';

import { revalidateQuoteViews } from './revalidation';
import { requireProfile } from '../../lib/auth';
import { quotePayloadSchema, type QuotePayload } from '../../lib/validators/quote';

async function callQuoteRpc(name: 'save_quote' | 'approve_and_convert_quote', payload: QuotePayload) {
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc(name, { payload });
  if (error) throw new Error(error.message);
  revalidateQuoteViews(payload.id);
  return data;
}

export async function saveQuote(input: unknown) {
  return callQuoteRpc('save_quote', quotePayloadSchema.parse(input));
}

export async function approveAndConvertQuote(input: unknown) {
  return callQuoteRpc('approve_and_convert_quote', quotePayloadSchema.parse(input));
}

