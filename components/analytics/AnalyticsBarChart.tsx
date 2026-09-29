'use client';

import { decimal } from '../../lib/calculations';
import { money } from '../../lib/money';
import type { ChartDatum, ChartUnit } from '../../lib/chart-data';
import { HorizontalBarChart } from '../ui/HorizontalBarChart';
import styles from './AnalyticsWorkspace.module.css';

const colors = ['var(--green-700)', 'var(--danger)', 'var(--blue)', 'var(--warning)', 'var(--green-900)'];
const formatValue = (value: string | number, unit: ChartUnit = 'money') => {
  if (unit === 'count') return String(decimal(value).toDecimalPlaces(0).toNumber());
  if (unit === 'percent') return `${decimal(value).toDecimalPlaces(1).toFixed(1).replace(/\.0$/, '')}%`;
  return money(value);
};

export function AnalyticsBarChart({ data, label, onSelect }: { data: ChartDatum[]; label: string; onSelect?: (key: string) => void }) {
  if (!data.length) return <p className={styles.empty}>No hay datos para los filtros seleccionados.</p>;
  const series = [...new Set(data.map((row) => row.series).filter(Boolean))];
  return <HorizontalBarChart data={data.map((row) => ({ ...row, formattedValue: formatValue(row.value, row.unit), color: colors[Math.max(0, series.indexOf(row.series)) % colors.length] }))} label={label} onSelect={onSelect ? (key) => onSelect(key.split(':')[0]) : undefined} />;
}
