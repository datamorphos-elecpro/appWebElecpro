import styles from './FinancialBar.module.css';
import { realPercent, visualPercent, type DecimalInput } from '../../lib/calculations';

export function financialPercent(numerator: DecimalInput, denominator: DecimalInput) {
  return visualPercent(numerator, denominator);
}

export function financialPercentText(numerator: DecimalInput, denominator: DecimalInput, decimals = 1) {
  const percent = realPercent(numerator, denominator, decimals);
  return percent === null ? 'No calculable' : `${percent.toFixed(decimals).replace(/\.0$/, '')}%`;
}

export function FinancialBar({ value, total, label, valueLabel }: { value: DecimalInput; total: DecimalInput; label: string; valueLabel?: string }) {
  const percent = financialPercent(value, total);
  const percentText = financialPercentText(value, total);
  return <div className={styles.row}><div className={styles.head}><span>{label}</span><strong>{valueLabel ?? percentText}</strong></div><div className={styles.track} aria-label={`${label}: ${percentText}`}><span style={{ width: `${percent ?? 0}%` }} /></div></div>;
}
