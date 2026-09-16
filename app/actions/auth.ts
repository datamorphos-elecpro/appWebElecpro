'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent('Correo o contraseña inválidos')}`);
  redirect('/panel');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') || '');
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login` });
  return { ok: true };
}
