'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SvgBarChart } from '../ui/SvgBarChart';
import { money } from '../../lib/money';
import { projectStatusText, quoteStatusText } from '../../lib/presentation';
import type { QuoteProjectDashboard, StatusSummary } from '../../lib/data';
import styles from './QuoteProjectDashboard.module.css';

function StatusTable({ rows, project = false }: { rows: StatusSummary[]; project?: boolean }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Estado</th><th>Cantidad</th><th>Valor</th><th>Promedio</th><th>Participación</th></tr></thead><tbody>{rows.map((row) => <tr key={row.status}><th>{project ? projectStatusText(row.status) : quoteStatusText(row.status)}</th><td>{row.count}</td><td>{money(row.total)}</td><td>{money(row.average)}</td><td>{row.share}%</td></tr>)}</tbody></table></div>;
}

export function QuoteProjectDashboard({ data }: { data: QuoteProjectDashboard }) {
  const [mode, setMode] = useState<'count' | 'value'>('count'); const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const filterQuotes = (status: string) => { const params = new URLSearchParams(search.toString()); params.set('status', status); params.delete('page'); router.replace(`${pathname}?${params}`); };
  const quoteData = data.quotes.by_status.map((row) => ({ key: row.status, label: quoteStatusText(row.status), value: mode === 'count' ? String(row.count) : row.total, formattedValue: mode === 'count' ? String(row.count) : money(row.total) }));
  const projectData = data.projects.by_status.map((row) => ({ key: row.status, label: projectStatusText(row.status), value: mode === 'count' ? String(row.count) : row.total, formattedValue: mode === 'count' ? String(row.count) : money(row.total) }));
  return <>
    <div className={styles.switcher} role="group" aria-label="Medida de los gráficos"><button type="button" className={mode === 'count' ? styles.selected : ''} aria-pressed={mode === 'count'} onClick={() => setMode('count')}>Cantidad</button><button type="button" className={mode === 'value' ? styles.selected : ''} aria-pressed={mode === 'value'} onClick={() => setMode('value')}>Valor</button></div>
    <div className={styles.grid}>
      <section className={styles.section}><h2>Cotizaciones por estado</h2><SvgBarChart label={`Cotizaciones por estado, ${mode === 'count' ? 'cantidad' : 'valor'}`} data={quoteData} onSelect={filterQuotes} /><p className={styles.hint}>Seleccione una barra para filtrar la lista de cotizaciones.</p><StatusTable rows={data.quotes.by_status} /></section>
      <section className={styles.section}><h2>Proyectos por estado</h2><SvgBarChart label={`Proyectos por estado, ${mode === 'count' ? 'cantidad' : 'valor'}`} data={projectData} onSelect={(status) => router.push(`/proyectos?status=${encodeURIComponent(status)}`)} /><p className={styles.hint}>Seleccione una barra para abrir el portafolio filtrado.</p><StatusTable rows={data.projects.by_status} project /></section>
    </div>
  </>;
}
