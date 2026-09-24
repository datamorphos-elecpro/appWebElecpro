import { getCommercial, getFilterOptions, getManagement, getOperation, type CommercialRow, type ManagementRow, type OperationRow } from '../../../../lib/analytics-queries';
import { money } from '../../../../lib/money';
import { bogotaDateText, monthText, priorityText, projectStatusText, quoteStatusText } from '../../../../lib/presentation';
import { AnalyticsBarChart } from '../../../../components/analytics/AnalyticsBarChart';
import { ProjectPercentChart } from '../../../../components/analytics/ProjectPercentChart';
import { PrintFinanceButton } from '../../../../components/finance/PrintFinanceButton';
import { requireProfile } from '../../../../lib/auth';
import Image from 'next/image';
import { decimal } from '../../../../lib/calculations';
import styles from './report.module.css';

type Params = Record<string, string | string[] | undefined>;
const value = (params: Params, key: string) => typeof params[key] === 'string' ? params[key] as string : '';
const select = (candidate: string, allowed: string[]) => allowed.includes(candidate) ? candidate : '';
const selected = (params: Params, key: string, allowed: string[]) => [...new Set((Array.isArray(params[key]) ? params[key] as string[] : [value(params, key)]).filter((item) => allowed.includes(item)))];

export default async function AnalysisReport({ searchParams }: { searchParams: Promise<Params> }) {
  await requireProfile();
  const params = await searchParams;
  const tab = select(value(params, 'tab'), ['management', 'operation', 'commercial']) || 'management';
  const options = await getFilterOptions(tab as 'management' | 'operation' | 'commercial');
  const client = selected(params, `${tab}_client`, options.clients.map((item) => item.value));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(value(params, `${tab}_month`)) ? value(params, `${tab}_month`) : '';
  const status = selected(params, `${tab}_status`, tab === 'commercial' ? ['draft','sent','approved','rejected','expired'] : ['draft','quoted','approved','in_progress','paused','finished','cancelled']);
  const filters = [client.length && `Clientes: ${options.clients.filter((item) => client.includes(item.value)).map((item) => item.label).join(', ')}`, status.length && `Estados: ${status.map((item) => tab === 'commercial' ? quoteStatusText(item) : projectStatusText(item)).join(', ')}`, month && `Mes: ${monthText(month)}`];
  let content: React.ReactNode;
  let recordCount = 0;
  if (tab === 'management') {
    const project = selected(params, 'management_project', options.projects.filter((item) => !client.length || client.includes(item.parentId)).map((item) => item.value));
    filters.push(project.length && `Proyectos: ${options.projects.filter((item) => project.includes(item.value)).map((item) => item.label).join(', ')}`);
    const input = { client, project, status, month, page: 1, pageSize: 100 as const };
    const first = await getManagement(input); const rows: ManagementRow[] = [...first.table.records];
    for (let page = 2; page <= first.table.page.pageCount; page++) rows.push(...(await getManagement({ ...input, page })).table.records);
    recordCount = rows.length; const s = first.snapshot; content = <><div className={styles.metrics}><Metric label="Valor de proyectos" value={money(s.metrics.projectValue)} /><Metric label="Cartera pendiente" value={money(s.metrics.balance)} /><Metric label="Gastos reales" value={money(s.metrics.expenses)} /><Metric label="Resultado actual" value={money(s.metrics.profit)} /><Metric label="Resultado proyectado" value={money(s.metrics.projectedProfit)} /></div><div className={styles.charts}><Chart title="Cobros, gastos y diferencia" data={s.monthly.flatMap((x) => [{ key: `${x.key}:paid`, label: `${monthText(x.key)} · Cobros`, value: x.paid, series: 'Cobros' }, { key: `${x.key}:expenses`, label: `${monthText(x.key)} · Gastos`, value: `-${x.expenses}`, series: 'Gastos' }, { key: `${x.key}:difference`, label: `${monthText(x.key)} · Diferencia`, value: x.difference, series: 'Diferencia' }])} /><Chart title="Cartera por cliente" data={s.balances} /><section className={styles.chart}><h2>Ejecución presupuestal</h2><ReportPercentChart data={s.budgetExecution} kind="execution" label="Ejecución presupuestal" /></section><section className={styles.chart}><h2>Margen a la fecha vs. margen proyectado</h2><ReportPercentChart data={s.profitMargins} kind="margin" label="Márgenes por proyecto" /></section></div><Table title="Resultado financiero por proyecto" headers={['Proyecto','Estado','Valor','Cobros','Saldo','Presupuesto','Gastos','Diferencia de caja','Actual']} numericFrom={2} rows={rows.map((r) => [r.quote_number || r.title, projectStatusText(r.status), money(r.project_value), money(r.paid), money(r.balance), money(r.budget), money(r.expenses), money(decimal(r.paid).minus(r.expenses)), money(r.real_profit)])} /></>;
  } else if (tab === 'operation') {
    const responsible = selected(params, 'operation_responsible', options.responsible.map((item) => item.value));
    const priority = selected(params, 'operation_priority', ['low','medium','high','critical']);
    filters.push(responsible.length && `Responsables: ${options.responsible.filter((item) => responsible.includes(item.value)).map((item) => item.label).join(', ')}`, priority.length && `Prioridades: ${priority.map(priorityText).join(', ')}`);
    const input = { client, responsible, status, priority, page: 1, pageSize: 100 as const };
    const first = await getOperation(input); const rows: OperationRow[] = [...first.table.records];
    for (let page = 2; page <= first.table.page.pageCount; page++) rows.push(...(await getOperation({ ...input, page })).table.records);
    recordCount = rows.length; const s = first.snapshot; content = <><div className={styles.metrics}><Metric label="Proyectos filtrados" value={String(s.total)} /></div><div className={styles.charts}><Chart title="Proyectos por estado" data={s.byStatus.map((x) => ({ ...x, label: projectStatusText(x.key), unit: 'count' as const }))} /><Chart title="Activos por responsable" data={s.byResponsible.map((x) => ({ ...x, unit: 'count' as const }))} /></div><Table title="Cronograma y retrasos" headers={['Proyecto','Responsable','Inicio','Prevista','Real','Estado']} rows={rows.map((r) => [r.quote_number || r.title, r.responsible || '—', bogotaDateText(r.start_date), bogotaDateText(r.expected_end_date), bogotaDateText(r.actual_end_date), projectStatusText(r.status)])} /></>;
  } else {
    const input = { client, status, month, page: 1, pageSize: 100 as const };
    const first = await getCommercial(input); const rows: CommercialRow[] = [...first.table.records];
    for (let page = 2; page <= first.table.page.pageCount; page++) rows.push(...(await getCommercial({ ...input, page })).table.records);
    recordCount = rows.length; const s = first.snapshot; content = <><div className={styles.metrics}><Metric label="Valor aprobado" value={money(s.metrics.approvedValue)} /><Metric label="Propuestas vigentes" value={String(s.metrics.validSent)} /><Metric label="Vencidas" value={String(s.metrics.expired)} /><Metric label="Aprobación" value={s.metrics.approval ? `${s.metrics.approval}%` : 'No calculable'} /></div><div className={styles.charts}><Chart title="Valor por cliente" data={s.byClient} /><Chart title="Cotizaciones por estado" data={s.byStatus.map((x) => ({ ...x, label: quoteStatusText(x.key), unit: 'count' as const }))} /><Chart title="Valor emitido por mes" data={s.byMonth.map((x) => ({ ...x, label: monthText(x.key) }))} /></div><Table title="Detalle de cotizaciones" headers={['Número','Cliente','Emisión','Estado','Valor']} numericFrom={4} rows={rows.map((r) => [r.number, r.client_name, bogotaDateText(r.issued_on), quoteStatusText(r.visible_status), money(r.total_amount)])} /></>;
  }
  return <article className={`${styles.report} analysis-print-root`} data-preview={value(params, 'preview') === '1'}><div className={styles.controls}><a href={`/analisis${tab === 'management' ? '' : `?tab=${tab}`}`}>Volver a Análisis</a><PrintFinanceButton /></div><header className={styles.header}><Image src="/images/elecpro-logo.png" width={154} height={67} alt="Elecpro Ingeniería Eléctrica" /><div><small>INFORME DE ANÁLISIS</small><h1>{tab === 'management' ? 'Gerencia y rentabilidad' : tab === 'operation' ? 'Operación' : 'Comercial'}</h1><p>Generado el {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(new Date())} · Bogotá · {recordCount} registros</p><p>Filtros: {filters.filter(Boolean).join(' · ') || 'Todos'}</p></div></header>{content}</article>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }
