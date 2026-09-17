'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '../../lib/auth';
import { decimal } from '../../lib/calculations';

const amount = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use un importe válido.');
const share = z.object({ id: z.string().uuid().optional(), request_id: z.string().uuid().optional(), participant: z.string().trim().min(1), mode: z.enum(['percent', 'fixed']), value: amount }).refine((item) => item.mode !== 'percent' || decimal(item.value).lte(100), 'El porcentaje debe estar entre 0 y 100.');
const id = z.string().uuid();
const refresh = () => revalidatePath('/analisis');
export type DistributionActionResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; message: string };

async function callDistributionRpc(name: string, args: Record<string, unknown>): Promise<DistributionActionResult> {
  try {
    const { supabase } = await requireProfile();
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, data: (data ?? {}) as Record<string, unknown> };
  } catch (reason) {
    return { ok: false, message: reason instanceof Error ? reason.message : 'No fue posible actualizar la distribución.' };
  }
}

export async function saveDistribution(input: unknown) { try { return await callDistributionRpc('save_portfolio_share', { p_payload: share.parse(input) }); } catch (reason) { return { ok: false as const, message: reason instanceof Error ? reason.message : 'Revise los datos de la distribución.' }; } }
export async function settleDistribution(input: { id: string; paidOn?: string }) { try { return await callDistributionRpc('settle_portfolio_share', { p_id: id.parse(input.id), p_paid_on: input.paidOn || undefined }); } catch (reason) { return { ok: false as const, message: reason instanceof Error ? reason.message : 'No fue posible liquidar la distribución.' }; } }
export async function reopenDistribution(value: string) { try { return await callDistributionRpc('reopen_portfolio_share', { p_id: id.parse(value) }); } catch (reason) { return { ok: false as const, message: reason instanceof Error ? reason.message : 'No fue posible reabrir la distribución.' }; } }
export async function setDistributionActive(input: { id: string; isActive: boolean }) { try { return await callDistributionRpc('set_portfolio_share_active', { p_id: id.parse(input.id), p_is_active: input.isActive }); } catch (reason) { return { ok: false as const, message: reason instanceof Error ? reason.message : 'No fue posible cambiar el estado de la distribución.' }; } }
