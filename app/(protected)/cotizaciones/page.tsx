import Link from 'next/link';
import { ListFilters } from '../../../components/ui/ListFilters';
import { quoteListOptions, quoteSegments, metricLinks } from '../../../lib/list-segments';
import { redirect } from 'next/navigation';
import { Empty, Metric, Page } from '../../../components/ui/Page';
import { Pagination } from '../../../components/ui/Pagination';
import { FilterBar } from '../../../components/ui/FilterBar';
import { QuoteProjectDashboard } from '../../../components/quotes/QuoteProjectDashboard';
import { getQuotePage, getQuoteProjectDashboard } from '../../../lib/data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';
import { bogotaDateText, compactMoney, quoteStatusText } from '../../../lib/presentation';
import { Status } from '../../../components/ui/Status';
import styles from './quotes.module.css';

const options = quoteListOptions;

export default async function Quotes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const query = parseListQuery(params, options);
  const [result, dashboard] = await Promise.all([getQuotePage({ q: query.search, status: query.filters.status, segment: query.filters.segment, sort: query.sort, direction: query.direction, page: query.page, pageSize: query.pageSize }), getQuoteProjectDashboard()]);
  const canonical = { ...query, page: result.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/cotizaciones', params, canonical, options));
  const quoteMetrics = dashboard.quotes.metrics; const projectMetrics = dashboard.projects.metrics;
  return <Page title="Cotizaciones comerciales" description="Las métricas cubren todas las propuestas; la tabla solo carga la página actual." actions={<Link className={styles.button} href="/cotizaciones/nueva">+ Nueva cotización</Link>}>
    <section className={styles.summary} aria-label="Resumen de cotizaciones"><Metric label="Cotizaciones" href={metricLinks['Cotizaciones']} value={String(quoteMetrics.count)} note={compactMoney(quoteMetrics.quoted_value)} /><Metric label="Valor aprobado" href={metricLinks['Valor aprobado']} value={compactMoney(quoteMetrics.approved_value)} note="Propuestas aprobadas" /><Metric label="Propuestas vigentes" href={metricLinks['Propuestas vigentes']} value={String(quoteMetrics.valid_proposals)} note="Borradores y enviadas" /><Metric label="Tasa de aprobación" href={metricLinks['Tasa de aprobación']} value={quoteMetrics.approval_rate === null ? '—' : `${quoteMetrics.approval_rate}%`} note="Sobre decisiones tomadas" /></section>
    <section className={styles.summary} aria-label="Resumen de proyectos"><Metric label="Proyectos" href={metricLinks['Proyectos']} value={String(projectMetrics.count)} note={compactMoney(projectMetrics.contracted_value)} /><Metric label="Activos" href={metricLinks['Activos']} value={String(projectMetrics.active_count)} note={compactMoney(projectMetrics.active_value)} /><Metric label="Ganancia consolidada" href={metricLinks['Ganancia consolidada']} value={compactMoney(projectMetrics.consolidated_profit)} note="Según gastos registrados" /></section>
    <QuoteProjectDashboard data={dashboard} />
    <section className={styles.list}><div className={styles.listHead}><h2>Listado de cotizaciones</h2></div><ListFilters filters={[
        ...(query.filters.segment ? [{ label: quoteSegments[query.filters.segment as keyof typeof quoteSegments], href: canonicalListHref('/cotizaciones', params, { ...canonical, page: 1, filters: { ...query.filters, segment: '' } }, options) }] : []),
        ...(query.filters.status ? [{ label: quoteStatusText(query.filters.status), href: canonicalListHref('/cotizaciones', params, { ...canonical, page: 1, filters: { ...query.filters, status: '' } }, options) }] : []),
      ]} /><form>{query.filters.segment && <input type="hidden" name="segment" value={query.filters.segment} />}{query.pageSize !== 20 && <input type="hidden" name="pageSize" value={query.pageSize} />}<FilterBar actions={<button className="primary">Aplicar</button>}><label>Buscar<input name="q" defaultValue={query.search} /></label><label>Estado<select name="status" defaultValue={query.filters.status}><option value="">Todos</option>{options.filters.status.slice(1).map((status) => <option value={status} key={status}>{quoteStatusText(status)}</option>)}</select></label><label>Orden<select name="sort" defaultValue={query.sort}><option value="created_at">Fecha de creación</option><option value="number">Número</option><option value="title">Título</option><option value="total_amount">Valor</option></select></label><label>Dirección<select name="direction" defaultValue={query.direction}><option value="desc">Descendente</option><option value="asc">Ascendente</option></select></label></FilterBar></form>
      {result.records.length ? <div className={styles.grid}>{result.records.map((quote) => <article className={styles.card} key={quote.id}><div className={styles.cardHead}><div><div className={styles.code}>{quote.number}</div><h3>{quote.title}</h3></div><Status value={quote.visible_status} domain="quote" /></div><p className={styles.client}>{quote.client_name} · Emisión: {bogotaDateText(quote.issued_on)}</p><div className={styles.meta}><div><span>Valor total</span><strong>{compactMoney(quote.total_amount)}</strong></div><div><span>Vigencia</span><strong>{bogotaDateText(quote.valid_until)}</strong></div><div><span>Ítems</span><strong>{quote.item_count}</strong></div><div><span>Contacto</span><strong>{quote.client_contact || 'Sin registrar'}</strong></div></div><Link className={styles.secondary} href={`/cotizaciones/${quote.id}`}>{quote.project_id ? 'Abrir proyecto vinculado →' : 'Abrir cotización →'}</Link></article>)}</div> : <Empty>No hay cotizaciones con estos filtros.</Empty>}
      <Pagination page={result.page} />
    </section>
  </Page>;
}
