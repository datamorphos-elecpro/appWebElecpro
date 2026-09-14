import Link from 'next/link';
import { Page, Empty } from '../../../components/ui/Page';
import { getAlertsData } from '../../../lib/data';
import { alertKinds } from '../../../lib/calculations';
import { bogotaDate } from '../../../lib/money';
import styles from '../dashboard.module.css';
const labels: Record<string, string> = { retraso: 'Retraso frente a la fecha prevista', sobrecosto: 'Gastos superiores al presupuesto', cartera: 'Saldo pendiente por cobrar', finalizacion_proxima: 'Finalización próxima' };
export default async function Alerts() { const { projects } = await getAlertsData(); const rows = projects.flatMap((project: any) => alertKinds({ status: project.status, expectedEnd: project.expected_end_date, actualEnd: project.actual_end_date, expenses: project.financialSummary.expenses, budget: project.financialSummary.budget, value: project.project_value, paid: project.financialSummary.paid }, bogotaDate()).map((kind) => ({ kind, project }))); return <Page title="Alertas" description="Alertas internas calculadas al consultar; no se envían correos automáticos.">{rows.length ? <div className={styles.cards}>{rows.map((alert, index) => <Link href={`/proyectos/${alert.project.id}`} className={styles.card} key={`${alert.project.id}-${index}`}><span>{alert.kind.replace('_', ' ')}</span><strong>{alert.project.title}</strong><small>{labels[alert.kind]}</small></Link>)}</div> : <Empty>No hay alertas activas hoy.</Empty>}<p className={styles.note}>Trabajo futuro: recordatorios externos y resumen semanal, sin tareas programadas en esta versión.</p></Page>; }
