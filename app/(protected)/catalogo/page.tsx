import { redirect } from 'next/navigation';
import { CatalogManager } from '../../../components/business/CatalogManager';
import { Page } from '../../../components/ui/Page';
import { getBusinessPage } from '../../../lib/data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';

export default async function Catalog({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const options = { sort: ['code', 'description', 'category', 'is_active'] as const, defaultSort: 'code' as const, filters: { status: ['', 'active', 'inactive'] as const } }; const query = parseListQuery(params, options);
  const result = await getBusinessPage('catalog_items', { q: query.search, status: query.filters.status, sort: query.sort, direction: query.direction, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: result.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/catalogo', params, canonical, options));
  return <Page title="Productos y servicios" description="Catálogo de materiales y mano de obra."><CatalogManager kind="catalog_items" rows={result.records} page={result.page} /></Page>;
}
