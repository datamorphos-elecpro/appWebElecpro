import Link from 'next/link';
import { alertKinds } from '../../lib/calculations';
import { dashboardData } from '../../lib/data';
import { bogotaDate, money } from '../../lib/money';
import { bogotaDateText } from '../../lib/presentation';
import { FinancialBar } from '../../components/ui/FinancialBar';
import { Empty, Metric, Page } from '../../components/ui/Page';
import { Panel } from '../../components/ui/Panel';
import { ResponsiveTable } from '../../components/ui/ResponsiveTable';
import { Status } from '../../components/ui/Status';
import styles from './dashboard.module.css';

export default async function Dashboard() {
  const data = await dashboardData();
  const financial = data.financial;
  const active = data.projects.filter((project: any) => ['approved', 'in_progress', 'paused'].includes(project.status));
  const alerts = data.projects.flatMap((project: any) => alertKinds({
    status: project.status, expectedEnd: project.expected_end_date, actualEnd: project.actual_end_date,
    expenses: project.financialSummary.expenses, budget: project.financialSummary.budget,
    value: project.project_value, paid: project.financialSummary.paid,
  }, bogotaDate()).map((kind) => ({ project, kind })));
  const delayed = alerts.filter((alert: any) => alert.kind === 'retraso').length;
  const soon = alerts.filter((alert: any) => alert.kind === 'finalizacion_proxima').length;

  return <Page title="Panel general" description="Visión financiera y operativa de Elecpro" actions={<><Link className={styles.secondary} href="/proyectos/exportar">Exportar Excel</Link><Link className={styles.button} href="/proyectos/nuevo">+ Nuevo proyecto</Link></>}>
    <div className={styles.metrics}>
      <Metric label="Proyectos activos" value={String(active.length)} note={`${data.projects.length} proyectos registrados`} />
      <Metric label="Valor contratado" value={money(financial.contracted)} note="Portafolio completo" />
      <Metric label="Pagos recibidos" value={money(financial.paid)} note="Consolidado de anticipos" />
      <Metric label="Cartera pendiente" value={money(financial.balance)} note="Alertas internas activas" tone={Number(financial.balance) > 0 ? 'warning' : 'success'} />
      <Metric label="Gastos acumulados" value={money(financial.expenses)} note={`Presupuesto: ${money(financial.budget)}`} />
      <Metric label="Ganancia actual" value={money(financial.real_profit)} note="Según modelo de cada proyecto" />
      <Metric label="Proyectos retrasados" value={String(delayed)} note="Requieren seguimiento" tone={delayed ? 'danger' : 'success'} />
      <Metric label="Próximas finalizaciones" value={String(soon)} note="Dentro de los próximos 15 días" />
    </div>
    <div className={styles.dashboardGrid}>
      <Panel title="Proyectos recientes" action={<Link href="/proyectos">Ver todos</Link>}>
        {data.projects.length ? <ResponsiveTable label="Proyectos recientes"><thead><tr><th>Proyecto</th><th>Estado</th><th>Responsable</th><th>Valor</th><th>Pagado</th><th>Ganancia</th></tr></thead><tbody>{data.projects.slice(0, 4).map((project: any) => <tr key={project.id}>
          <td><Link href={`/proyectos/${project.id}`}>{project.title}<small>{project.quote_number} · {project.clients?.name}</small></Link></td>
          <td><Status value={project.status} /></td><td>{project.responsible}</td><td>{money(project.project_value)}</td>
          <td><FinancialBar label="Pagado" value={project.financialSummary.paid} total={project.project_value} /></td><td>{money(project.financialSummary.real_profit)}</td>
        </tr>)}</tbody></ResponsiveTable> : <Empty>No hay proyectos.</Empty>}
      </Panel>
      <div className={styles.side}>
        <Panel title="Alertas prioritarias" action={<Link href="/alertas">Ver {alerts.length}</Link>}>
          {alerts.length ? alerts.slice(0, 3).map((alert: any) => <Link key={alert.project.id + alert.kind} className={styles.alert} href={`/proyectos/${alert.project.id}`}><b>{alert.kind.replace('_', ' ')}</b><span>{alert.project.title} · {alert.kind === 'cartera' ? money(alert.project.financialSummary.balance) : bogotaDateText(alert.project.expected_end_date)}</span></Link>) : <Empty>No hay alertas pendientes.</Empty>}
        </Panel>
        <Panel title="Automatizaciones activas"><p className={styles.note}>● Alertas internas calculadas al consultar</p><p className={styles.note}>○ Resumen semanal: pendiente de implementar</p><p className={styles.note}>● Control presupuestal y estado financiero</p></Panel>
      </div>
    </div>
  </Page>;
}
