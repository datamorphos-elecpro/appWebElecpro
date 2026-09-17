'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '../../lib/auth';
import { catalogCategoryValues } from '../../lib/validators/quote';
import { revalidateCatalogViews, revalidateClientViews } from './revalidation';

const amount = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Debe ser un importe no negativo con máximo dos decimales.');
const optionalNullableText = z.string().trim().optional().transform((value) => value || null);
const schemas = {
  clients: z.object({ id: z.string().uuid().optional(), name: z.string().min(1), client_type: z.string().min(1), contact_name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional() }),
  suppliers: z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), contact_name: optionalNullableText, phone: z.string().optional(), email: z.string().optional(), website: z.string().optional(), description: z.string().optional() }),
  catalog_items: z.object({ id: z.string().uuid().optional(), code: z.string().optional(), description: z.string().min(1), unit: z.string().min(1), base_unit_price: amount, category: z.enum(catalogCategoryValues) }),
};
export async function saveBusiness(table: keyof typeof schemas, input: unknown) {
  const data = schemas[table].parse(input); const { supabase, profile } = await requireProfile(); const { id, ...values } = data; const database = supabase as any;
  const body = table === 'catalog_items' ? Object.fromEntries(Object.entries(values).filter(([key]) => id || key !== 'code')) : values;
  const query = id ? database.from(table).update({ ...body, updated_by: profile.id }).eq('id', id) : database.from(table).insert({ ...body, created_by: profile.id, updated_by: profile.id });
  const { error } = await query; if (error) throw new Error(error.message);
  if (table === 'clients') revalidateClientViews(); else if (table === 'catalog_items') revalidateCatalogViews(); else revalidatePath('/proveedores');
}
export async function deactivateBusiness(table: 'clients' | 'suppliers' | 'catalog_items', id: string) {
  const { supabase } = await requireProfile(); const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id); if (error) throw new Error(error.message);
  if (table === 'clients') revalidateClientViews(); else if (table === 'catalog_items') revalidateCatalogViews(); else revalidatePath('/proveedores');
}
export async function setBusinessActive(table: 'clients' | 'suppliers' | 'catalog_items', id: string, isActive: boolean) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.from(table).update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
  if (table === 'clients') revalidateClientViews(); else if (table === 'catalog_items') revalidateCatalogViews(); else revalidatePath('/proveedores');
}
const companySchema = z.object({ legal_name: z.string().min(1), manager_name: z.string().min(1), manager_role: z.string().min(1), professional_card: z.string().optional(), phone: z.string().optional(), email: z.string().email().or(z.literal('')), address: z.string().optional(), timezone: z.literal('America/Bogota'), currency_code: z.literal('COP') });
const portfolioShareSchema = z.object({ id: z.string().uuid().optional(), participant: z.string().min(1), mode: z.enum(['percent', 'fixed']), value: amount, is_paid: z.boolean(), paid_on: z.string().optional() }).refine((value) => !value.paid_on || value.is_paid, 'Una fecha de pago exige marcar la distribución como pagada.');
export async function saveCompanySettings(input: unknown) {
  const values = companySchema.parse(input); const { supabase, profile } = await requireProfile(); const { error } = await supabase.from('company_settings').update({ ...values, updated_by: profile.id }).eq('id', true); if (error) throw new Error(`No fue posible guardar la configuración: ${error.message}`);
  revalidatePath('/cotizaciones'); revalidatePath('/');
}
export async function savePortfolioShare(input: unknown) {
  const { id, paid_on, ...values } = portfolioShareSchema.parse(input); const { supabase, profile } = await requireProfile(); const body = { ...values, basis: 'portfolio_profit', paid_on: paid_on || null, updated_by: profile.id };
  const result = id ? await supabase.from('portfolio_shares').update(body).eq('id', id) : await supabase.from('portfolio_shares').insert({ ...body, created_by: profile.id });
  if (result.error) throw new Error(`No fue posible guardar la distribución: ${result.error.message}`); revalidatePath('/analisis');
}
