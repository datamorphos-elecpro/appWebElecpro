'use client';

import { useEffect } from 'react';
import styles from './dashboard.module.css';
export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => { console.error('Error al cargar una ruta protegida', error); }, [error]); return <main className={styles.section}><h1>No fue posible cargar esta sección</h1><p>Ocurrió un problema al consultar la información. Intenta nuevamente.</p><button className={styles.button} onClick={() => reset()}>Reintentar</button></main>; }
