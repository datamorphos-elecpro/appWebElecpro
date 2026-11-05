'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { decimal } from '../../lib/calculations';
import { money } from '../../lib/money';
import { quoteStatusText } from '../../lib/presentation';
import type { ClientQuoteDatum } from '../../lib/analytics-queries';
import styles from './ClientQuotesChart.module.css';

const states = ['draft', 'sent', 'approved', 'rejected', 'expired'];
const colors: Record<string, string> = { draft: '#64748b', sent: '#2563eb', approved: '#15803d', rejected: '#b91c1c', expired: '#a16207' };
export function ClientQuotesChart({ data, onSelect }: { data: ClientQuoteDatum[]; onSelect?: (client: string, status?: string) => void }) {
  const max = data.reduce((value, row) => decimal(row.value).greaterThan(value) ? decimal(row.value) : value, decimal(0));
  if (!data.length) return <p>No hay datos para los filtros seleccionados.</p>;
  const amountWidth = Math.max(...data.map((row) => money(row.value).length)) + 1;
  return <div className={styles.chart} style={{ '--amount-width': `${amountWidth}ch` } as CSSProperties} aria-label="Valor de cotizaciones por cliente y estado">
    <ul className={styles.legend} aria-label="Estados de cotización">{states.map((status) => <li key={status}><i style={{ backgroundColor: colors[status] }} />{quoteStatusText(status)}</li>)}</ul>
    {data.map((row) => <ClientBar key={row.key} row={row} max={max.toString()} onSelect={onSelect} />)}
  </div>;
}
function ClientBar({ row, max, onSelect }: { row: ClientQuoteDatum; max: string; onSelect?: (client: string, status?: string) => void }) {
  const plot = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(0);
  useEffect(() => { const node = plot.current; if (!node) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(node); return () => observer.disconnect(); }, []);
  const segments = [...row.segments].sort((a, b) => states.indexOf(a.status) - states.indexOf(b.status));
  const fraction = (value: string) => decimal(max).isZero() ? 0 : decimal(value).div(max).toNumber();
  const fits = (segment: typeof segments[number]) => fraction(segment.value) * width >= String(segment.count).length * 9 + 14;
  const breakdown = segments.some((segment) => !fits(segment));
  return <article className={styles.row} data-client-quote-bar>
    <div className={styles.heading}>{onSelect ? <button type="button" onClick={() => onSelect(row.key)} aria-label={`Filtrar por cliente ${row.label}`}>{row.label}</button> : <strong>{row.label}</strong>}<span>{row.count} cotizaciones</span></div>
    <div className={styles.barLine}><div ref={plot} className={styles.plot}>
      {segments.filter((segment) => decimal(segment.value).greaterThan(0)).map((segment) => {
        const label = `${row.label} · ${quoteStatusText(segment.status)}: ${segment.count} cotizaciones · ${money(segment.value)}`;
        const style = { width: `${fraction(segment.value) * 100}%`, backgroundColor: colors[segment.status] };
        return onSelect ? <button type="button" key={segment.status} className={styles.segment} style={style} aria-label={`Filtrar ${label}`} title={label} onClick={() => onSelect(row.key, segment.status)}>{fits(segment) && <span>{segment.count}</span>}</button>
          : <span key={segment.status} className={styles.segment} style={style} aria-label={label} title={label}>{fits(segment) && <span>{segment.count}</span>}</span>;
      })}
    </div><strong className={styles.amount}>{money(row.value)}</strong></div>
    <ul className={`${styles.breakdown} ${!breakdown ? styles.screenReader : ''}`} aria-label={`Desglose de ${row.label}`}>{segments.map((segment) => <li key={segment.status}>{onSelect ? <button type="button" onClick={() => onSelect(row.key, segment.status)}>{quoteStatusText(segment.status)}: {segment.count} · {money(segment.value)}</button> : <span>{quoteStatusText(segment.status)}: {segment.count} · {money(segment.value)}</span>}</li>)}</ul>
  </article>;
}
