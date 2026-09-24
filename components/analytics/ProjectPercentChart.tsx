'use client';

import { useState } from 'react';
import { decimal } from '../../lib/calculations';
import { createPercentChartScale } from '../../lib/percent-chart-scale';
import type { BudgetExecutionDatum, ProfitMarginDatum } from '../../lib/analytics-queries';
import styles from './AnalyticsWorkspace.module.css';

type Item = BudgetExecutionDatum | ProfitMarginDatum;
type ChartRow = { key: string; label: string; values: string[]; overBudget: boolean };

const percent = (value: string) => `${decimal(value).toDecimalPlaces(1).toFixed(1)}%`;
const barStyle = (position: { left: number; width: number }) => ({ left: `${position.left}%`, width: `${position.width}%` });

export function ProjectPercentChart({ data, kind, label, onSelect, paginate = false }: { data: Item[]; kind: 'execution' | 'margin'; label: string; onSelect?: (key: string) => void; paginate?: boolean }) {
  const [requestedPage, setPage] = useState(1);
  if (!data.length) return <p className={styles.empty}>No hay proyectos calculables para los filtros seleccionados.</p>;

  const allRows: ChartRow[] = data.map((item) => kind === 'execution'
    ? { key: item.key, label: item.label, values: [(item as BudgetExecutionDatum).value], overBudget: (item as BudgetExecutionDatum).overBudget }
    : { key: item.key, label: item.label, values: [(item as ProfitMarginDatum).current, (item as ProfitMarginDatum).projected], overBudget: false });
  const scale = createPercentChartScale(allRows.flatMap((row) => row.values), kind);
  const pageCount = Math.max(1, Math.ceil(allRows.length / 5));
  const page = Math.min(requestedPage, pageCount);
  const rows = paginate ? allRows.slice((page - 1) * 5, page * 5) : allRows;
  const headings = kind === 'margin' ? ['A la fecha', 'Proyectado'] : ['Ejecución'];

  return <div className={styles.percentChart} data-testid={`project-percent-chart-${kind}`}>
    <div className={styles.percentRows}>
      {rows.map((row) => <ProjectRow key={row.key} row={row} kind={kind} headings={headings} scale={scale} onSelect={onSelect} />)}
    </div>
    {paginate && pageCount > 1 && <nav className={styles.chartPagination} aria-label={`Páginas de ${label}`}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {pageCount} · {allRows.length} proyectos</span><button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Siguiente</button></nav>}
    <table className="srOnly"><caption>{label}</caption><thead><tr><th scope="col">Proyecto</th>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={headings[index]}>{percent(value)}</td>)}</tr>)}</tbody></table>
  </div>;
}

function ProjectRow({ row, kind, headings, scale, onSelect }: { row: ChartRow; kind: 'execution' | 'margin'; headings: string[]; scale: ReturnType<typeof createPercentChartScale>; onSelect?: (key: string) => void }) {
  const content = <><span className={styles.percentProjectLabel}>{row.label}</span><span className={styles.percentSeriesList}>{row.values.map((value, index) => {
    const position = scale.bar(value);
    const className = kind === 'execution' ? (row.overBudget ? styles.percentOverBudget : styles.percentExecution) : (index === 0 ? styles.percentMarginCurrent : styles.percentMarginProjected);
    return <span className={styles.percentSeries} key={headings[index]}><span className={styles.percentSeriesLabel}>{headings[index]}</span><span className={styles.percentTrack} aria-hidden="true"><span className={styles.percentZero} style={{ left: `${scale.zero}%` }} />{scale.reference !== null && <span className={styles.percentReference} style={{ left: `${scale.reference}%` }} />}<span className={`${styles.percentBar} ${className}`} style={barStyle(position)} /></span><output className={styles.percentValue}>{percent(value)}</output></span>;
  })}</span></>;
  const accessibleValues = row.values.map((value, index) => `${headings[index]} ${percent(value)}`).join(', ');

  if (!onSelect) return <article className={styles.percentItem}>{content}</article>;
  return <button type="button" className={styles.percentItem} onClick={() => onSelect(row.key)} aria-label={`Filtrar por ${row.label}: ${accessibleValues}`}>{content}</button>;
}
