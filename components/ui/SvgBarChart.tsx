'use client';
import styles from './SvgBarChart.module.css';
export type SvgBarDatum = { key: string; label: string; value: number; formattedValue?: string };
export function SvgBarChart({ data, label, onSelect }: { data: SvgBarDatum[]; label: string; onSelect?: (key: string) => void }) {
  if (!data.length) return null;
  const width = 760;
  const labelWidth = 205;
  const plotWidth = width - labelWidth - 50;
  const zeroX = labelWidth + plotWidth / 2;
  const rowHeight = 34;
  const height = Math.max(84, data.length * rowHeight + 38);
  const max = Math.max(...data.map((item) => Math.abs(item.value)), 0) || 1;
  return <div className={styles.chart}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}><line className={styles.axis} x1={zeroX} x2={zeroX} y1="16" y2={height - 18} />{data.map((item,index)=>{const barWidth=Math.abs(item.value)/max*(plotWidth/2);const negative=item.value<0;const x=negative?zeroX-barWidth:zeroX;const y=30+index*rowHeight;return <g key={item.key} tabIndex={onSelect?0:undefined} role={onSelect?'button':undefined} aria-label={`${item.label}: ${item.formattedValue ?? item.value}`} onClick={()=>onSelect?.(item.key)} onKeyDown={(event)=>{if(onSelect&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onSelect(item.key);}}}><title>{`${item.label}: ${item.formattedValue ?? item.value}`}</title><text x="0" y={y+12}>{item.label}</text><rect x={x} y={y} width={barWidth} height="18" rx="3" /><text x={negative?x-7:x+barWidth+7} y={y+13} textAnchor={negative?'end':'start'}>{item.formattedValue ?? item.value}</text></g>;})}</svg><table className="srOnly"><caption>{label}</caption><tbody>{data.map((item)=><tr key={item.key}><th>{item.label}</th><td>{item.formattedValue ?? item.value}</td></tr>)}</tbody></table></div>;
}
