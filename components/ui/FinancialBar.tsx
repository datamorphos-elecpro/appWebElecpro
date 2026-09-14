import styles from './FinancialBar.module.css';
import { decimal, type DecimalInput } from '../../lib/calculations';

export function financialPercent(numerator: DecimalInput, denominator: DecimalInput) {
  const total = decimal(denominator);
  if (total.isZero()) return null;
  return decimal(numerator).div(total).times(100).toDecimalPlaces(0).clampedTo(0, 100).toNumber();
}

export function FinancialBar({ value, total, label, valueLabel }: { value: DecimalInput; total: DecimalInput; label: string; valueLabel?: string }) {
  const percent = financialPercent(value, total);
  const percentText = percent === null ? 'No calculable' : `${percent}%`;
  return <div className={styles.row}><div className={styles.head}><span>{label}</span><strong>{valueLabel ?? percentText}</strong></div><div className={styles.track} aria-label={`${label}: ${percentText}`}><span style={{ width: `${percent ?? 0}%` }} /></div></div>;
}
