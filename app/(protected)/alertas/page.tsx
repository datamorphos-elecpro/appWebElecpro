import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Empty, Page } from '../../../components/ui/Page';
import { Pagination } from '../../../components/ui/Pagination';
import { FilterBar } from '../../../components/ui/FilterBar';
import { getAlertsPage } from '../../../lib/data';
import { canonicalListHref, hasCanonicalListQuery, parseListQuery } from '../../../lib/pagination';
import styles from '../dashboard.module.css';

const labels: Record<string, string> = { retraso: 'Retraso frente a la fecha prevista', sobrecosto: 'Gastos superiores al presupuesto', cartera: 'Saldo pendiente por cobrar', finalizacion_proxima: 'Finalizacion proxima' };
export default async function Alerts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const options = { sort: ['priority'] as const, defaultSort: 'priority' as const, filters: { kind: ['', 'retraso', 'sobrecosto', 'cartera', 'finalizacion_proxima'] as const } };
  const query = parseListQuery(params, options); const result = await getAlertsPage({ q: query.search, kind: query.filters.kind, page: query.page, pageSize: query.pageSize }); const canonical = { ...query, page: result.page.page };
  if (!hasCanonicalListQuery(params, canonical, options)) redirect(canonicalListHref('/alertas', params, canonical, options));
  return <Page title="Alertas" description="Alertas internas calculadas al consultar; no se envian correos automaticos."><form>{query.pageSize !== 20 && <input type="hidden" name="pageSize" value={query.pageSize} />}<FilterBar actions={<button className="primary">Aplicar</button>}><label>Buscar<input name="q" defaultValue={query.search} /></label><label>Tipo<select name="kind" defaultValue={query.filters.kind}><option value="">Todas</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></FilterBar></form>{result.records.length ? <div className={styles.cards}>{result.records.map((alert) => <Link href={`/proyectos/${alert.project_id}`} className={styles.card} key={alert.id}><span>{alert.kind.replace('_', ' ')}</span><strong>{alert.title}</strong><small>{labels[alert.kind]}</small></Link>)}</div> : <Empty>No hay alertas activas con estos filtros.</Empty>}<Pagination page={result.page} /></Page>;
}
