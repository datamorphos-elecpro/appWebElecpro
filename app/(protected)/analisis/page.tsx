import { redirect } from 'next/navigation';
import { AnalyticsWorkspace } from '../../../components/analytics/AnalyticsWorkspace';
import { DistributionWorkspace } from '../../../components/analytics/DistributionWorkspace';
import { Page } from '../../../components/ui/Page';
import { getCommercial, getFilterOptions, getManagement, getOperation, type AnalyticsTab } from '../../../lib/analytics-queries';
import { getDistributionPage } from '../../../lib/distributions-data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';

function multi(params: Record<string, string | string[] | undefined>, key: string, allowed: string[]) {
  const raw = params[key];
  return [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).filter((value) => allowed.includes(value)))];
}
function firstValues(params: Record<string, string | string[] | undefined>, keys: string[]) {
  const result = { ...params }; for (const key of keys) if (Array.isArray(result[key])) result[key] = result[key][0]; return result;
}

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const rawTab = Array.isArray(params.tab) ? '' : params.tab;
  const tabs: AnalyticsTab[] = ['management', 'operation', 'commercial', 'distribution']; const tab = tabs.includes(rawTab as AnalyticsTab) ? rawTab as AnalyticsTab : 'management';
  if (rawTab && rawTab !== tab) redirect('/analisis');
  if (tab === 'distribution') {
    const options = { sort: ['created_at'] as const, defaultSort: 'created_at' as const, filters: { activity: ['', 'active', 'inactive'] as string[], payment: ['', 'paid', 'pending'] as string[] }, prefix: 'distribution_' };
    const query = parseListQuery(firstValues(params, ['distribution_activity','distribution_payment']), options); const distribution = await getDistributionPage({ q: query.search, activity: multi(params, 'distribution_activity', ['active','inactive']), payment: multi(params, 'distribution_payment', ['paid','pending']), page: query.page, pageSize: query.pageSize });
    return <Page title="Análisis" description="Distribuciones generales sobre la ganancia real consolidada."><AnalyticsWorkspace tab="distribution"><DistributionWorkspace records={distribution.records} page={distribution.page} metrics={distribution.metrics} participants={distribution.participants} /></AnalyticsWorkspace></Page>;
  }
  const prefix = `${tab}_`; const filterOptions = await getFilterOptions(tab);
  const month = typeof params[`${prefix}month`] === 'string' && /^\d{4}-\d{2}$/.test(params[`${prefix}month`] as string) ? [params[`${prefix}month`] as string] : [];
  const states = ['', 'draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled']; const quoteStates = ['', 'draft', 'sent', 'approved', 'rejected', 'expired'];
  if (tab === 'management') {
    const clients = multi(params, 'management_client', filterOptions.clients.map((item) => item.value));
    const projects = clients.length ? filterOptions.projects.filter((item) => clients.includes(item.parentId)) : filterOptions.projects;
    const options = { sort: ['created_at'] as const, defaultSort: 'created_at' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], project: ['', ...projects.map((item) => item.value)], status: states, month: ['', ...month] }, prefix };
    const query = parseListQuery(firstValues(params, ['management_client','management_project','management_status']), options); const data = await getManagement({ client: clients, project: multi(params, 'management_project', projects.map((item) => item.value)), status: multi(params, 'management_status', states), month: query.filters.month, page: query.page, pageSize: query.pageSize });
    return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
  }
  if (tab === 'operation') {
    const options = { sort: ['expected_end_date'] as const, defaultSort: 'expected_end_date' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], responsible: ['', ...filterOptions.responsible.map((item) => item.value)], status: states, priority: ['', 'low', 'medium', 'high', 'critical'] }, prefix };
    const query = parseListQuery(firstValues(params, ['operation_client','operation_responsible','operation_status','operation_priority']), options); const data = await getOperation({ client: multi(params, 'operation_client', filterOptions.clients.map((item) => item.value)), responsible: multi(params, 'operation_responsible', filterOptions.responsible.map((item) => item.value)), status: multi(params, 'operation_status', states), priority: multi(params, 'operation_priority', ['low','medium','high','critical']), page: query.page, pageSize: query.pageSize });
    return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
  }
  const options = { sort: ['issued_on'] as const, defaultSort: 'issued_on' as const, filters: { client: ['', ...filterOptions.clients.map((item) => item.value)], status: quoteStates, month: ['', ...month] }, prefix };
  const query = parseListQuery(firstValues(params, ['commercial_client','commercial_status']), options); const data = await getCommercial({ client: multi(params, 'commercial_client', filterOptions.clients.map((item) => item.value)), status: multi(params, 'commercial_status', quoteStates), month: query.filters.month, page: query.page, pageSize: query.pageSize });
  return <Page title="Análisis" description="Indicadores calculados sobre todo el conjunto filtrado."><AnalyticsWorkspace tab={tab} data={data} options={filterOptions} /></Page>;
}
