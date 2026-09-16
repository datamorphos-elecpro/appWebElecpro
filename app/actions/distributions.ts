'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '../../lib/auth';

const amount = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use un importe válido.');
const share = z.object({ id: z.string().uuid().optional(), participant: z.string().trim().min(1), mode: z.enum(['percent', 'fixed']), value: amount }).refine((item) => item.mode !== 'percent' || Number(item.value) <= 100, 'El porcentaje debe estar entre 0 y 100.');
const id = z.string().uuid();
const refresh = () => revalidatePath('/analisis');

export async function saveDistribution(input: unknown) { const { supabase } = await requireProfile(); const { error } = await supabase.rpc('save_portfolio_share', { p_payload: share.parse(input) }); if (error) throw new Error(error.message); refresh(); }
export async function settleDistribution(input: { id: string; paidOn?: string }) { const { supabase } = await requireProfile(); const { error } = await supabase.rpc('settle_portfolio_share', { p_id: id.parse(input.id), p_paid_on: input.paidOn || undefined }); if (error) throw new Error(error.message); refresh(); }
export async function reopenDistribution(value: string) { const { supabase } = await requireProfile(); const { error } = await supabase.rpc('reopen_portfolio_share', { p_id: id.parse(value) }); if (error) throw new Error(error.message); refresh(); }
export async function setDistributionActive(input: { id: string; isActive: boolean }) { const { supabase } = await requireProfile(); const { error } = await supabase.rpc('set_portfolio_share_active', { p_id: id.parse(input.id), p_is_active: input.isActive }); if (error) throw new Error(error.message); refresh(); }
