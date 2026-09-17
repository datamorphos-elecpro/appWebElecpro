import { decimal } from './calculations';
import { createClient } from './supabase/server';
import { pageRange, paginated, pagination, type PageSize } from './pagination';

export type ClientReference = { name: string; contact_name?: string | null; email?: string | null; address?: string | null };
export type CompanySettings = { legal_name: string; manager_name: string; manager_role: string; professional_card: string | null; phone: string | null; email: string | null; address: string | null; timezone: 'America/Bogota'; currency_code: 'COP' };
export type ProjectFinancialSummary = { id: string; project_value: string; paid: string; balance: string; expenses: string; budget: string; real_profit: string; projected_profit: string };
export type ProjectRecord = { id: string; client_id: string; title: string; quote_number: string; status: string; priority: string; responsible: string; location: string; start_date: string; expected_end_date: string; actual_end_date: string | null; project_value: string; observations: string; profit_mode: 'value' | 'manual'; initial_profit: string; created_at: string; clients: ClientReference | null };
export type QuoteRecord = { id: string; number: string; title: string; status: string; client_id: string; issued_on: string; valid_until: string; total_amount: string; project_id?: string | null; clients: ClientReference | null; quote_items: { quantity: string }[] };
export type QuoteListRecord = { id: string; number: string; title: string; client_name: string; client_contact: string | null; issued_on: string; valid_until: string; status: string; visible_status: string; total_amount: string; project_id: string | null; item_count: number };
export type StatusSummary = { status: string; count: number; total: string; average: string; share: string };
export type QuoteProjectDashboard = {
  quotes: { metrics: { count: number; quoted_value: string; approved_value: string; valid_proposals: number; approval_rate: string | null }; by_status: StatusSummary[] };
  projects: { metrics: { count: number; contracted_value: string; active_count: number; active_value: string; consolidated_profit: string }; by_status: StatusSummary[] };
};
export type ProjectWithFinancialSummary<T extends { id: string } = { id: string }> = T & { financialSummary: ProjectFinancialSummary };
type QueryResult<T> = { data: T | null; error: { message: string } | null };
type SupabaseLike = { from: (table: string) => any };
const summaryFields = 'id,project_value,paid,balance,expenses,budget,real_profit,projected_profit';
const projectFields = 'id,client_id,title,quote_number,status,priority,responsible,location,start_date,expected_end_date,actual_end_date,project_value,observations,profit_mode,initial_profit,created_at,clients(name,contact_name,address)';
const quoteFields = 'id,number,title,status,client_id,issued_on,valid_until,total_amount,project_id,clients(name,contact_name,address),quote_items(quantity)';
const summaryBatchSize = 500;
function queryError(label: string, error: { message: string } | null) { if (!error) return; console.error(`[datos] ${label}`, error); throw new Error(`No fue posible cargar ${label}: ${error.message}`); }
async function typedRows<T>(label: string, request: PromiseLike<QueryResult<any>>): Promise<T[]> { const { data, error } = await request; queryError(label, error); return (data ?? []) as T[]; }
async function typedSingle<T>(label: string, request: PromiseLike<QueryResult<T>>): Promise<T> { const { data, error } = await request; queryError(label, error); if (!data) throw new Error(`No fue posible cargar ${label}: no hay datos disponibles.`); return data; }
export async function getRows(table: string, select = '*'): Promise<any[]> { const supabase = await createClient(); return typedRows(table, supabase.from(table).select(select)); }
export type BusinessKind = 'clients' | 'suppliers' | 'catalog_items';
const businessFields: Record<BusinessKind, string> = {
  clients: 'id,name,client_type,contact_name,phone,email,address,is_active',
  suppliers: 'id,name,contact_name,phone,email,website,description,is_active',
  catalog_items: 'id,code,description,unit,base_unit_price,category,is_active',
};
const businessSearchColumns: Record<BusinessKind, string> = {
  clients: 'name,contact_name,email,phone', suppliers: 'name,contact_name,email,phone,description', catalog_items: 'code,description,unit',
};
export async function getBusinessPage(kind: BusinessKind, input: { q: string; status: string; sort: string; direction: 'asc' | 'desc'; page: number; pageSize: PageSize }) {
  const supabase = await createClient();
  const allowedSorts: Record<BusinessKind, readonly string[]> = { clients: ['name', 'client_type', 'is_active'], suppliers: ['name', 'is_active'], catalog_items: ['code', 'description', 'category', 'is_active'] };
  const sort = allowedSorts[kind].includes(input.sort) ? input.sort : allowedSorts[kind][0];
  const apply = (query: any) => { if (input.q) { const safe = input.q.replace(/[%,()]/g, ''); query = query.or(businessSearchColumns[kind].split(',').map((column) => `${column}.ilike.%${safe}%`).join(',')); } if (input.status === 'active') query = query.eq('is_active', true); if (input.status === 'inactive') query = query.eq('is_active', false); return query; };
  const counted = await apply(supabase.from(kind).select('id', { count: 'exact', head: true })); if (counted.error) throw new Error(counted.error.message);
  const info = pagination(counted.count ?? 0, input.page, input.pageSize); const range = pageRange(info.page, input.pageSize);
  const rows = await apply(supabase.from(kind).select(businessFields[kind]).order(sort, { ascending: input.direction === 'asc' }).order('id', { ascending: true }).range(range.from, range.to));
  if (rows.error) throw new Error(rows.error.message);
  return paginated((rows.data ?? []) as Record<string, unknown>[], info.total, info.page, input.pageSize);
}
export function attachFinancialSummaries<T extends { id: string }>(projects: T[], summaries: ProjectFinancialSummary[]): ProjectWithFinancialSummary<T>[] { const byProjectId = new Map(summaries.map((summary) => [summary.id, summary])); return projects.map((project) => { const financialSummary = byProjectId.get(project.id); if (!financialSummary) throw new Error(`Inconsistencia de datos: el proyecto ${project.id} no tiene resumen financiero.`); return { ...project, financialSummary }; }); }
async function loadFinancialSummaries(supabase: SupabaseLike, projectIds: string[]) { const batches: string[][] = []; for (let index = 0; index < projectIds.length; index += summaryBatchSize) batches.push(projectIds.slice(index, index + summaryBatchSize)); return (await Promise.all(batches.map((ids) => typedRows<ProjectFinancialSummary>('resúmenes financieros de proyectos', supabase.from('project_financial_summary').select(summaryFields).in('id', ids))))).flat(); }
async function loadProjectsWithFinancialSummary<T extends { id: string }>(supabase: SupabaseLike, request: PromiseLike<QueryResult<any>>, label: string) { const projects = await typedRows<T>(label, request); if (!projects.length) return [] as ProjectWithFinancialSummary<T>[]; return attachFinancialSummaries(projects, await loadFinancialSummaries(supabase, projects.map((project) => project.id))); }
export async function getProjectsWithFinancialSummary(label = 'proyectos') { const supabase = await createClient(); return loadProjectsWithFinancialSummary<ProjectRecord>(supabase, supabase.from('projects').select(projectFields).order('created_at', { ascending: false }), label); }
export async function getProjectPage(input: { q: string; status: string; sort: string; direction: 'asc' | 'desc'; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const allowed = ['created_at', 'title', 'status', 'expected_end_date', 'project_value']; const sort = allowed.includes(input.sort) ? input.sort : 'created_at';
  const apply = (query: any) => { if (input.q) query = query.or(`title.ilike.%${input.q.replace(/[%,()]/g, '')}%,quote_number.ilike.%${input.q.replace(/[%,()]/g, '')}%`); if (input.status) query = query.eq('status', input.status); return query; };
  const count = await apply(supabase.from('projects').select('id', { count: 'exact', head: true })); if (count.error) throw new Error(count.error.message);
  const info = pagination(count.count ?? 0, input.page, input.pageSize); const range = pageRange(info.page, input.pageSize);
  const projects = await loadProjectsWithFinancialSummary<ProjectRecord>(supabase, apply(supabase.from('projects').select(projectFields).order(sort, { ascending: input.direction === 'asc' }).order('id', { ascending: true }).range(range.from, range.to)), 'proyectos');
  return paginated(projects, info.total, info.page, input.pageSize);
}
export type ClientWithStats = { id: string; name: string; client_type: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null; is_active: boolean; projectCount: number; contracted: string };
export async function getClientsWithStats() {
  const supabase = await createClient();
  const [clients, projects] = await Promise.all([
    typedRows<Omit<ClientWithStats, 'projectCount' | 'contracted'>>('clientes', supabase.from('clients').select('id,name,client_type,contact_name,phone,email,address,is_active').order('name')),
    typedRows<{ client_id: string; project_value: string }>('proyectos para clientes', supabase.from('projects').select('client_id,project_value')),
  ]);
  const totals = new Map<string, { count: number; contracted: ReturnType<typeof decimal> }>();
  for (const project of projects) { const current = totals.get(project.client_id) ?? { count: 0, contracted: decimal(0) }; current.count += 1; current.contracted = current.contracted.plus(decimal(project.project_value)); totals.set(project.client_id, current); }
  return clients.map((client) => ({ ...client, projectCount: totals.get(client.id)?.count ?? 0, contracted: (totals.get(client.id)?.contracted ?? decimal(0)).toString() }));
}export async function getQuotesWithPresentationData(label = 'cotizaciones') { const supabase = await createClient(); return typedRows<QuoteRecord>(label, supabase.from('quotes').select(quoteFields).order('issued_on', { ascending: false })); }
export async function getQuoteProjectDashboard() { const supabase = await createClient(); const { data, error } = await supabase.rpc('quote_project_dashboard_snapshot'); if (error || !data) throw new Error(`No fue posible cargar los resúmenes comerciales: ${error?.message ?? 'sin datos'}`); return data as QuoteProjectDashboard; }
export async function getQuotePage(input: { q: string; status: string; sort: string; direction: 'asc' | 'desc'; page: number; pageSize: PageSize }) { const supabase = await createClient(); const range = pageRange(input.page, input.pageSize); const { data, error } = await supabase.rpc('quotes_page', { p_q: input.q || null, p_status: input.status || null, p_sort: input.sort, p_direction: input.direction, p_offset: range.from, p_limit: input.pageSize }); if (error) throw new Error(`No fue posible cargar cotizaciones: ${error.message}`); const rows = (data ?? []) as Array<QuoteListRecord & { total_count: number }>; const info = pagination(rows[0]?.total_count ?? 0, input.page, input.pageSize); return paginated(rows.map(({ total_count: _total, ...row }) => row), info.total, info.page, input.pageSize); }
export async function getCompanySettings(label = 'configuración de empresa') { const supabase = await createClient(); return typedSingle<CompanySettings>(label, supabase.from('company_settings').select('legal_name,manager_name,manager_role,professional_card,phone,email,address,timezone,currency_code').eq('id', true).single()); }
export async function dashboardData() { const supabase = await createClient(); const [projects, quotes, financial] = await Promise.all([loadProjectsWithFinancialSummary<ProjectRecord>(supabase, supabase.from('projects').select(projectFields).order('created_at', { ascending: false }), 'proyectos del panel'), typedRows<QuoteRecord>('cotizaciones del panel', supabase.from('quotes').select(quoteFields).order('issued_on', { ascending: false })), typedSingle<any>('consolidado financiero del panel', supabase.from('portfolio_financial_summary').select('contracted,paid,balance,expenses,budget,real_profit,projected_profit').single())]); return { projects, quotes, financial }; }
export function sortProjectsByProfit<T extends { financialSummary: ProjectFinancialSummary }>(projects: T[]): T[] { return [...projects].sort((a, b) => decimal(a.financialSummary.real_profit).comparedTo(decimal(b.financialSummary.real_profit))); }
export async function getFinanceData() { const supabase = await createClient(); const [summary, projects, shares, payments, expenses] = await Promise.all([typedSingle<any>('consolidado financiero', supabase.from('portfolio_financial_summary').select('contracted,paid,balance,expenses,budget,real_profit,projected_profit').single()), loadProjectsWithFinancialSummary<ProjectRecord>(supabase, supabase.from('projects').select(projectFields), 'proyectos financieros'), typedRows('distribuciones generales', supabase.from('portfolio_shares').select('*').order('created_at')), typedRows<{ project_id: string; payment_date: string; amount: string }>('cobros financieros', supabase.from('project_payments').select('project_id,payment_date,amount')), typedRows<{ project_id: string; expense_date: string; amount: string }>('gastos financieros', supabase.from('project_expenses').select('project_id,expense_date,amount'))]); return { summary, projects: sortProjectsByProfit(projects), shares, payments, expenses }; }
export async function getAlertsData() { const supabase = await createClient(); return { projects: await loadProjectsWithFinancialSummary<ProjectRecord>(supabase, supabase.from('projects').select(projectFields), 'proyectos para alertas') }; }
export type AlertRecord = { id: string; project_id: string; title: string; kind: string; expected_end_date: string; project_value: string; paid: string };
export async function getAlertsPage(input: { q: string; kind: string; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const range = pageRange(input.page, input.pageSize);
  const { data, error } = await supabase.rpc('alerts_page', { p_q: input.q || null, p_kind: input.kind || null, p_offset: range.from, p_limit: input.pageSize });
  if (error) throw new Error(`No fue posible cargar alertas: ${error.message}`);
  const rows = (data ?? []) as Array<AlertRecord & { total_count: number }>;
  const info = pagination(rows[0]?.total_count ?? 0, input.page, input.pageSize);
  return paginated(rows.map(({ total_count: _total, ...row }) => row), info.total, info.page, input.pageSize);
}
export type UserRecord = { id: string; full_name: string; role: 'administrator' | 'management'; is_active: boolean };
export async function getUsersPage(input: { q: string; status: string; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const range = pageRange(input.page, input.pageSize);
  const { data, error } = await supabase.rpc('profiles_page', { p_q: input.q || null, p_status: input.status || null, p_offset: range.from, p_limit: input.pageSize });
  if (error) throw new Error(`No fue posible cargar usuarios: ${error.message}`);
  const rows = (data ?? []) as Array<UserRecord & { total_count: number }>;
  const info = pagination(rows[0]?.total_count ?? 0, input.page, input.pageSize);
  return paginated(rows.map(({ total_count: _total, ...row }) => row), info.total, info.page, input.pageSize);
}
export async function getDashboardSnapshot() {
  const supabase = await createClient(); const { data, error } = await supabase.rpc('dashboard_snapshot');
  if (error || !data) throw new Error(`No fue posible cargar el panel: ${error?.message ?? 'sin datos'}`);
  return data as { financial: { contracted: string; paid: string; balance: string; expenses: string; budget: string; real_profit: string }; project_total: number; active_total: number; delayed_total: number; soon_total: number; alert_total: number; recent_projects: Array<{ id: string; title: string; quote_number: string; status: string; responsible: string; project_value: string; paid: string; real_profit: string }>; priority_alerts: Array<{ id: string; project_id: string; title: string; kind: string; expected_end_date: string; project_value: string; paid: string }> };
}
export async function getActiveQuoteOptions() { const supabase = await createClient(); const [clients, catalog] = await Promise.all([typedRows('clientes activos', supabase.from('clients').select('id,name,contact_name,email,address').eq('is_active', true).order('name')), typedRows('catálogo activo', supabase.from('catalog_items').select('id,code,description,unit,base_unit_price,category').eq('is_active', true).order('code'))]); return { clients, catalog }; }
