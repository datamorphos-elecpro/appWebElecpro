import { decimal, type MoneyInput } from './calculations';

export type FinancialKind = 'result' | 'balance' | 'expense' | 'execution';
export function financialTone(value: MoneyInput, kind: FinancialKind, budget: MoneyInput = 0) {
  const n = decimal(value);
  if (kind === 'balance') return n.greaterThan(0) ? 'warning' : undefined;
  if (kind === 'expense') return decimal(budget).greaterThan(0) && n.greaterThan(decimal(budget)) ? 'danger' : undefined;
  if (kind === 'execution') return n.greaterThan(100) ? 'danger' : undefined;
  return n.lessThan(0) ? 'danger' : n.greaterThan(0) ? 'success' : undefined;
}
export function financialAttributes(value: MoneyInput, kind: FinancialKind, budget: MoneyInput = 0) {
  const tone = financialTone(value, kind, budget);
  const description = tone === 'success' ? 'Resultado positivo' : tone === 'warning' ? 'Saldo pendiente por cobrar' : tone === 'danger' ? kind === 'result' ? 'Resultado negativo' : 'Presupuesto excedido' : 'Sin alerta financiera';
  return { 'data-tone': tone, 'aria-description': description, title: description };
}
