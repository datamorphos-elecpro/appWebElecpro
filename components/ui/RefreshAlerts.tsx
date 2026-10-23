'use client';
import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './Controls';
import styles from './RefreshAlerts.module.css';
import { normalizeConsultedAt } from '../../lib/consulted-at';

export function RefreshAlerts({ consultedAt, compact = false }: { consultedAt?: string | null; compact?: boolean }) {
  const timestamp = normalizeConsultedAt(consultedAt);
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  useEffect(() => { inFlight.current = pending; }, [pending]);
  function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    start(() => router.refresh());
  }
  useEffect(() => {
    // Entry is served by the server query. A departure arms the next refresh.
    let away = false;
    const leave = () => { away = true; };
    const enter = () => {
      if (document.visibilityState !== 'visible' || !away) return;
      away = false;
      if (!inFlight.current) {
        inFlight.current = true;
        start(() => router.refresh());
      }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') leave(); else enter(); };
    window.addEventListener('blur', leave);
    window.addEventListener('focus', enter);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', enter);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [router]);
  return <div className={compact ? styles.compact : undefined} aria-busy={pending}><Button type="button" disabled={pending} onClick={refresh}>{pending ? 'Actualizando…' : 'Actualizar'}</Button><p role="status" aria-live="polite">{pending ? 'Consultando alertas…' : timestamp ? <>Última actualización: <time dateTime={timestamp}>{new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(timestamp))}</time> · Bogotá</> : 'Última actualización: no disponible'}</p></div>;
}
