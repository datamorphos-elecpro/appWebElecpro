'use server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdministrator } from '../../lib/auth';
const inviteSchema=z.object({email:z.string().email(),fullName:z.string().min(2),role:z.enum(['administrator','management'])});
export async function inviteUser(input:unknown) { const data=inviteSchema.parse(input); const {profile}=await requireAdministrator(); const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.'); const admin=createAdminClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}); const {data:user,error}=await admin.auth.admin.inviteUserByEmail(data.email,{data:{full_name:data.fullName},redirectTo:process.env.NEXT_PUBLIC_APP_URL}); if(error) throw new Error(error.message); await admin.from('profiles').update({full_name:data.fullName,role:data.role,is_active:true}).eq('id',user.user.id); await admin.from('audit_log').insert({actor_id:profile.id,entity_type:'profile',entity_id:user.user.id,action:'invite_user',after_data:{email:data.email,role:data.role}}); revalidatePath('/administracion/usuarios'); }

const accessSchema = z.object({ id: z.string().uuid(), role: z.enum(['administrator', 'management']), isActive: z.boolean() });
export async function setUserAccess(input: unknown) {
  const data = accessSchema.parse(input);
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc('set_profile_access', { p_profile_id: data.id, p_role: data.role, p_is_active: data.isActive });
  if (error) throw new Error(error.message);
  if (!data.isActive) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('El usuario fue marcado inactivo, pero falta configurar la revocación de sesión en servidor.');
    const admin = createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signOutError } = await admin.auth.admin.signOut(data.id, 'global');
    if (signOutError) throw new Error(signOutError.message);
  }
  revalidatePath('/administracion/usuarios');
}
