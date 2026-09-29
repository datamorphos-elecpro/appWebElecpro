import { type ReactNode } from 'react';
import styles from './ResponsiveTable.module.css';
export function ResponsiveTable({ children, label }: { children: ReactNode; label?: string }) { return <div className={styles.wrap} role="region" aria-label={label ?? "Tabla desplazable"} tabIndex={0}><table aria-label={label}>{children}</table></div>; }
