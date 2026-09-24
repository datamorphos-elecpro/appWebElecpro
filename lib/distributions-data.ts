import { decimal } from './calculations';
import { pageRange, paginated, pagination, type PageSize } from './pagination';
import { createClient } from './supabase/server';

export type Distribution = { id: string; participant: string; mode: 'percent' | 'fixed'; value: string; basis: 'portfolio_profit'; is_active: boolean; is_paid: boolean; paid_on: string | null; paid_amount: string | null; created_at: string };
export type DistributionMetrics = { result: string; assigned: string; paid: string; pending: string; available: string; overAssigned: boolean };
export type DistributionParticipant = { key: string; label: string; value: string; paid: string; pending: string };

export function distributionAmount(row: Pick<Distribution, 'mode' | 'value'>, profit: string) { return row.mode === 'percent' ? decimal(profit).times(row.value).div(100).toString() : row.value; }
export function distributionMetrics(rows: Distribution[], profit: string): DistributionMetrics {
  const pending = rows.filter((row) => row.is_active && !row.is_paid).reduce((sum, row) => sum.plus(distributionAmount(row, profit)), decimal(0));
  const paid = rows.filter((row) => row.is_paid).reduce((sum, row) => sum.plus(row.paid_amount ?? '0'), decimal(0));
  const assigned = paid.plus(pending); const available = decimal(profit).minus(assigned);
  return { result: profit, assigned: assigned.toString(), paid: paid.toString(), pending: pending.toString(), available: available.toString(), overAssigned: available.isNegative() };
}

export async function getDistributionPage(input: { q?: string; activity?: string[]; payment?: string[]; page: number; pageSize: PageSize }) {
  const supabase = await createClient();
  const range = pageRange(input.page, input.pageSize);
  const args = { p_q: input.q || null, p_activities: input.activity ?? [], p_payments: input.payment ?? [] };
  const [rowsResult, snapshotResult] = await Promise.all([
    supabase.rpc('distribution_page_multi', { ...args, p_offset: range.from, p_limit: input.pageSize }),
    supabase.rpc('distribution_snapshot_multi', args),
  ]);
  if (rowsResult.error || snapshotResult.error) throw new Error(rowsResult.error?.message ?? snapshotResult.error?.message ?? 'No fue posible cargar las distribuciones.');
  const rawRows = (rowsResult.data ?? []) as Array<Distribution & { total_count: number }>;
  const info = pagination(Number(rawRows[0]?.total_count ?? 0), input.page, input.pageSize);
  const summary = (snapshotResult.data as { metrics?: Omit<DistributionMetrics, 'overAssigned'>; participants?: DistributionParticipant[] } | null)?.metrics ?? { result: '0', paid: '0', pending: '0', assigned: '0', available: '0' };
  const metrics: DistributionMetrics = { result: String(summary.result), paid: String(summary.paid), pending: String(summary.pending), assigned: String(summary.assigned), available: String(summary.available), overAssigned: decimal(summary.available).isNegative() };
  return { ...paginated(rawRows.map(({ total_count: _total, ...row }) => row), info.total, info.page, input.pageSize), metrics, participants: (snapshotResult.data as { participants?: DistributionParticipant[] } | null)?.participants ?? [] };
}
