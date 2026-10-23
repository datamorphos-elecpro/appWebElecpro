import Link from 'next/link';
import type { AlertRecord } from '../../lib/data';
import { decimal, projectCovered } from '../../lib/calculations';
import { money } from '../../lib/money';
import { bogotaDateText, projectStatusText } from '../../lib/presentation';
import styles from './AlertCard.module.css';

export function AlertList({ alerts }: { alerts: AlertRecord[] }) {
  return <div className={styles.list}>{alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}</div>;
}

export function AlertCard({ alert: a }: { alert: AlertRecord }) {
  const days = Math.round((Date.parse(a.expected_end_date) - Date.parse(a.consulted_on)) / 86400000);
  const labels = { cartera: 'Cartera pendiente', sobrecosto: 'Sobrecosto', retraso: 'Retraso', finalizacion_proxima: 'Finalización próxima' };
  return <Link href={`/proyectos/${a.project_id}`} className={`${styles.card} ${styles[a.kind]}`}>
    <strong>{labels[a.kind]}</strong><span>{a.quote_number} · {a.client_name}</span>
    <span>{a.title} · {projectStatusText(a.status)}</span>
    {a.kind === 'cartera' ? <dl><dt>Valor contratado</dt><dd>{money(a.project_value)}</dd><dt>Anticipos</dt><dd>{money(a.paid)}</dd><dt>Retenciones vigentes</dt><dd>{money(a.withheld)}</dd><dt>Total cubierto</dt><dd>{money(projectCovered(a.paid, a.withheld))}</dd><dt>Saldo pendiente</dt><dd>{money(a.balance)}</dd></dl>
      : a.kind === 'sobrecosto' ? <dl><dt>Presupuesto</dt><dd>{money(a.budget)}</dd><dt>Gastos</dt><dd>{money(a.expenses)}</dd><dt>Exceso</dt><dd>{money(decimal(a.expenses).minus(a.budget))} ({decimal(a.expenses).minus(a.budget).div(a.budget).times(100).toFixed(1)} %)</dd></dl>
        : <p>Fecha prevista: {bogotaDateText(a.expected_end_date)} · {days < 0 ? `${-days} ${days === -1 ? 'día' : 'días'} de retraso` : `${days} ${days === 1 ? 'día restante' : 'días restantes'}`}</p>}
  </Link>;
}
