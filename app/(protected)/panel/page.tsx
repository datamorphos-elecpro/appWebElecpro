import { AlertList } from '../../../components/ui/AlertCard';
import { RefreshAlerts } from '../../../components/ui/RefreshAlerts';
import { financialTone } from '../../../lib/financial-tone';
import Link from 'next/link';
import { metricLinks } from '../../../lib/list-segments';
import { getDashboardSnapshot } from '../../../lib/data';
import { money } from '../../../lib/money';
import { projectCovered } from '../../../lib/calculations';
import { FinancialBar, financialPercentText } from '../../../components/ui/FinancialBar';
import { Empty, Metric, Page } from '../../../components/ui/Page';
import { Panel } from '../../../components/ui/Panel';
import { ResponsiveTable } from '../../../components/ui/ResponsiveTable';
import { Status } from '../../../components/ui/Status';
import styles from './dashboard.module.css';

export default async function Dashboard() {
  const data = await getDashboardSnapshot(); const financial = data.financial;
  return <Page title="Panel general" description="Vision financiera y operativa de Elecpro" actions={<div className={styles.actions}><RefreshAlerts compact consultedAt={data.consulted_at} /><Link className={styles.secondary} href="/proyectos/exportar">Exportar Excel</Link><Link className={styles.button} href="/proyectos/nuevo">+ Nuevo proyecto</Link></div>}>
    <div className={styles.metrics}><Metric label="Proyectos activos" href={metricLinks['Proyectos activos']} value={String(data.active_total)} note={`${data.project_total} proyectos registrados`} /><Metric label="Valor contratado" href={metricLinks['Valor contratado']} value={money(financial.contracted)} note="Portafolio completo" /><Metric label="Pagos recibidos" href={metricLinks['Pagos recibidos']} value={money(financial.paid)} note={`Retenciones: ${money(financial.withheld ?? 0)}`} /><Metric label="Cartera pendiente" href={metricLinks['Cartera pendiente']} value={money(financial.balance)} note="Alertas internas activas" tone={financialTone(financial.balance, 'balance') ?? 'neutral'} /><Metric tone={financialTone(financial.expenses, 'expense', financial.budget) ?? 'neutral'} label="Gastos acumulados" href={metricLinks['Gastos acumulados']} value={money(financial.expenses)} note={`Presupuesto: ${money(financial.budget)}`} /><Metric tone={financialTone(financial.real_profit, 'result') ?? 'neutral'} label="Ganancia actual" href={metricLinks['Ganancia actual']} value={money(financial.real_profit)} note="Segun modelo de cada proyecto" /><Metric label="Proyectos retrasados" href={metricLinks['Proyectos retrasados']} value={String(data.delayed_total)} note="Requieren seguimiento" tone={data.delayed_total ? 'danger' : 'success'} /><Metric label="Próximas finalizaciones" href={metricLinks['Próximas finalizaciones']} value={String(data.soon_total)} note="Dentro de los proximos 15 dias" /></div>
    <div className={styles.dashboardGrid}><Panel title="Proyectos recientes" action={<Link href="/proyectos">Ver todos ({data.project_total})</Link>}>
      {data.recent_projects.length ? <ResponsiveTable label="Proyectos recientes"><thead><tr><th>Proyecto</th><th>Estado</th><th>Responsable</th><th>Valor</th><th>Cubierto</th></tr></thead><tbody>{data.recent_projects.map((project) => <tr key={project.id}><td><Link href={`/proyectos/${project.id}`}>{project.title} - <small>{project.quote_number}</small></Link></td><td><Status value={project.status} /></td><td>{project.responsible}</td><td data-financial="true">{money(project.project_value)}</td><td><FinancialBar label="Cubierto" value={projectCovered(project.paid, project.withheld)} total={project.project_value} valueLabel={`${money(projectCovered(project.paid, project.withheld))} · ${financialPercentText(projectCovered(project.paid, project.withheld), project.project_value)}`} /><small>Anticipos: {money(project.paid)} · Retenciones: {money(project.withheld)}</small></td></tr>)}</tbody></ResponsiveTable> : <Empty>No hay proyectos.</Empty>}
    </Panel><div className={styles.side}><Panel title="Alertas prioritarias" action={<Link href="/alertas">Ver {data.alert_total}</Link>}>
      {data.priority_alerts.length ? <AlertList alerts={data.priority_alerts} /> : <Empty>No hay alertas pendientes.</Empty>}
    </Panel><Panel title="Automatizaciones activas"><p className={styles.note}>Alertas internas calculadas al consultar</p><p className={styles.note}>Resumen semanal: pendiente de implementar</p></Panel></div></div>
  </Page>;
}
