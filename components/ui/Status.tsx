import { presentationLabel } from '../../lib/presentation';
import styles from './Status.module.css';

export function Status({ value, label, domain = 'project' }: { value: string; label?: string; domain?: 'project' | 'quote' | 'priority' }) {
  const tone = ['paused', 'sent', 'expired', 'medium', 'high'].includes(value) ? 'warning' : ['cancelled', 'rejected', 'critical'].includes(value) ? 'danger' : ['finished'].includes(value) ? 'info' : ['draft', 'quoted', 'low'].includes(value) ? 'muted' : 'success';
  return <span className={`${styles.status} ${styles[tone]}`}>{label ?? presentationLabel(value, domain)}</span>;
}
