import { decimal } from './calculations';

export type BarRow = { key: string; label: string; value: string; formattedValue: string; color?: string; series?: string };
export type MeasureText = (text: string) => number;

/** Preserve every character, including names without spaces. */
export function wrapChartLabel(text: string, width: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (measure(line + word) <= width) { line += word; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of word) {
      if (line && measure(line + character) > width) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export function barChartLayout(data: BarRow[], available = 760, measure: MeasureText = (text) => Array.from(text).length * 8) {
  const margin = 12, gap = 10, nameWidth = 200;
  let negative = decimal(0), positive = decimal(0), leftLabel = 0, rightLabel = 0;
  for (const row of data) {
    const value = decimal(row.value);
    const labelWidth = Math.ceil(measure(row.formattedValue));
    if (value.lessThan(0)) {
      negative = negative.greaterThan(value.abs()) ? negative : value.abs();
      leftLabel = Math.max(leftLabel, labelWidth + gap);
    } else {
      positive = positive.greaterThan(value) ? positive : value;
      rightLabel = Math.max(rightLabel, labelWidth + gap);
    }
  }
  const start = margin + nameWidth + gap + leftLabel;
  const width = Math.max(760, available, start + 280 + rightLabel + margin);
  const plotWidth = width - start - rightLabel - margin;
  const range = positive.plus(negative);
  const scale = range.isZero() ? decimal(1) : range;
  const zero = start + negative.div(scale).times(plotWidth).toNumber();
  return { width, zero, rows: data.map((row) => {
    const value = decimal(row.value);
    const end = zero + value.div(scale).times(plotWidth).toNumber();
    const lines = wrapChartLabel(row.label, nameWidth, measure);
    const height = Math.max(40, lines.length * 16 + 16);
    return { ...row, lines, height, x: Math.min(zero, end), barWidth: Math.abs(end - zero), labelX: end + (value.lessThan(0) ? -gap : gap), negative: value.lessThan(0) };
  }) };
}
