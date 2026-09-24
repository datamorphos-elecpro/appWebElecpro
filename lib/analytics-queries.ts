import { pageRange, paginated, pagination, type PageSize, type PaginatedResult } from './pagination';
import { createClient } from './supabase/server';
import type { ChartDatum } from './chart-data';

export type AnalyticsTab = 'management' | 'operation' | 'commercial' | 'distribution';
export type { ChartDatum } from './chart-data';
export type FilterOptions = { clients: Option[]; projects: ProjectOption[]; responsible: Option[] };
export type Option = { value: string; label: string };
export type ProjectOption = Option & { parentId: string };
export type ManagementRow = { id: string; title: string; quote_number: string; status: string; project_value: string; paid: string; balance: string; budget: string; expenses: string; real_profit: string; projected_profit: string };
export type OperationRow = { id: string; title: string; quote_number: string; responsible: string; start_date: string; expected_end_date: string; actual_end_date: string | null; status: string };
export type CommercialRow = { id: string; number: string; client_name: string; issued_on: string; visible_status: string; total_amount: string };
export type BudgetExecutionDatum = { key: string; label: string; value: string; expenses: string; budget: string; overBudget: boolean; unit: 'percent' };
export type ProfitMarginDatum = { key: string; label: string; current: string; projected: string; unit: 'percent' };
export type ManagementSnapshot = { metrics: { projectValue: string; paid: string; balance: string; expenses: string; budget: string; profit: string; projectedProfit: string }; period: { paid: string; expenses: string; movementCount: number }; monthly: Array<{ key: string; label: string; paid: string; expenses: string; difference: string }>; balances: ChartDatum[]; cashByProject: Array<{ key: string; label: string; paid: string; expenses: string; difference: string }>; budgetExecution: BudgetExecutionDatum[]; profitMargins: ProfitMarginDatum[]; excluded: { budgetExecution: number; profitMargins: number } };
export type OperationSnapshot = { total: number; byStatus: ChartDatum[]; byResponsible: ChartDatum[] };
export type CommercialSnapshot = { metrics: { approvedValue: string; validSent: number; expired: number; approval: string | null }; byStatus: ChartDatum[]; byMonth: ChartDatum[]; byClient: ChartDatum[] };

function nullable(value: string) { return value || null; }
function error(message: string) { throw new Error(`No fue posible cargar Análisis: ${message}`); }
function rows<T>(data: unknown, page: number, pageSize: PageSize): PaginatedResult<T> {
  const raw = (data ?? []) as Array<T & { total_count: number }>;
  const total = Number(raw[0]?.total_count ?? 0);
  return paginated(raw.map(({ total_count: _total, ...row }) => row as T), total, pagination(total, page, pageSize).page, pageSize);
}

export async function getFilterOptions(view: Exclude<AnalyticsTab, 'distribution'>): Promise<FilterOptions> {
  const supabase = await createClient(); const { data, error: rpcError } = await supabase.rpc('analytics_filter_options_v2', { p_view: view });
  if (rpcError) error(rpcError.message);
  const result: FilterOptions = { clients: [], projects: [], responsible: [] };
  const keyByKind = { client: 'clients', project: 'projects', responsible: 'responsible' } as const;
  for (const item of (data ?? []) as Array<{ kind: keyof typeof keyByKind; id: string; label: string; parent_id: string | null }>) {
    const key = keyByKind[item.kind];
    if (key === 'projects') result.projects.push({ value: item.id, label: item.label, parentId: item.parent_id ?? '' });
    else result[key].push({ value: item.id, label: item.label });
  }
  return result;
}

export async function getManagement(input: { client: string[]; project: string[]; status: string[]; month: string; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const range = pageRange(input.page, input.pageSize);
  const args = { p_clients: input.client, p_projects: input.project, p_statuses: input.status };
  const [snapshot, table] = await Promise.all([supabase.rpc('analytics_management_snapshot_multi', { ...args, p_month: nullable(input.month) }), supabase.rpc('analytics_management_page_multi', { ...args, p_offset: range.from, p_limit: input.pageSize })]);
  if (snapshot.error || table.error) error(snapshot.error?.message ?? table.error?.message ?? 'respuesta inválida');
  return { snapshot: snapshot.data as ManagementSnapshot, table: rows<ManagementRow>(table.data, input.page, input.pageSize) };
}

export async function getOperation(input: { client: string[]; responsible: string[]; status: string[]; priority: string[]; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const range = pageRange(input.page, input.pageSize);
  const args = { p_clients: input.client, p_responsibles: input.responsible, p_statuses: input.status, p_priorities: input.priority };
  const [snapshot, table] = await Promise.all([supabase.rpc('analytics_operation_snapshot_multi', args), supabase.rpc('analytics_operation_page_multi', { ...args, p_offset: range.from, p_limit: input.pageSize })]);
  if (snapshot.error || table.error) error(snapshot.error?.message ?? table.error?.message ?? 'respuesta inválida');
  return { snapshot: snapshot.data as OperationSnapshot, table: rows<OperationRow>(table.data, input.page, input.pageSize) };
}

export async function getCommercial(input: { client: string[]; status: string[]; month: string; page: number; pageSize: PageSize }) {
  const supabase = await createClient(); const range = pageRange(input.page, input.pageSize); const args = { p_clients: input.client, p_statuses: input.status, p_month: nullable(input.month) };
  const [snapshot, table] = await Promise.all([supabase.rpc('analytics_commercial_snapshot_multi', args), supabase.rpc('analytics_commercial_page_multi', { ...args, p_offset: range.from, p_limit: input.pageSize })]);
  if (snapshot.error || table.error) error(snapshot.error?.message ?? table.error?.message ?? 'respuesta inválida');
  return { snapshot: snapshot.data as CommercialSnapshot, table: rows<CommercialRow>(table.data, input.page, input.pageSize) };
}
