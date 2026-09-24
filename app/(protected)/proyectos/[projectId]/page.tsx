import { notFound, redirect } from 'next/navigation';
import { Page } from '../../../../components/ui/Page';
import { ProjectWorkspace, type ProjectDetailSection } from '../../../../components/projects/ProjectWorkspace';
import { createClient } from '../../../../lib/supabase/server';
import { defaultPageSize, pageRange, pagination, type PageSize, parsePageSize, parsePositiveInteger } from '../../../../lib/pagination';
import { projectStatusText } from '../../../../lib/presentation';

const sections = ['summary', 'payments', 'costs', 'shares', 'dates'] as const;
type SearchParams = Record<string, string | string[] | undefined>;
function one(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? (value.length === 1 ? value[0] ?? '' : '') : value ?? ''; }
function queryFrom(params: SearchParams) { return { payments: parsePositiveInteger(one(params, 'payments_page'), 1), expenses: parsePositiveInteger(one(params, 'expenses_page'), 1), budgets: parsePositiveInteger(one(params, 'budgets_page'), 1), shares: parsePositiveInteger(one(params, 'shares_page'), 1), pageSize: parsePageSize(one(params, 'pageSize')) }; }
function detailHref(projectId: string, section: ProjectDetailSection, query: ReturnType<typeof queryFrom>, pages: Record<string, number>) {
  const values = new URLSearchParams(); if (section !== 'summary') values.set('section', section); if (query.pageSize !== defaultPageSize) values.set('pageSize', String(query.pageSize));
  for (const [key, value] of Object.entries(pages)) if (value > 1) values.set(key, String(value));
  return `/proyectos/${projectId}${values.size ? `?${values}` : ''}`;
}
async function pageFor(supabase: Awaited<ReturnType<typeof createClient>>, table: string, projectId: string, page: number, pageSize: PageSize, order: string) {
  const { count, error: countError } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  if (countError) throw new Error(countError.message);
  const info = pagination(count ?? 0, page, pageSize); const range = pageRange(info.page, pageSize);
  const { data, error } = await supabase.from(table).select('*').eq('project_id', projectId).order(order, { ascending: false }).order('id', { ascending: true }).range(range.from, range.to);
  if (error) throw new Error(error.message); return { records: data ?? [], page: info };
}

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ projectId }, raw] = await Promise.all([params, searchParams]);
  const candidate = one(raw, 'section'); const section: ProjectDetailSection = sections.includes(candidate as ProjectDetailSection) ? candidate as ProjectDetailSection : 'summary';
  const query = queryFrom(raw); const supabase = await createClient();
  const [{ data: project, error: projectError }, { data: summary, error: summaryError }] = await Promise.all([
    supabase.from('projects').select('*,clients(id,name,address,contact_name,email)').eq('id', projectId).single(), supabase.from('project_financial_summary').select('*').eq('id', projectId).single(),
  ]);
  if (projectError || !project) notFound(); if (summaryError) throw new Error(summaryError.message);
  let payments: Awaited<ReturnType<typeof pageFor>> | undefined; let expenses: Awaited<ReturnType<typeof pageFor>> | undefined; let budgets: Awaited<ReturnType<typeof pageFor>> | undefined; let shares: Awaited<ReturnType<typeof pageFor>> | undefined;
  if (section === 'payments') payments = await pageFor(supabase, 'project_payments', projectId, query.payments, query.pageSize, 'payment_date');
  if (section === 'costs') [expenses, budgets] = await Promise.all([pageFor(supabase, 'project_expenses', projectId, query.expenses, query.pageSize, 'expense_date'), pageFor(supabase, 'project_budgets', projectId, query.budgets, query.pageSize, 'created_at')]);
  if (section === 'shares') shares = await pageFor(supabase, 'project_shares', projectId, query.shares, query.pageSize, 'created_at');
  const pages = { payments_page: payments?.page.page ?? query.payments, expenses_page: expenses?.page.page ?? query.expenses, budgets_page: budgets?.page.page ?? query.budgets, shares_page: shares?.page.page ?? query.shares };
  const canonical = detailHref(projectId, section, query, pages); const incomingValues = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) { if (typeof value === 'string') incomingValues.set(key, value); else if (Array.isArray(value)) incomingValues.set(`invalid_${key}`, '1'); } const incoming = `/proyectos/${projectId}${incomingValues.size ? `?${incomingValues}` : ''}`;
  if (incoming !== canonical) redirect(canonical);
  return <Page title={project.title} description={`${project.clients?.name ?? 'Cliente'} · ${projectStatusText(project.status)}`}><ProjectWorkspace project={project} summary={summary} section={section} payments={payments} expenses={expenses} budgets={budgets} shares={shares} /></Page>;
}
