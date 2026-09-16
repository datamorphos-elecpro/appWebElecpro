'use client';

import { decimal } from '../../lib/calculations';
import { money } from '../../lib/money';
import type { ChartDatum, ChartUnit } from '../../lib/analytics-data';
import styles from './AnalyticsWorkspace.module.css';

const colors = ['var(--green-700)', 'var(--danger)', 'var(--blue)', 'var(--warning)', 'var(--green-900)'];
const formatValue = (value: string | number, unit: ChartUnit = 'money') => {
  if (unit === 'count') return String(decimal(value).toDecimalPlaces(0).toNumber());
  if (unit === 'percent') return `${decimal(value).toDecimalPlaces(1).toFixed(1).replace(/\.0$/, '')}%`;
  return money(value);
};

export function AnalyticsBarChart({ data, label, count = false, onSelect }: { data: ChartDatum[]; label: string; count?: boolean; onSelect?: (key: string) => void }) {
  if (!data.length) return <p className={styles.empty}>No hay datos para los filtros seleccionados.</p>;
  const rows = data.map((datum) => {
    const unit = count ? 'count' as const : datum.unit ?? 'money';
    const rawValue = unit === 'count' ? String(datum.count ?? 0) : datum.value;
    return { ...datum, unit, rawValue, amount: decimal(rawValue) };
  });
  const maxAbs = rows.reduce((current, datum) => Decimal.max(current, datum.amount.abs()), decimal(0));
  const scale = maxAbs.isZero() ? decimal(1) : maxAbs;
  const width = 760;
  const labelWidth = 205;
  const plotWidth = width - labelWidth - 50;
  const zeroX = labelWidth + plotWidth / 2;
  const rowHeight = 34;
  const height = Math.max(84, rows.length * rowHeight + 38);
  const series = [...new Set(rows.map((row) => row.series).filter(Boolean))] as string[];
  return <div className={styles.chart}>
    {!!series.length && <div className={styles.legend}>{series.map((item, index) => <span key={item}><i style={{ background: colors[index % colors.length] }} />{item}</span>)}</div>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Eje monetario en COP cuando aplica.`}>
      <line x1={zeroX} x2={zeroX} y1="16" y2={height - 18} className={styles.axis} />
      <text x={zeroX + 6} y="12" className={styles.axisLabel}>0</text>
      {rows.map((datum, index) => {
        const y = 30 + index * rowHeight;
        const barWidth = datum.amount.abs().div(scale).times(plotWidth / 2).toNumber();
        const negative = datum.amount.isNegative();
        const x = negative ? zeroX - barWidth : zeroX;
        const formatted = formatValue(datum.rawValue, datum.unit);
        const seriesIndex = Math.max(0, series.indexOf(datum.series ?? ''));
        return <g key={datum.key} tabIndex={onSelect ? 0 : undefined} role={onSelect ? 'button' : undefined} aria-label={onSelect ? `Filtrar por ${datum.label}: ${formatted}` : `${datum.label}: ${formatted}`} onClick={() => onSelect?.(datum.key.split(':')[0])} onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(datum.key.split(':')[0]); } }}>
          <title>{`${datum.label}: ${formatted}`}</title>
          <text x="0" y={y + 12}>{datum.label}</text>
          <rect x={x} y={y} width={barWidth} height="18" rx="3" style={{ fill: colors[seriesIndex % colors.length] }} />
          <text x={negative ? x - 7 : x + barWidth + 7} y={y + 13} textAnchor={negative ? 'end' : 'start'}>{formatted}</text>
        </g>;
      })}
    </svg>
    <table className="srOnly"><caption>{label}</caption><tbody>{rows.map((datum) => <tr key={datum.key}><th>{datum.label}</th><td>{formatValue(datum.rawValue, datum.unit)}</td></tr>)}</tbody></table>
  </div>;
}

const Decimal = { max: (...values: ReturnType<typeof decimal>[]) => values.reduce((maximum, value) => maximum.greaterThan(value) ? maximum : value) };
