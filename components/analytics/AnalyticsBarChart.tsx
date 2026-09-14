'use client';

import { decimal } from '../../lib/calculations';
import { money } from '../../lib/money';
import type { ChartDatum } from '../../lib/analytics-data';
import styles from './AnalyticsWorkspace.module.css';

export function AnalyticsBarChart({ data, label, count = false, onSelect }: { data: ChartDatum[]; label: string; count?: boolean; onSelect?: (key: string) => void }) {
  if (!data.length) return <p className={styles.empty}>No hay datos para los filtros seleccionados.</p>;
  const max = data.reduce((current, datum) => Decimal.max(current, decimal(datum.value).abs()), decimal(1));
  const width = 520;
  const step = width / data.length;
  return <div className={styles.chart}><svg viewBox={`0 0 ${width} 180`} role="img" aria-label={label}>{data.map((datum, index) => {
    const height = Math.max(3, decimal(datum.value).abs().div(max).times(120).toNumber());
    const x = index * step + 8;
    const formatted = count ? String(datum.count ?? 0) : money(datum.value);
    return <g key={datum.key} tabIndex={onSelect ? 0 : undefined} role={onSelect ? 'button' : undefined} aria-label={onSelect ? `Filtrar por ${datum.label}: ${formatted}` : `${datum.label}: ${formatted}`} onClick={() => onSelect?.(datum.key)} onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(datum.key); } }}><rect x={x} y={145 - height} width={Math.max(18, step - 16)} height={height} rx="4" /><text x={x} y={139 - height}>{formatted}</text><text x={x} y="164">{datum.label.slice(0, 12)}</text></g>;
  })}</svg><table className="srOnly"><caption>{label}</caption><tbody>{data.map((datum) => <tr key={datum.key}><th>{datum.label}</th><td>{count ? datum.count : money(datum.value)}</td></tr>)}</tbody></table></div>;
}

const Decimal = { max: (...values: ReturnType<typeof decimal>[]) => values.reduce((maximum, value) => maximum.greaterThan(value) ? maximum : value) };
