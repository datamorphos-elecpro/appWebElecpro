import type { CSSProperties } from 'react';
import { decimal } from '../../lib/calculations';
import { money } from '../../lib/money';
import type { ChartDatum } from '../../lib/chart-data';
import styles from '../../app/(report)/analisis/informe/report.module.css';

/** Flow rows keep long reports printable without a single oversized SVG canvas. */
export function MetricReportChart({ title, data }: { title: string; data: ChartDatum[] }) {
  const min = data.reduce((n, row) => decimal(row.value).lessThan(n) ? decimal(row.value) : n, decimal(0));
  const max = data.reduce((n, row) => decimal(row.value).greaterThan(n) ? decimal(row.value) : n, decimal(0));
  const span = max.minus(min);
  const percent = (value: ReturnType<typeof decimal>) => span.isZero() ? 0 : value.div(span).times(100).toNumber();
  const zero = percent(min.abs());
  const formatted = (row: ChartDatum) => row.unit === 'count' ? row.value : money(row.value);
  const amountWidth = Math.max(1, ...data.map((row) => formatted(row).length));
  return <section className={styles.chart}>
    <h2>{title}</h2>
    {!data.length && <p>No hay datos para los filtros seleccionados.</p>}
    <div style={{ '--report-amount-width': `${amountWidth + 1}ch` } as CSSProperties}>
      {data.map((row) => {
        const value = decimal(row.value);
        const left = value.isNegative() ? zero - percent(value.abs()) : zero;
        return <div className={styles.reportBarRow} key={row.key} role="img" aria-label={`${row.label}: ${formatted(row)}`}>
          <span className={styles.reportBarName}>{row.label}</span>
          <div className={styles.reportBarLine}>
            <div className={styles.reportBarPlot}>
              <i className={styles.reportBarAxis} style={{ left: `${zero}%` }} />
              <span className={styles.reportBar} style={{ left: `${left}%`, width: `${percent(value.abs())}%`, background: row.color ?? 'var(--green-700)' }} />
            </div>
            <span className={styles.reportBarValue}>{formatted(row)}</span>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
