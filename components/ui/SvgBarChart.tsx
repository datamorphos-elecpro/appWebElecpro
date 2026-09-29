'use client';
import { HorizontalBarChart } from './HorizontalBarChart';
export type SvgBarDatum = { key: string; label: string; value: string; formattedValue?: string };
export function SvgBarChart({ data, label, onSelect }: { data: SvgBarDatum[]; label: string; onSelect?: (key: string) => void }) {
  if (!data.length) return null;
  return <HorizontalBarChart data={data.map((row) => ({ ...row, formattedValue: row.formattedValue ?? row.value }))} label={label} onSelect={onSelect} />;
}
