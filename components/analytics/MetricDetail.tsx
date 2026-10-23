'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { analysisDetailResponseSchema, metricLabels, type AnalysisDetail, type AnalysisDetailRow, type AnalysisMetric } from '../../lib/analytics-detail';
import { projectCovered } from '../../lib/calculations';
import { money } from '../../lib/money';
import { bogotaDateText, profitModeText, projectStatusText, quoteStatusText } from '../../lib/presentation';
import { Metric } from '../ui/Page';
import { Dialog } from '../ui/Dialog';
import { ResponsiveTable } from '../ui/ResponsiveTable';
import styles from './MetricDetail.module.css';
import pagerStyles from '../ui/Pagination.module.css';

export function AnalysisMetricCard({ metric, ...props }: Omit<ComponentProps<typeof Metric>, 'onClick' | 'href'> & { metric: AnalysisMetric }) {
  const search = useSearchParams();
  const [query, setQuery] = useState<string | null>(null);
  return <><Metric {...props} onClick={() => setQuery(search.toString())} />{query !== null && <MetricDetail metric={metric} query={query} onClose={() => setQuery(null)} />}</>;
}

function MetricDetail({ metric, query, onClose }: { metric: AnalysisMetric; query: string; onClose: () => void }) {
  const [page, setPage] = useState(1); const [size, setSize] = useState(20);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ url: string; data?: AnalysisDetail; error?: string } | null>(null);
  const params = new URLSearchParams(query); params.set('metric', metric); params.set('page', String(page)); params.set('pageSize', String(size));
  const url = `/api/analisis/detalle?${params}`;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'No fue posible cargar el detalle.');
        const data = analysisDetailResponseSchema.parse(body);
        if (!controller.signal.aborted) setResult({ url, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ url, error: error instanceof Error ? error.message : 'No fue posible cargar el detalle.' });
      }
    })();
    return () => controller.abort();
  }, [url, retry]);
  const current = result?.url === url ? result : null; const data = current?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const displayValue = !data || data.value === null ? 'No calculable' : data.unit === 'money' ? money(data.value) : data.unit === 'percent' ? `${data.value}%` : data.value;
  return <Dialog open wide title={metricLabels[metric]} onClose={onClose}>
    <div className={styles.detail}>
      <p className={styles.scope}>{metric.startsWith('management.') ? 'Acumulado de los proyectos filtrados. El periodo de caja no limita esta métrica.' : metric === 'distribution.result' || metric === 'distribution.available' ? 'El resultado usa el portafolio completo; las asignaciones respetan los filtros de Distribuciones.' : 'Detalle correspondiente a los filtros activos de esta vista.'}</p>
      {!current && <p role="status">Cargando detalle…</p>}
      {current?.error && <div role="alert"><p>{current.error}</p><button type="button" onClick={() => { setResult(null); setRetry((value) => value + 1); }}>Reintentar</button></div>}
      {data && <>
        <p className={styles.total}>Total del conjunto: <strong>{displayValue}</strong> · {data.total} registros</p>
        {metric === 'commercial.approval' && <p>Aprobadas: {data.components.approved} / Decisiones (aprobadas + rechazadas): {data.components.decisions}. {data.total === 0 ? 'Sin decisiones para calcular aprobación.' : 'Aprobación = aprobadas ÷ decisiones × 100.'}</p>}
        {metric === 'distribution.available' && <p>Disponible = resultado {money(data.components.result)} − asignado {money(data.components.assigned)} (pagado {money(data.components.paid)} + pendiente {money(data.components.pending)}). Las asignaciones se muestran con signo negativo.</p>}
        <ResponsiveTable label={`Detalle de ${metricLabels[metric]}`}><thead><tr>{columns(metric).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
          {data.records.length ? data.records.map((row) => <tr key={`${row.kind}:${row.id}`}>{cells(metric, row).map((cell, index) => <td key={index} data-financial={typeof cell === 'string' && cell.includes('$') ? true : undefined}>{cell}</td>)}</tr>) : <tr><td colSpan={columns(metric).length}>Sin registros para estos filtros.</td></tr>}
        </tbody></ResponsiveTable>
        <nav className={pagerStyles.pager} aria-label="Paginación del detalle"><label>Registros por página<select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[20,50,100].map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className={pagerStyles.navigation}><button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</button><span aria-live="polite">Página {data.page} de {totalPages}</span><button type="button" disabled={data.page >= totalPages} onClick={() => setPage(data.page + 1)}>Siguiente</button></div>
        </nav>
      </>}
    </div>
  </Dialog>;
}

