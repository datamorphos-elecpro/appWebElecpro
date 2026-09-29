'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { barChartLayout, type BarRow } from '../../lib/bar-chart-layout';
import styles from './SvgBarChart.module.css';

export function HorizontalBarChart({ data, label, onSelect }: { data: BarRow[]; label: string; onSelect?: (key: string) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const probe = useRef<SVGTextElement>(null);
  const hint = useId();
  const [layout, setLayout] = useState(() => barChartLayout(data));
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const container = viewport.current, text = probe.current;
    if (!container || !text) return;
    let frame = 0, disposed = false;
    const update = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = barChartLayout(data, container.clientWidth, (value) => {
          text.textContent = value;
          return text.getComputedTextLength();
        });
        setLayout(next);
        setOverflow(next.width > container.clientWidth + 1);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    void document.fonts.ready.then(update);
    document.fonts.addEventListener('loadingdone', update);
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.fonts.removeEventListener('loadingdone', update); };
  }, [data]);
  const series = [...new Map(data.filter((row) => row.series).map((row) => [row.series!, row.color])).entries()];
  return <div className={styles.chart} data-bar-chart>
    <svg className={styles.probe} aria-hidden="true"><text ref={probe} /></svg>
    {!!series.length && <div className={styles.legend}>{series.map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}</div>}
    <p id={hint} className={styles.hint} hidden={!overflow}>Deslice horizontalmente o use las flechas para ver todos los valores.</p>
    <div ref={viewport} className={styles.viewport} role="region" aria-label={label} aria-describedby={overflow ? hint : undefined} tabIndex={overflow ? 0 : undefined}>
      <div className={styles.canvas} style={{ '--chart-width': `${layout.width}px` } as CSSProperties}>
        {layout.rows.map((row) => <svg key={row.key} className={styles.row} viewBox={`0 0 ${layout.width} ${row.height}`} role={onSelect ? 'group' : 'img'} aria-label={onSelect ? undefined : `${row.label}: ${row.formattedValue}`}>
          <line className={styles.axis} x1={layout.zero} x2={layout.zero} y1="0" y2={row.height} />
          <g tabIndex={onSelect ? 0 : undefined} role={onSelect ? 'button' : undefined} aria-label={`${onSelect ? 'Filtrar por ' : ''}${row.label}: ${row.formattedValue}`} onClick={() => onSelect?.(row.key)} onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(row.key); } }}>
            <title>{`${row.label}: ${row.formattedValue}`}</title>
            <text data-chart-name x="12" y={row.height / 2 - (row.lines.length - 1) * 8 + 4}>{row.lines.map((line, index) => <tspan key={index} x="12" dy={index ? 16 : 0} xmlSpace="preserve">{line}</tspan>)}</text>
            <rect x={row.x} y={row.height / 2 - 9} width={row.barWidth} height="18" rx="3" style={{ fill: row.color }} />
            <text data-chart-value x={row.labelX} y={row.height / 2 + 4} textAnchor={row.negative ? 'end' : 'start'}>{row.formattedValue}</text>
          </g>
        </svg>)}
      </div>
    </div>
    <div className="srOnly"><table><caption>{label}</caption><tbody>{data.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.formattedValue}</td></tr>)}</tbody></table></div>
  </div>;
}
