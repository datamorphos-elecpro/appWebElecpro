'use client';
import { type ReactNode, useEffect } from 'react';
import { Icon } from './Icon';
import styles from './Toast.module.css';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
const iconByVariant = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' } as const;

export function Toast({ children, onDismiss, duration = 4500, variant = 'info' }: { children: ReactNode; onDismiss?: () => void; duration?: number; variant?: ToastVariant }) {
 useEffect(()=>{if(!onDismiss)return;const timer=window.setTimeout(onDismiss,duration);return()=>window.clearTimeout(timer);},[duration,onDismiss]);
 const live = variant === 'error' ? 'assertive' : 'polite';
 return <div className={`${styles.toast} ${styles[variant]}`} role={variant === 'error' ? 'alert' : 'status'} aria-live={live}><Icon name={iconByVariant[variant]} /><span>{children}</span>{onDismiss&&<button type="button" aria-label="Cerrar mensaje" onClick={onDismiss}>×</button>}</div>;
}
