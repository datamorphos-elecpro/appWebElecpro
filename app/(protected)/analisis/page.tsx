import { redirect } from 'next/navigation';
import { AnalyticsWorkspace } from '../../../components/analytics/AnalyticsWorkspace';
import { DistributionWorkspace } from '../../../components/analytics/DistributionWorkspace';
import { Page } from '../../../components/ui/Page';
import { getCommercial, getFilterOptions, getManagement, getOperation, type AnalyticsTab } from '../../../lib/analytics-queries';
import { getDistributionPage } from '../../../lib/distributions-data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const rawTab = Array.isArray(params.tab) ? '' : params.tab;
  const tabs: AnalyticsTab[] = ['management', 'operation', 'commercial', 'distribution']; const tab = tabs.includes(rawTab as AnalyticsTab) ? rawTab as AnalyticsTab : 'management';
  if (rawTab && rawTab !== tab) redirect('/analisis');
  if (tab === 'distribution') {
    const options = { sort: ['created_at'] as const, defaultSort: 'created_at' as const, filters: { activity: ['', 'active', 'inactive'] as string[], payment: ['', 'paid', 'pending'] as string[] }, prefix: 'distribution_' };
    const query = parseListQuery(params, options); const distribution = await getDistributionPage({ q: query.search, activity: query.filters.activity, payment: query.filters.payment, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: distribution.page.page };
    if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/analisis', params, canonical, options));
    return <Page title="Análisis" description="Distribuciones generales sobre la ganancia real consolidada."><AnalyticsWorkspace tab="distribution"><DistributionWorkspace records={distribution.records} page={distribution.page} metrics={distribution.metrics} participants={distribution.participants} /></AnalyticsWorkspace></Page>;
  }
  const prefix = `${tab}_`; const filterOptions = await getFilterOptions(tab);
  const month = typeof params[`${prefix}month`] === 'string' && /^\d{4}-\d{2}$/.test(params[`${prefix}month`] as string) ? [params[`${prefix}month`] as string] : [];
  const states = ['', 'draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled']; const quoteStates = ['', 'draft', 'sent', 'approved', 'rejected', 'expired'];
  if (tab === 'management') {
    const selectedClient = typeof params.management_client === 'string' && filterOptions.clients.some((item) => item.value === params.management_client) ? params.management_client : '';
    const projects = selectedClient ? filterOptions.projects.filter((item) => item.parentId === selectedClient) : filterOptions.projects;
    const options = { sort: ['created_at'] as const, defaultSort: 'created_at' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], project: ['', ...projects.map((item) => item.value)], status: states, month: ['', ...month] }, prefix };
    const query = parseListQuery(params, options); const data = await getManagement({ ...query.filters, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: data.table.page.page };
    if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/analisis', params, canonical, options));
    return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
  }
  if (tab === 'operation') {
    const options = { sort: ['expected_end_date'] as const, defaultSort: 'expected_end_date' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], responsible: ['', ...filterOptions.responsible.map((item) => item.value)], status: states, priority: ['', 'low', 'medium', 'high', 'critical'] }, prefix };
    const query = parseListQuery(params, options); const data = await getOperation({ ...query.filters, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: data.table.page.page };
    if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/analisis', params, canonical, options));
    return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
  }
  const options = { sort: ['issued_on'] as const, defaultSort: 'issued_on' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], status: quoteStates, month: ['', ...month] }, prefix };
  const query = parseListQuery(params, options); const data = await getCommercial({ ...query.filters, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: data.table.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/analisis', params, canonical, options));
  return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
}
