import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Controls.module.css';

export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button {...props} className={`${styles.button} ${styles[variant]} ${className}`}>{children}</button>;
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`${styles.field} ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <small role="alert" className={styles.error}>{error}</small>}</label>;
}
