import { AnalyticsBarChart } from './AnalyticsBarChart';
import styles from '../../app/(report)/analisis/informe/report.module.css';

/** One layout for the whole series preserves a common scale across pages. */
export function ManagementReportChart({ title, data, groupSize = 1 }: {
  title: string;
  data: Parameters<typeof AnalyticsBarChart>[0]['data'];
  groupSize?: number;
}) {
  return <section className={styles.chart}><h2>{title}</h2><AnalyticsBarChart data={data} label={title} groupSize={groupSize} /></section>;
}
