import { Page } from '../../../../components/ui/Page';
import { UserManager } from '../../../../components/admin/UserManager';
import { requireAdministrator } from '../../../../lib/auth';

export default async function Users() {
  const { supabase } = await requireAdministrator();
  const { data } = await supabase.from('profiles').select('id,full_name,role,is_active').order('full_name');
  return <Page title="Administración de usuarios" description="Invitaciones y roles de acceso."><UserManager users={(data ?? []) as any[]} /></Page>;
}