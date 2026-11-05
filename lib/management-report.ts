import { z } from 'zod';
import { analysisDetailResponseSchema, type AnalysisDetailRow } from './analytics-detail';
import { decimal } from './calculations';
import { projectStatusText } from './presentation';
import type { ChartDatum } from './chart-data';
import { financialTone } from './financial-tone';

export const managementMetrics = ['management.projectValue', 'management.balance', 'management.expenses', 'management.profit', 'management.projectedProfit'] as const;
export type ManagementMetric = typeof managementMetrics[number];
export const managementReportSchema = analysisDetailResponseSchema.omit({ page: true, pageSize: true }).extend({ metric: z.enum(managementMetrics) }).superRefine((report, context) => {
  const valid = report.total === report.records.length && report.records.every((row) => (row.kind === 'project' || row.kind === 'expense') && !!row.client_id)
    && report.value !== null && decimal(report.value).equals(report.records.reduce((sum, row) => sum.plus(row.amount), decimal(0)));
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'El informe está incompleto o sus totales no coinciden.' });
});
export type ManagementReport = z.infer<typeof managementReportSchema>;
export type ManagementReportRow = Extract<AnalysisDetailRow, { kind: 'project' | 'expense' }>;

export function reportGroups(records: ManagementReportRow[], by: 'client' | 'project' | 'category' | 'status', count = false) {
  const groups = new Map<string, { label: string; value: ReturnType<typeof decimal>; rows: ManagementReportRow[] }>();
  for (const row of records) {
    const key = by === 'client' ? row.client_id! : by === 'project' ? row.project_id : by === 'category' && row.kind === 'expense' ? row.category : row.kind === 'project' ? row.status : '';
    const label = by === 'client' ? row.client_name : by === 'project' ? `${row.label} · ${row.title}` : by === 'status' ? projectStatusText(key) : key;
    const group = groups.get(key) ?? { label, value: decimal(0), rows: [] };
    group.value = group.value.plus(count ? 1 : row.amount); group.rows.push(row); groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({ key, label: group.label, value: group.value.toString(), unit: count ? 'count' as const : 'money' as const, rows: group.rows }))
    .sort((a, b) => decimal(b.value).comparedTo(a.value) || a.key.localeCompare(b.key));
}
export function reportCharts(report: ManagementReport): { title: string; data: ChartDatum[] }[] {
  const rows = report.records as ManagementReportRow[];
  if (report.metric === 'management.balance') return [{ title: 'Cartera por cliente', data: reportGroups(rows, 'client') }, { title: 'Proyectos con deuda por cliente', data: reportGroups(rows, 'client', true) }];
  if (report.metric === 'management.projectValue') return [{ title: 'Valor contratado por cliente', data: reportGroups(rows, 'client') }, { title: 'Valor contratado por estado', data: reportGroups(rows, 'status') }];
  if (report.metric === 'management.expenses') return [{ title: 'Gastos por categoría', data: reportGroups(rows, 'category') }, { title: 'Gastos por proyecto', data: reportGroups(rows, 'project') }];
  const results = (by: 'client' | 'project') => reportGroups(rows, by).map((row) => ({ ...row, color: financialTone(row.value, 'result') === 'danger' ? 'var(--danger)' : decimal(row.value).isZero() ? '#64748b' : 'var(--green-700)' }));
  return [{ title: 'Resultado por cliente', data: results('client') }, { title: 'Resultado por proyecto', data: results('project') }];
}
