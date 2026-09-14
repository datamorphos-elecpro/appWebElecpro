import Link from 'next/link';
import { financialPercent } from '../../../components/ui/FinancialBar';
import { Empty, Page } from '../../../components/ui/Page';
import { Status } from '../../../components/ui/Status';
import { getProjectsWithFinancialSummary, type ProjectRecord } from '../../../lib/data';
import { bogotaDate } from '../../../lib/money';
import { bogotaDateText, compactMoney, priorityText } from '../../../lib/presentation';
import styles from './projects.module.css';

export default async function Projects() {
  const projects = await getProjectsWithFinancialSummary('proyectos');
  return <Page title="Portafolio de proyectos" description="Desde la cotización hasta el cierre y pago total." actions={<div className={styles.actions}><Link className={styles.secondary} href="/proyectos/exportar">Exportar Excel</Link><Link className={styles.primary} href="/proyectos/nuevo">+ Nuevo proyecto</Link></div>}>
    {projects.length ? <div className={styles.grid}>{projects.map((project) => {
      const financial = project.financialSummary;
      const paidPercent = financialPercent(financial.paid, project.project_value);
      const delay = delayDays(project);
      return <article className={styles.card} key={project.id}>
        <div className={styles.head}><div><h2>{project.title}</h2><div className={styles.code}>{project.quote_number} · {project.clients?.name ?? 'Sin cliente'}</div></div><Status value={project.status} /></div>
        <div className={styles.meta}>
          <div><span>Valor</span><strong>{compactMoney(project.project_value)}</strong></div>
          <div><span>Pagado</span><strong>{compactMoney(financial.paid)}</strong></div>
          <div><span>Ganancia</span><strong>{compactMoney(financial.real_profit)}</strong></div>
          <div><span>Responsable</span><strong>{project.responsible}</strong></div>
          <div><span>Finalización</span><strong>{bogotaDateText(project.expected_end_date)}</strong></div>
          <div><span>Prioridad</span><strong>{priorityText(project.priority)}</strong></div>
        </div>
        <div className={styles.track} role="img" aria-label={paidPercent === null ? 'Porcentaje pagado no calculable' : `${paidPercent}% pagado`}><span style={{ width: `${paidPercent ?? 0}%` }} /></div>
        <div className={styles.foot}><span className={delay ? styles.danger : undefined}>{delay ? `Retraso de ${delay} día(s)` : paidPercent === null ? 'No calculable' : `${paidPercent}% pagado`}</span><Link href={`/proyectos/${project.id}`}>Ver proyecto →</Link></div>
      </article>;
    })}</div> : <Empty>Aún no hay proyectos. Cree uno o apruebe y convierta una cotización para iniciar.</Empty>}
  </Page>;
}

function delayDays(project: ProjectRecord) {
  if (['draft', 'quoted', 'cancelled'].includes(project.status)) return 0;
  const comparison = project.status === 'finished' ? project.actual_end_date : bogotaDate();
  if (!comparison || comparison <= project.expected_end_date) return 0;
  const expected = new Date(`${project.expected_end_date}T12:00:00-05:00`).getTime();
  const actual = new Date(`${comparison}T12:00:00-05:00`).getTime();
  return Math.max(0, Math.round((actual - expected) / 86_400_000));
}
