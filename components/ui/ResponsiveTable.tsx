import { type ReactNode } from 'react';
import styles from './ResponsiveTable.module.css';
export function ResponsiveTable({ children, label }: { children: ReactNode; label?: string }) { return <div className={styles.wrap}><table aria-label={label}>{children}</table></div>; }
