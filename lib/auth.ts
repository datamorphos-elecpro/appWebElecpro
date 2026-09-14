import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export async function requireProfile() {
  const supabase = await createClient();
  const { data: tokenData } = await supabase.auth.getClaims();
  const claims = tokenData?.claims;
  if (!claims?.sub) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('id, full_name, role, is_active').eq('id', claims.sub).single();
  if (!profile?.is_active) redirect('/login?error=inactive');
  return { supabase, profile };
}

export async function requireAdministrator() {
  const result = await requireProfile();
  if (result.profile.role !== 'administrator') redirect('/');
  return result;
}