import { type ReactNode } from 'react';
import styles from './FilterBar.module.css';

export function FilterBar({ children, tags }: { children: ReactNode; tags?: ReactNode }) { return <><div className={styles.bar}>{children}</div>{tags && <div className={styles.tags}>{tags}</div>}</>; }
export function FilterTag({ children }: { children: ReactNode }) { return <span className={styles.tag}>{children}</span>; }
