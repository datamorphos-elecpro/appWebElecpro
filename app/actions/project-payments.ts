'use server';

import { requireProfile } from '../../lib/auth';
import { deletePaymentSchema, editPaymentSchema } from '../../lib/validators/payment';
import { revalidateBusinessViews } from './revalidation';

export async function editProjectPayment(input: unknown) {
  const value = editPaymentSchema.parse(input);
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc('edit_project_payment', { payload: value });
  if (error) throw new Error(error.message);
  revalidateBusinessViews(value.project_id);
}

export async function deleteProjectPayment(input: unknown) {
  const value = deletePaymentSchema.parse(input);
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc('delete_project_payment', { payload: value });
  if (error) throw new Error(error.message);
  revalidateBusinessViews(value.project_id);
}
