import Link from 'next/link';
import { PrintFinanceButton } from '../../../components/finance/PrintFinanceButton';
import { Empty, Metric, Page } from '../../../components/ui/Page';
import { getFinanceData } from '../../../lib/data';
import { money } from '../../../lib/money';
import styles from '../dashboard.module.css';

export default async function Finance() {
  const { summary, projects, shares } = await getFinanceData();
  return <div className="finance-print-root"><Page title="Finanzas" description="Consolidado completo de valor contratado, cobros, gastos, presupuesto y ganancia." actions={<PrintFinanceButton className={styles.secondary} />}>
    <div className={styles.metrics}>
      <Metric label="Valor contratado" value={money(summary.contracted)} />
      <Metric label="Cobros recibidos" value={money(summary.paid)} />
      <Metric label="Cartera pendiente" value={money(summary.balance)} />
      <Metric label="Gastos reales" value={money(summary.expenses)} />
      <Metric label="Presupuesto" value={money(summary.budget)} />
      <Metric label="Ganancia actual" value={money(summary.real_profit)} />
      <Metric label="Ganancia proyectada" value={money(summary.projected_profit)} />
    </div>
    <section className={styles.section}><h2>Resultado por proyecto</h2>
      {projects.length ? <div className={styles.cards}>{projects.map((project: any) => {
        const row = project.financialSummary;
        return <article className={styles.card} key={project.id}><strong><Link href={`/proyectos/${project.id}`}>{project.title}</Link></strong><small>{project.quote_number ?? 'Sin consecutivo'} · Cobrado {money(row.paid)} · Saldo {money(row.balance)}</small><small>Gastos {money(row.expenses)} · Presupuesto {money(row.budget)}</small><b>Ganancia {money(row.real_profit)} · Proyectada {money(row.projected_profit)}</b></article>;
      })}</div> : <Empty>Aún no hay proyectos.</Empty>}
    </section>
    <section className={styles.section}><h2>Distribuciones generales</h2>
      {shares.length ? <div className={styles.cards}>{shares.map((share: any) => <article className={styles.card} key={share.id}><strong>{share.participant}</strong><small>{share.mode === 'percent' ? `${share.value}% de la ganancia consolidada` : money(share.value)}</small><b>{share.is_paid ? 'Pagada' : 'Pendiente'}</b></article>)}</div> : <Empty>No hay distribuciones generales registradas.</Empty>}
    </section>
  </Page></div>;
}
