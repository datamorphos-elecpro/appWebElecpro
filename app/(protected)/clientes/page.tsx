import { redirect } from 'next/navigation';
import { CatalogManager } from '../../../components/business/CatalogManager';
import { Page } from '../../../components/ui/Page';
import { getBusinessPage } from '../../../lib/data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const options = { sort: ['name', 'client_type', 'is_active'] as const, defaultSort: 'name' as const, filters: { status: ['', 'active', 'inactive'] as const } }; const query = parseListQuery(params, options);
  const result = await getBusinessPage('clients', { q: query.search, status: query.filters.status, sort: query.sort, direction: query.direction, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: result.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/clientes', params, canonical, options));
  return <Page title="Clientes" description="Fichas reutilizables para cotizaciones y proyectos."><CatalogManager kind="clients" rows={result.records} page={result.page} /></Page>;
}
