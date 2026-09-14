import Link from 'next/link';
import { Empty, Metric, Page } from '../../../components/ui/Page';
import { Panel } from '../../../components/ui/Panel';
import { Status } from '../../../components/ui/Status';
import { decimal } from '../../../lib/calculations';
import { getQuotesWithPresentationData, getRows } from '../../../lib/data';
import { bogotaDateText, compactMoney, quoteDisplayStatus, quoteStatusText } from '../../../lib/presentation';
import { money } from '../../../lib/money';
import styles from './quotes.module.css';

const quoteStates = ['draft', 'sent', 'approved', 'rejected', 'expired'];
const projectStates = ['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'];

export default async function Quotes() {
  const [quotes, projects] = await Promise.all([
    getQuotesWithPresentationData('cotizaciones'),
    getRows('projects', 'status,project_value') as Promise<Array<{ status: string; project_value: string }>>,
  ]);
  const quoteTotal = quotes.reduce((total, quote) => total.plus(decimal(quote.total_amount)), decimal(0));
  const projectTotal = projects.reduce((total, project) => total.plus(decimal(project.project_value)), decimal(0));

  return <Page title="Cotizaciones comerciales" description="Crea la propuesta una sola vez; los cálculos y el documento se actualizan automáticamente." actions={<Link className={styles.button} href="/cotizaciones/nueva">+ Nueva cotización</Link>}>
    <div className={styles.panel}><Panel title="Cotizaciones" meta="Valores con incremento, AIU e IVA">
      <div className={styles.metrics}>{quoteStates.map((status) => {
        const records = quotes.filter((quote) => quoteDisplayStatus(quote) === status);
        const total = records.reduce((sum, quote) => sum.plus(decimal(quote.total_amount)), decimal(0));
        return <Metric key={status} label={quoteStatusText(status)} value={String(records.length)} note={compactMoney(total)} />;
      })}</div>
      <strong className={styles.total}>Total cotizaciones: {money(quoteTotal)}</strong>
    </Panel></div>

    <div className={styles.panel}><Panel title="Proyectos" meta="Valor registrado del proyecto">
      <div className={styles.metrics}>{projectStates.map((status) => {
        const records = projects.filter((project) => project.status === status);
        const total = records.reduce((sum, project) => sum.plus(decimal(project.project_value)), decimal(0));
        const labels: Record<string, string> = { draft: 'Borrador', quoted: 'Cotizado', approved: 'Aprobado', in_progress: 'En proceso', paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado' };
        return <Metric key={status} label={labels[status]} value={String(records.length)} note={compactMoney(total)} />;
      })}</div>
      <strong className={styles.total}>Total proyectos: {money(projectTotal)}</strong>
    </Panel></div>

    {quotes.length ? <div className={styles.grid}>{quotes.map((quote) => {
      const visibleStatus = quoteDisplayStatus(quote);
      return <article className={styles.card} key={quote.id}>
        <div className={styles.cardHead}><div><div className={styles.code}>{quote.number}</div><h2>{quote.title}</h2></div><Status value={visibleStatus} domain="quote" /></div>
        <p className={styles.client}>{quote.clients?.name ?? 'Cliente sin asignar'} · {bogotaDateText(quote.issued_on)}</p>
        <div className={styles.meta}>
          <div><span>Valor total</span><strong>{compactMoney(quote.total_amount)}</strong></div>
          <div><span>Vigencia</span><strong>{bogotaDateText(quote.valid_until)}</strong></div>
          <div><span>Materiales / ítems</span><strong>{quote.quote_items.length}</strong></div>
          <div><span>Contacto</span><strong>{quote.clients?.contact_name || 'Sin registrar'}</strong></div>
        </div>
        <Link className={styles.secondary} href={`/cotizaciones/${quote.id}`}>Abrir cotización →</Link>
      </article>;
    })}</div> : <Empty>Aún no hay cotizaciones.</Empty>}
  </Page>;
}