function Chart({ title, data }: { title: string; data: Parameters<typeof AnalyticsBarChart>[0]['data'] }) { const chunks = data.length ? Array.from({ length: Math.ceil(data.length / 12) }, (_, i) => data.slice(i * 12, (i + 1) * 12)) : [[]]; return <>{chunks.map((chunk, index) => <section className={styles.chart} key={index}><h2>{title}{index ? ` · continuación ${index + 1}` : ''}</h2><AnalyticsBarChart data={chunk} label={title} /></section>)}</>; }
function ReportPercentChart({ data, kind, label }: { data: Parameters<typeof ProjectPercentChart>[0]['data']; kind: 'execution' | 'margin'; label: string }) { const chunks = data.length ? Array.from({ length: Math.ceil(data.length / 8) }, (_, i) => data.slice(i * 8, (i + 1) * 8)) : [[]]; return <>{chunks.map((chunk, index) => <div className={styles.chartChunk} key={index}>{index > 0 && <h3>{label} · continuación {index + 1}</h3>}<ProjectPercentChart data={chunk} kind={kind} label={label} /></div>)}</>; }
function Table({ title, headers, rows, numericFrom }: { title: string; headers: string[]; rows: string[][]; numericFrom?: number }) { return <section className={styles.tableSection}><h2>{title} · {rows.length} registros</h2><table><thead><tr>{headers.map((x, i) => <th className={numericFrom !== undefined && i >= numericFrom ? styles.numeric : undefined} key={x}>{x}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td className={numericFrom !== undefined && i >= numericFrom ? styles.numeric : undefined} key={i}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>Sin registros para los filtros aplicados.</td></tr>}</tbody></table></section>; }
