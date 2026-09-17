import { type ReactNode } from 'react';
import styles from './FilterBar.module.css';

export function FilterBar({ children, actions, tags }: { children: ReactNode; actions?: ReactNode; tags?: ReactNode }) {
  return <><div className={styles.bar}><div className={styles.fields}>{children}</div>{actions && <div className={styles.actions}>{actions}</div>}</div>{tags && <div className={styles.tags}>{tags}</div>}</>;
}
export function FilterTag({ children }: { children: ReactNode }) { return <span className={styles.tag}>{children}</span>; }
