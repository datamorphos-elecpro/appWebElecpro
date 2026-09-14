'use client';
import { type ReactNode, useEffect } from 'react';
import styles from './Toast.module.css';
export function Toast({ children, onDismiss, duration = 4500 }: { children: ReactNode; onDismiss?: () => void; duration?: number }) {
 useEffect(()=>{if(!onDismiss)return;const timer=window.setTimeout(onDismiss,duration);return()=>window.clearTimeout(timer);},[duration,onDismiss]);
 return <div className={styles.toast} role="status" aria-live="polite">{children}{onDismiss&&<button type="button" aria-label="Cerrar mensaje" onClick={onDismiss}>×</button>}</div>;
}
