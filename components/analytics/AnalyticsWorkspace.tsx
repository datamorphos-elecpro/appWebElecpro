'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PrintFinanceButton } from '../finance/PrintFinanceButton';
import { FilterBar, FilterTag } from '../ui/FilterBar';
import { Metric } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { ResponsiveTable } from '../ui/ResponsiveTable';
import { Tabs } from '../ui/Tabs';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { commercialAnalysis, delayDays, managementAnalysis, operationAnalysis, projectStates, quoteStates, type AnalyticsData, type AnalyticsFilters, visibleQuoteStatus } from '../../lib/analytics-data';
import { decimal, shareAmount } from '../../lib/calculations';
import { money } from '../../lib/money';
import { bogotaDateText, priorityText, projectStatusText, quoteStatusText, shareModeText } from '../../lib/presentation';
import styles from './AnalyticsWorkspace.module.css';

type Tab = 'management' | 'operation' | 'commercial';
const tabs = [{ id: 'management', label: 'Gerencia y rentabilidad' }, { id: 'operation', label: 'Operación' }, { id: 'commercial', label: 'Comercial' }];
const fields: Record<Tab, readonly string[]> = { management: ['client', 'project', 'status', 'month'], operation: ['client', 'responsible', 'status', 'priority'], commercial: ['client', 'status', 'month'] };

