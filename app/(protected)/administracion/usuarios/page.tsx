import { redirect } from 'next/navigation';
import { Page } from '../../../../components/ui/Page';
import { UserManager } from '../../../../components/admin/UserManager';
import { FilterBar } from '../../../../components/ui/FilterBar';
import { requireAdministrator } from '../../../../lib/auth';
import { getUsersPage } from '../../../../lib/data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../../lib/pagination';

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdministrator(); const params = await searchParams;
  const options = { sort: ['full_name'] as const, defaultSort: 'full_name' as const, filters: { status: ['', 'active', 'inactive'] as const } };
  const query = parseListQuery(params, options); const result = await getUsersPage({ q: query.search, status: query.filters.status, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: result.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/administracion/usuarios', params, canonical, options));
  return <Page title="Administracion de usuarios" description="Invitaciones y roles de acceso."><form>{query.pageSize !== 20 && <input type="hidden" name="pageSize" value={query.pageSize} />}<FilterBar actions={<button className="primary">Aplicar</button>}><label>Buscar<input name="q" defaultValue={query.search} /></label><label>Estado<select name="status" defaultValue={query.filters.status}><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></FilterBar></form><UserManager users={result.records} page={result.page} /></Page>;
}
