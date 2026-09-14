import { AppShell } from '../../components/layout/AppShell';
import { requireProfile } from '../../lib/auth';
export default async function ProtectedLayout({children}:{children:React.ReactNode}) { const {profile}=await requireProfile(); return <AppShell name={profile.full_name} role={profile.role}>{children}</AppShell>; }