function Select({ label, value, options, onChange }: { label: string; value?: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className={styles.control}><span>{label}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function AnalyticsWorkspace({ data }: { data: AnalyticsData }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const tab = tabs.some((item) => item.id === search.get('tab')) ? search.get('tab') as Tab : 'management';
  const filters = useMemo(() => Object.fromEntries(fields[tab].map((field) => [field, search.get(`${tab}_${field}`) ?? ''])) as AnalyticsFilters, [search, tab]);
  const update = (changes: Record<string, string | null>) => { const next = new URLSearchParams(search.toString()); Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); }); router.replace(`${pathname}?${next.toString()}`, { scroll: false }); };
  const setFilter = (field: string, value: string) => update({ [`${tab}_${field}`]: value || null });
  const setTab = (value: string) => update({ tab: value === 'management' ? null : value });
  const reset = () => update(Object.fromEntries(fields[tab].map((field) => [`${tab}_${field}`, null])));
  const clients = [...new Map([...data.projects, ...data.quotes].map((record) => [record.client_id, record.clients?.name ?? 'Sin cliente'])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const tags = fields[tab].flatMap((field) => filters[field] ? [<FilterTag key={field}>{fieldLabel(field)}: {filterLabel(field, filters[field], data)}</FilterTag>] : []);
  return <section className={styles.workspace}><Tabs items={tabs} value={tab} onChange={setTab} label="Vistas de análisis" />
    {tab === 'management' && <Management data={data} filters={filters} clients={clients} setFilter={setFilter} />}
    {tab === 'operation' && <Operation data={data} filters={filters} clients={clients} setFilter={setFilter} />}
    {tab === 'commercial' && <Commercial data={data} filters={filters} clients={clients} setFilter={setFilter} />}
    <div className={styles.tags}>{tags.length ? tags : <span>Sin filtros activos</span>}<button type="button" className={styles.reset} onClick={reset}>Restablecer filtros</button></div>
  </section>;
}

function Management({ data, filters, clients, setFilter }: ViewProps) {
  const view = managementAnalysis(data, filters);
  const projectOptions = data.projects.map((project) => ({ value: project.id, label: project.quote_number || project.title }));
  const periodLabel = filters.month ? `Mes ${filters.month}` : 'Todo el histórico disponible';
  const appliedFilters = fields.management.filter((field) => filters[field]).map((field) => `${fieldLabel(field)}: ${filterLabel(field, filters[field], data)}`);
  return <div className="analysis-print-root">
    <header className={styles.reportHeader}><h1>Gerencia y rentabilidad</h1><p>{appliedFilters.length ? appliedFilters.join(' · ') : 'Sin filtros acumulados'} · {periodLabel}</p></header>
    <div className={styles.managementActions} data-print-control>
      <PrintFinanceButton className={styles.printButton} />
    </div>
    <div data-print-control><FilterBar>
      <Select label="Cliente" value={filters.client} options={clients} onChange={(value) => setFilter('client', value)} />
      <Select label="Proyecto" value={filters.project} options={projectOptions} onChange={(value) => setFilter('project', value)} />
      <Select label="Estado" value={filters.status} options={projectStates.map((value) => ({ value, label: projectStatusText(value) }))} onChange={(value) => setFilter('status', value)} />
      <label className={styles.control}><span>Periodo (mes)</span><input type="month" value={filters.month ?? ''} onChange={(event) => setFilter('month', event.target.value)} /></label>
    </FilterBar></div>
    <p className={styles.scope}><strong>Alcance:</strong> los acumulados respetan cliente, proyecto y estado. Caja y movimientos usan además el periodo: {periodLabel}.</p>
    <div className={styles.metrics}>
      <Metric label="Valor de proyectos" value={money(view.projectValue)} note="Acumulado filtrado" />
      <Metric label="Cartera pendiente" value={money(view.balance)} note="Acumulado filtrado" tone="warning" />
      <Metric label="Gastos reales" value={money(view.expensesTotal)} note="Registrados a la fecha" />
      <Metric label="Resultado actual" value={money(view.profit)} note="Según gastos registrados" tone={decimal(view.profit).isNegative() ? 'danger' : 'success'} />
      <Metric label="Resultado proyectado" value={money(view.projectedProfit)} note="Según presupuesto" />
    </div>
    <div className={styles.periodMetrics}>
      <Metric label="Cobros del periodo" value={money(view.periodPaid)} note={periodLabel} />
      <Metric label="Gastos del periodo" value={money(view.periodExpenses)} note={periodLabel} />
      <Metric label="Diferencia del periodo" value={money(view.periodDifference)} note={`${view.movements.length} movimientos; no equivale a utilidad ni a saldo bancario`} tone={decimal(view.periodDifference).isNegative() ? 'danger' : undefined} />
    </div>
    <div className={styles.grid}>
      <Panel title="Cobros, gastos y diferencia" meta={periodLabel}><AnalyticsBarChart data={view.monthly} label="Cobros, gastos y diferencia por mes" onSelect={(value) => setFilter('month', value)} /></Panel>
      <Panel title="Resultado actual y proyectado" meta="Por proyecto"><AnalyticsBarChart data={view.profitability} label="Resultado actual y proyectado por proyecto" onSelect={(value) => setFilter('project', value)} /></Panel>
      <Panel title="Presupuesto frente a gastos" meta="Por proyecto"><AnalyticsBarChart data={view.costs} label="Presupuesto frente a gastos reales por proyecto" onSelect={(value) => setFilter('project', value)} /></Panel>
      <Panel title="Cartera pendiente por cliente" meta="Acumulado actual"><AnalyticsBarChart data={view.balances} label="Saldo pendiente por cliente" onSelect={(value) => setFilter('client', value)} /></Panel>
    </div>
    <Panel title="Resultado financiero por proyecto" meta="El resultado actual varía con los gastos registrados; el proyectado usa el presupuesto.">
      <ResponsiveTable label="Resultado financiero por proyecto"><thead><tr><th>Proyecto</th><th>Estado</th><th>Valor</th><th>Cobros</th><th>Saldo</th><th>Presupuesto</th><th>Gastos</th><th>Actual</th><th>Proyectado</th><th>Margen</th></tr></thead><tbody>
        {view.projects.length ? view.projects.map((project) => { const row = project.financialSummary; return <tr key={project.id}><td><Link href={`/proyectos/${project.id}`}><strong>{project.quote_number || project.title}</strong></Link></td><td>{projectStatusText(project.status)}</td><td>{money(project.project_value)}</td><td>{money(row.paid)}</td><td>{money(row.balance)}</td><td>{money(row.budget)}</td><td>{money(row.expenses)}</td><td>{money(row.real_profit)}</td><td>{money(row.projected_profit)}</td><td>{decimal(project.project_value).isZero() ? 'No calculable' : `${decimal(row.real_profit).div(project.project_value).times(100).toFixed(1)}%`}</td></tr>; }) : <EmptyRow columns={10} />}
      </tbody></ResponsiveTable>
    </Panel>
    <Panel title="Distribuciones generales" meta="Se calculan sobre el resultado actual de todo el portafolio y no cambian con estos filtros.">
      {data.shares.length ? <div className={styles.shares}>{data.shares.map((share) => <article key={share.id}><strong>{share.participant}</strong><span>{shareModeText(share.mode)} · {share.mode === 'percent' ? `${share.value}% del resultado consolidado` : money(share.value)}</span><b>{money(shareAmount(share.mode, share.value, data.portfolioSummary.real_profit))} · {share.is_paid ? 'Pagada' : 'Pendiente'}</b></article>)}</div> : <p className={styles.empty}>No hay distribuciones generales registradas.</p>}
    </Panel>
  </div>;
}

function Operation({ data, filters, clients, setFilter }: ViewProps) { const view = operationAnalysis(data, filters); const people = [...new Set(data.projects.map((project) => project.responsible).filter(Boolean))].sort(); return <><FilterBar><Select label="Cliente" value={filters.client} options={clients} onChange={(value) => setFilter('client', value)} /><Select label="Responsable" value={filters.responsible} options={people.map((value) => ({ value, label: value }))} onChange={(value) => setFilter('responsible', value)} /><Select label="Estado" value={filters.status} options={projectStates.map((value) => ({ value, label: projectStatusText(value) }))} onChange={(value) => setFilter('status', value)} /><Select label="Prioridad" value={filters.priority} options={['low', 'medium', 'high', 'critical'].map((value) => ({ value, label: priorityText(value) }))} onChange={(value) => setFilter('priority', value)} /></FilterBar><div className={styles.grid}><Panel title="Proyectos por estado"><AnalyticsBarChart data={view.byStatus} count label="Proyectos por estado" onSelect={(value) => setFilter('status', value)} /></Panel><Panel title="Activos por responsable" meta="Distribución de proyectos, no horas"><AnalyticsBarChart data={view.byResponsible} count label="Proyectos activos por responsable" onSelect={(value) => setFilter('responsible', value)} /></Panel><Panel title="Cronograma y retrasos"><ResponsiveTable label="Cronograma y retrasos"><thead><tr><th>Proyecto</th><th>Responsable</th><th>Inicio</th><th>Prevista</th><th>Real</th><th>Retraso</th></tr></thead><tbody>{view.projects.length ? view.projects.map((project) => <tr key={project.id}><td>{project.quote_number || project.title}</td><td>{project.responsible}</td><td>{bogotaDateText(project.start_date)}</td><td>{bogotaDateText(project.expected_end_date)}</td><td>{bogotaDateText(project.actual_end_date)}</td><td>{delayDays(project) ? `${delayDays(project)} días` : '—'}</td></tr>) : <EmptyRow columns={6} />}</tbody></ResponsiveTable></Panel></div></> }

function Commercial({ data, filters, clients, setFilter }: ViewProps) { const view = commercialAnalysis(data, filters); return <><FilterBar><Select label="Cliente" value={filters.client} options={clients} onChange={(value) => setFilter('client', value)} /><Select label="Estado" value={filters.status} options={quoteStates.map((value) => ({ value, label: quoteStatusText(value) }))} onChange={(value) => setFilter('status', value)} /><label className={styles.control}><span>Emisión (mes)</span><input type="month" value={filters.month ?? ''} onChange={(event) => setFilter('month', event.target.value)} /></label></FilterBar><div className={styles.metrics}><Metric label="Valor aprobado" value={money(view.approvedValue)} note="Estado actual de cotizaciones emitidas" /><Metric label="Propuestas vigentes" value={String(view.validSent)} note="Enviadas y vigentes" /><Metric label="Vencidas" value={String(view.expired)} note="Estado visible actual" tone="warning" /><Metric label="Aprobación" value={view.approval} note="Aprobadas / decisiones tomadas" /></div><div className={styles.grid}><Panel title="Cotizaciones por estado"><AnalyticsBarChart data={view.byStatus} count label="Cotizaciones por estado" onSelect={(value) => setFilter('status', value)} /></Panel><Panel title="Cotizaciones emitidas por mes"><AnalyticsBarChart data={view.byMonth} label="Valor emitido por mes" onSelect={(value) => setFilter('month', value)} /></Panel><Panel title="Valor cotizado por cliente"><AnalyticsBarChart data={view.byClient} label="Valor cotizado por cliente" onSelect={(value) => setFilter('client', value)} /></Panel></div><Panel title="Detalle de cotizaciones" meta={`${view.quotes.length} registros encontrados`}><ResponsiveTable label="Detalle de cotizaciones"><thead><tr><th>Número</th><th>Cliente</th><th>Emisión</th><th>Estado</th><th>Valor</th></tr></thead><tbody>{view.quotes.length ? view.quotes.map((quote) => <tr key={quote.id}><td>{quote.number}</td><td>{quote.clients?.name ?? 'Sin cliente'}</td><td>{bogotaDateText(quote.issued_on)}</td><td>{quoteStatusText(visibleQuoteStatus(quote))}</td><td>{money(quote.total_amount)}</td></tr>) : <EmptyRow columns={5} />}</tbody></ResponsiveTable></Panel></> }

type ViewProps = { data: AnalyticsData; filters: AnalyticsFilters; clients: { value: string; label: string }[]; setFilter: (field: string, value: string) => void };
function EmptyRow({ columns }: { columns: number }) { return <tr><td colSpan={columns}>Sin registros</td></tr>; }
function fieldLabel(field: string) { return ({ client: 'Cliente', project: 'Proyecto', responsible: 'Responsable', status: 'Estado', priority: 'Prioridad', month: 'Mes' } as Record<string, string>)[field] ?? field; }
function filterLabel(field: string, value: string, data: AnalyticsData) { if (field === 'client') return [...data.projects, ...data.quotes].find((record) => record.client_id === value)?.clients?.name ?? value; if (field === 'project') return data.projects.find((project) => project.id === value)?.quote_number ?? value; if (field === 'status') return projectStates.includes(value) ? projectStatusText(value) : quoteStatusText(value); if (field === 'priority') return priorityText(value); return value; }
