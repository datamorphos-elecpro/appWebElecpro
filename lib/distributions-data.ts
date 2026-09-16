import { decimal } from './calculations';
import { pageRange, paginated, pagination, type PageSize } from './pagination';
import { createClient } from './supabase/server';

export type Distribution = { id: string; participant: string; mode: 'percent' | 'fixed'; value: string; basis: 'portfolio_profit'; is_active: boolean; is_paid: boolean; paid_on: string | null; paid_amount: string | null; created_at: string };
export type DistributionMetrics = { result: string; assigned: string; paid: string; pending: string; available: string; overAssigned: boolean };

export function distributionAmount(row: Pick<Distribution, 'mode' | 'value'>, profit: string) { return row.mode === 'percent' ? decimal(profit).times(row.value).div(100).toString() : row.value; }
export function distributionMetrics(rows: Distribution[], profit: string): DistributionMetrics {
  const assigned = rows.filter((row) => row.is_active && !row.is_paid).reduce((sum, row) => sum.plus(distributionAmount(row, profit)), decimal(0));
  const paid = rows.filter((row) => row.is_paid).reduce((sum, row) => sum.plus(row.paid_amount ?? '0'), decimal(0));
  const pending = assigned; const available = decimal(profit).minus(assigned).minus(paid);
  return { result: profit, assigned: assigned.toString(), paid: paid.toString(), pending: pending.toString(), available: available.toString(), overAssigned: available.isNegative() };
}

export async function getDistributionPage(input: { q?: string; activity?: string; payment?: string; page: number; pageSize: PageSize }) {
  const supabase = await createClient();
  const apply = (query: any) => { if (input.q) query = query.ilike('participant', `%${input.q.replace(/[%,]/g, '')}%`); if (input.activity === 'active') query = query.eq('is_active', true); if (input.activity === 'inactive') query = query.eq('is_active', false); if (input.payment === 'paid') query = query.eq('is_paid', true); if (input.payment === 'pending') query = query.eq('is_paid', false); return query; };
  const countResult = await apply(supabase.from('portfolio_shares').select('id', { count: 'exact', head: true }));
  if (countResult.error) throw new Error(countResult.error.message);
  const info = pagination(countResult.count ?? 0, input.page, input.pageSize); const range = pageRange(info.page, input.pageSize);
  const [rowsResult, totalsResult, summaryResult] = await Promise.all([
    apply(supabase.from('portfolio_shares').select('id,participant,mode,value,basis,is_active,is_paid,paid_on,paid_amount,created_at').order('created_at', { ascending: false }).range(range.from, range.to)),
    supabase.from('portfolio_shares').select('id,participant,mode,value,basis,is_active,is_paid,paid_on,paid_amount,created_at'),
    supabase.from('portfolio_financial_summary').select('real_profit').single(),
  ]);
  if (rowsResult.error || totalsResult.error || summaryResult.error) throw new Error(rowsResult.error?.message ?? totalsResult.error?.message ?? summaryResult.error?.message ?? 'No fue posible cargar las distribuciones.');
  const allRows = (totalsResult.data ?? []) as Distribution[]; const result = summaryResult.data?.real_profit ?? '0';
  return { ...paginated((rowsResult.data ?? []) as Distribution[], info.total, info.page, input.pageSize), metrics: distributionMetrics(allRows, result), allRows };
}
