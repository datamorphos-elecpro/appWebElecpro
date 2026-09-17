'use client';

import { decimal } from '../../lib/calculations';
import styles from './SvgBarChart.module.css';

export type SvgBarDatum = { key: string; label: string; value: string; formattedValue?: string };

/** SVG values stay Decimal until they become geometry attributes. */
export function SvgBarChart({ data, label, onSelect }: { data: SvgBarDatum[]; label: string; onSelect?: (key: string) => void }) {
  if (!data.length) return null;
  const width = 760; const labelWidth = 205; const plotWidth = width - labelWidth - 50; const zeroX = labelWidth + plotWidth / 2; const rowHeight = 34; const height = Math.max(84, data.length * rowHeight + 38);
  const max = data.reduce((current, item) => decimal(item.value).abs().greaterThan(current) ? decimal(item.value).abs() : current, decimal(0)); const scale = max.isZero() ? decimal(1) : max;
  return <div className={styles.chart}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}><line className={styles.axis} x1={zeroX} x2={zeroX} y1="16" y2={height - 18} />{data.map((item, index) => { const amount = decimal(item.value); const barWidth = amount.abs().div(scale).times(plotWidth).div(2); const negative = amount.isNegative(); const x = negative ? decimal(zeroX).minus(barWidth) : decimal(zeroX); const y = 30 + index * rowHeight; const shown = item.formattedValue ?? item.value; return <g key={item.key} tabIndex={onSelect ? 0 : undefined} role={onSelect ? 'button' : undefined} aria-label={`${item.label}: ${shown}`} onClick={() => onSelect?.(item.key)} onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(item.key); } }}><title>{`${item.label}: ${shown}`}</title><text x="0" y={y + 12}>{item.label}</text><rect x={x.toString()} y={y} width={barWidth.toString()} height="18" rx="3" /><text x={(negative ? x.minus(7) : x.plus(barWidth).plus(7)).toString()} y={y + 13} textAnchor={negative ? 'end' : 'start'}>{shown}</text></g>; })}</svg><table className="srOnly"><caption>{label}</caption><tbody>{data.map((item) => <tr key={item.key}><th>{item.label}</th><td>{item.formattedValue ?? item.value}</td></tr>)}</tbody></table></div>;
}
