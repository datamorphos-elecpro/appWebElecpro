'use server';

import { revalidateBusinessViews } from './revalidation';
import { z } from 'zod';
import { requireProfile } from '../../lib/auth';
import { decimal as toDecimal } from '../../lib/calculations';

const decimal = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use un importe no negativo con máximo dos decimales.');
const positiveDecimal = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use un importe válido.').refine((value) => toDecimal(value).greaterThan(0), 'El importe debe ser mayor que cero.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use una fecha válida.');

const projectSchema = z.object({
  id: z.string().uuid().optional(), client_id: z.string().uuid(), title: z.string().min(1), project_value: decimal,
  status: z.enum(['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']), responsible: z.string(), address: z.string(), city: z.string(),
  start_date: date, expected_end_date: date, actual_end_date: z.string().optional(), observations: z.string().optional(),
  profit_mode: z.enum(['value', 'manual']), initial_profit: decimal,
}).refine((value) => !value.actual_end_date || value.actual_end_date >= value.start_date, 'La fecha final real no puede ser anterior al inicio.')
  .refine((value) => value.expected_end_date >= value.start_date, 'La fecha final prevista no puede ser anterior al inicio.');

const paymentSchema = z.object({ project_id: z.string().uuid(), payment_date: date, amount: positiveDecimal, payment_method: z.string().min(1), note: z.string().optional() });
const expenseSchema = z.object({ project_id: z.string().uuid(), expense_date: date, category: z.string().min(1), amount: positiveDecimal, payment_method: z.string().min(1), note: z.string().optional() });
const budgetSchema = z.object({ project_id: z.string().uuid(), category: z.string().min(1), amount: decimal, note: z.string().optional() });
const shareSchema = z.object({ project_id: z.string().uuid(), participant: z.string().min(1), execution_date: date, mode: z.enum(['percent', 'fixed']), value: decimal, basis: z.enum(['project_value', 'real_profit']) });

export async function saveProject(input: unknown) {
  const value = projectSchema.parse(input);
  const { supabase, profile } = await requireProfile();
  const { id, actual_end_date, ...data } = value;
  const body = { ...data, location: data.address, actual_end_date: actual_end_date || null, observations: data.observations ?? '', updated_by: profile.id };
  const result = id
    ? await supabase.from('projects').update(body).eq('id', id).select('id').single()
    : await supabase.rpc('create_manual_project', { payload: body });
  if (result.error) throw new Error(result.error.message);
  revalidateBusinessViews(result.data.id);
  return result.data as { id: string };
}

export async function saveProjectRecord(kind: 'payment' | 'expense' | 'budget' | 'share', input: unknown) {
  const { supabase, profile } = await requireProfile();
  const schemas = { payment: paymentSchema, expense: expenseSchema, budget: budgetSchema, share: shareSchema };
  const data = schemas[kind].parse(input);
  const table = { payment: 'project_payments', expense: 'project_expenses', budget: 'project_budgets', share: 'project_shares' }[kind];
  const { id, ...values } = data as { id?: string; project_id: string } & Record<string, unknown>;
  const body = { ...values, updated_by: profile.id };
  const query = id ? (supabase as any).from(table).update(body).eq('id', id).eq('project_id', values.project_id) : (supabase as any).from(table).insert({ ...body, created_by: profile.id });
  const { error } = await query;
  if (error) throw new Error(error.message);
  const projectId = values.project_id;
  revalidateBusinessViews(projectId);
}

export async function settleProjectShares(input: unknown) {
  const value = z.object({ projectId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1), paidOn: date.optional(), reopen: z.boolean().default(false) }).parse(input);
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('settle_project_shares', { p_project_id: value.projectId, p_ids: value.ids, p_paid_on: value.paidOn ?? null, p_reopen: value.reopen });
  if (error) throw new Error(error.message);
  revalidateBusinessViews(value.projectId);
  return data as number;
}
