import styles from './Page.module.css';

export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <><header className={styles.header}><div><h1>{title}</h1>{description && <p className={styles.description}>{description}</p>}</div>{actions && <div className={styles.actions}>{actions}</div>}</header>{children}</>;
}
export function Metric({ label, value, detail, note, tone = 'success' }: { label: string; value: string; detail?: string; note?: string; tone?: 'success' | 'warning' | 'danger' }) {
  return <section className={styles.metric}><div className={styles.label}><span>{label}</span><i className={styles[tone]} aria-hidden="true" /></div><strong>{value}</strong>{(note ?? detail) && <span className={styles.note}>{note ?? detail}</span>}</section>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <section className={styles.empty}>{children}</section>; }
