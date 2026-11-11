import Link from 'next/link';
import type { ReactNode } from 'react';
import { financialAttributes } from '../../lib/financial-tone';
import { type AnalysisDetailRow, type AnalysisMetric } from '../../lib/analytics-detail';
import { projectCovered } from '../../lib/calculations';
import { money } from '../../lib/money';
import { bogotaDateText, projectStatusText, quoteStatusText } from '../../lib/presentation';

export function columns(metric: AnalysisMetric): string[] {
  if (metric === 'management.projectValue') return ['Proyecto', 'Cliente', 'Estado', 'Valor contratado'];
  if (metric === 'management.balance') return ['Proyecto', 'Cliente', 'Valor', 'Anticipos', 'Retenciones', 'Cubierto', 'Saldo'];
  if (metric === 'management.expenses') return ['Fecha', 'Proyecto', 'Cliente', 'Categoría', 'Descripción', 'Valor'];
  if (metric === 'management.profit' || metric === 'management.projectedProfit' || metric === 'distribution.result') return ['Proyecto', 'Cliente', 'Modelo', 'Base', metric === 'management.projectedProfit' ? 'Presupuesto' : 'Gastos', ...(metric === 'management.projectedProfit' ? [] : ['Distribuciones pagadas']), 'Resultado'];
  if (metric.startsWith('commercial.')) return ['Cotización', 'Cliente', 'Emisión', 'Vigencia', 'Estado', 'Valor'];
  if (metric === 'distribution.available') return ['Origen', 'Proyecto / Participante', 'Detalle', 'Aporte al disponible'];
  return ['Participante', 'Regla', 'Estado', 'Fecha de pago', 'Importe aplicado'];
}
export function cells(metric: AnalysisMetric, row: AnalysisDetailRow): ReactNode[] {
  const project = row.kind === 'project' || row.kind === 'expense' ? <Link href={`/proyectos/${row.project_id}`}>{row.label} · {row.title}</Link> : null;
  if (row.kind === 'expense') return [bogotaDateText(row.date), project, row.client_name, row.category, row.note || '—', money(row.amount)];
  if (row.kind === 'quote') return [<Link key={row.id} href={`/cotizaciones/${row.quote_id}`}>{row.label} · {row.title}</Link>, row.client_name, bogotaDateText(row.date), bogotaDateText(row.valid_until), quoteStatusText(row.status), money(row.quote_value)];
  if (metric === 'distribution.available') return row.kind === 'project' ? ['Resultado del proyecto', project, `${'Costo directo neto'} · Base ${money(row.base)} − gastos ${money(row.expenses)} - distribuciones pagadas ${money(row.paid_distributions)}`, money(row.amount)] : ['Distribución', row.label, `${row.is_paid ? 'Pagada' : 'Pendiente'} · ${row.mode === 'percent' ? `${row.rule_value}%` : money(row.rule_value)}`, money(row.amount)];
  if (row.kind === 'distribution') return [row.label, row.mode === 'percent' ? `${row.rule_value}% del resultado` : money(row.rule_value), row.is_paid ? 'Pagada' : row.is_active ? 'Pendiente' : 'Inactiva', row.date ? bogotaDateText(row.date) : '—', money(row.amount)];
  if (metric === 'management.projectValue') return [project, row.client_name, projectStatusText(row.status), money(row.amount)];
  if (metric === 'management.balance') return [project, row.client_name, money(row.project_value), money(row.paid), money(row.withheld), money(projectCovered(row.paid, row.withheld)), money(row.balance)];
  return [project, row.client_name, 'Costo directo neto', money(row.base), money(metric === 'management.projectedProfit' ? row.budget : row.expenses), ...(metric === 'management.projectedProfit' ? [] : [money(row.paid_distributions)]), money(row.amount)];
}

export function cellAttributes(metric: AnalysisMetric, row: AnalysisDetailRow, index: number) {
  // Negative accounting deductions are descriptive, never losses by themselves.
  if (row.kind !== 'project') return {};
  const last = cells(metric, row).length - 1;
  if (index === last && metric === 'management.balance') return financialAttributes(row.balance, 'balance');
  if (index === last && ['management.profit', 'management.projectedProfit', 'distribution.result', 'distribution.available'].includes(metric)) return financialAttributes(row.amount, 'result');
  if (index === 4 && ['management.profit', 'distribution.result'].includes(metric)) return financialAttributes(row.expenses, 'expense', row.budget);
  return {};
}
