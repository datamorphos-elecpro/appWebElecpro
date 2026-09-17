import Link from 'next/link';
import { getDashboardSnapshot } from '../../../lib/data';
import { money } from '../../../lib/money';
import { bogotaDateText } from '../../../lib/presentation';
import { FinancialBar } from '../../../components/ui/FinancialBar';
import { Empty, Metric, Page } from '../../../components/ui/Page';
import { Panel } from '../../../components/ui/Panel';
import { ResponsiveTable } from '../../../components/ui/ResponsiveTable';
import { Status } from '../../../components/ui/Status';
import styles from './dashboard.module.css';

export default async function Dashboard() {
  const data = await getDashboardSnapshot(); const financial = data.financial;
  return <Page title="Panel general" description="Vision financiera y operativa de Elecpro" actions={<><Link className={styles.secondary} href="/proyectos/exportar">Exportar Excel</Link><Link className={styles.button} href="/proyectos/nuevo">+ Nuevo proyecto</Link></>}>
    <div className={styles.metrics}><Metric label="Proyectos activos" value={String(data.active_total)} note={`${data.project_total} proyectos registrados`} /><Metric label="Valor contratado" value={money(financial.contracted)} note="Portafolio completo" /><Metric label="Pagos recibidos" value={money(financial.paid)} note="Consolidado de anticipos" /><Metric label="Cartera pendiente" value={money(financial.balance)} note="Alertas internas activas" tone={financial.balance !== '0' ? 'warning' : 'success'} /><Metric label="Gastos acumulados" value={money(financial.expenses)} note={`Presupuesto: ${money(financial.budget)}`} /><Metric label="Ganancia actual" value={money(financial.real_profit)} note="Segun modelo de cada proyecto" /><Metric label="Proyectos retrasados" value={String(data.delayed_total)} note="Requieren seguimiento" tone={data.delayed_total ? 'danger' : 'success'} /><Metric label="Proximas finalizaciones" value={String(data.soon_total)} note="Dentro de los proximos 15 dias" /></div>
    <div className={styles.dashboardGrid}><Panel title="Proyectos recientes" action={<Link href="/proyectos">Ver todos ({data.project_total})</Link>}>
      {data.recent_projects.length ? <ResponsiveTable label="Proyectos recientes"><thead><tr><th>Proyecto</th><th>Estado</th><th>Responsable</th><th>Valor</th><th>Pagado</th><th>Ganancia</th></tr></thead><tbody>{data.recent_projects.map((project) => <tr key={project.id}><td><Link href={`/proyectos/${project.id}`}>{project.title}<small>{project.quote_number}</small></Link></td><td><Status value={project.status} /></td><td>{project.responsible}</td><td>{money(project.project_value)}</td><td><FinancialBar label="Pagado" value={project.paid} total={project.project_value} /></td><td>{money(project.real_profit)}</td></tr>)}</tbody></ResponsiveTable> : <Empty>No hay proyectos.</Empty>}
    </Panel><div className={styles.side}><Panel title="Alertas prioritarias" action={<Link href="/alertas">Ver {data.alert_total}</Link>}>
      {data.priority_alerts.length ? data.priority_alerts.map((alert) => <Link key={alert.id} className={styles.alert} href={`/proyectos/${alert.project_id}`}><b>{alert.kind.replace('_', ' ')}</b><span>{alert.title} · {alert.kind === 'cartera' ? money(alert.project_value) : bogotaDateText(alert.expected_end_date)}</span></Link>) : <Empty>No hay alertas pendientes.</Empty>}
    </Panel><Panel title="Automatizaciones activas"><p className={styles.note}>Alertas internas calculadas al consultar</p><p className={styles.note}>Resumen semanal: pendiente de implementar</p></Panel></div></div>
  </Page>;
}