function columns(metric: AnalysisMetric): string[] {
  if (metric === 'management.projectValue') return ['Proyecto', 'Cliente', 'Estado', 'Valor contratado'];
  if (metric === 'management.balance') return ['Proyecto', 'Cliente', 'Valor', 'Anticipos', 'Retenciones', 'Cubierto', 'Saldo'];
  if (metric === 'management.expenses') return ['Fecha', 'Proyecto', 'Cliente', 'Categoría', 'Descripción', 'Valor'];
  if (metric === 'management.profit' || metric === 'management.projectedProfit' || metric === 'distribution.result') return ['Proyecto', 'Cliente', 'Modelo', 'Base', metric === 'management.projectedProfit' ? 'Presupuesto' : 'Gastos', ...(metric === 'management.projectedProfit' ? [] : ['Distribuciones pagadas']), 'Resultado'];
  if (metric.startsWith('commercial.')) return ['Cotización', 'Cliente', 'Emisión', 'Vigencia', 'Estado', 'Valor'];
  if (metric === 'distribution.available') return ['Origen', 'Proyecto / Participante', 'Detalle', 'Aporte al disponible'];
  return ['Participante', 'Regla', 'Estado', 'Fecha de pago', 'Importe aplicado'];
}
function cells(metric: AnalysisMetric, row: AnalysisDetailRow): ReactNode[] {
  const project = row.kind === 'project' || row.kind === 'expense' ? <Link href={`/proyectos/${row.project_id}`}>{row.label} · {row.title}</Link> : null;
  if (row.kind === 'expense') return [bogotaDateText(row.date), project, row.client_name, row.category, row.note || '—', money(row.amount)];
  if (row.kind === 'quote') return [<Link key={row.id} href={`/cotizaciones/${row.quote_id}`}>{row.label} · {row.title}</Link>, row.client_name, bogotaDateText(row.date), bogotaDateText(row.valid_until), quoteStatusText(row.status), money(row.quote_value)];
  if (metric === 'distribution.available') return row.kind === 'project' ? ['Resultado del proyecto', project, `${profitModeText(row.profit_mode)} · Base ${money(row.base)} − gastos ${money(row.expenses)} - distribuciones pagadas ${money(row.paid_distributions)}`, money(row.amount)] : ['Distribución', row.label, `${row.is_paid ? 'Pagada' : 'Pendiente'} · ${row.mode === 'percent' ? `${row.rule_value}%` : money(row.rule_value)}`, money(row.amount)];
  if (row.kind === 'distribution') return [row.label, row.mode === 'percent' ? `${row.rule_value}% del resultado` : money(row.rule_value), row.is_paid ? 'Pagada' : row.is_active ? 'Pendiente' : 'Inactiva', row.date ? bogotaDateText(row.date) : '—', money(row.amount)];
  if (metric === 'management.projectValue') return [project, row.client_name, projectStatusText(row.status), money(row.amount)];
  if (metric === 'management.balance') return [project, row.client_name, money(row.project_value), money(row.paid), money(row.withheld), money(projectCovered(row.paid, row.withheld)), money(row.balance)];
  return [project, row.client_name, profitModeText(row.profit_mode), money(row.base), money(metric === 'management.projectedProfit' ? row.budget : row.expenses), ...(metric === 'management.projectedProfit' ? [] : [money(row.paid_distributions)]), money(row.amount)];
}
