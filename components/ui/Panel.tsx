import { type ReactNode } from 'react';
import styles from './Panel.module.css';
export function Panel({ title, meta, action, children }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) { return <section className={styles.panel}><header className={styles.head}><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</header><div className={styles.body}>{children}</div></section>; }
