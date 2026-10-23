'use server';

import { requireProfile } from '../../lib/auth';
import { withholdingSchema, voidWithholdingSchema, type ProjectWithholding } from '../../lib/validators/withholding';
import { revalidateBusinessViews } from './revalidation';

export async function registerWithholding(input: unknown) {
  const parsed = withholdingSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Revise los datos de la retención.');
  const value = parsed.data;
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('register_project_withholding', { payload: value });
  if (error) throw new Error(error.message);
  revalidateBusinessViews(value.project_id);
  return data as ProjectWithholding;
}

export async function voidWithholding(input: unknown) {
  const parsed = voidWithholdingSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Indique el motivo de anulación.');
  const value = parsed.data;
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('void_project_withholding', { p_id: value.id, p_reason: value.reason });
  if (error) throw new Error(error.message);
  const record = data as ProjectWithholding;
  revalidateBusinessViews(record.project_id);
  return record;
}
