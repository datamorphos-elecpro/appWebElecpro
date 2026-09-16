import DecimalJs from 'decimal.js';
import type { CatalogCategory } from './presentation';

/** Decimal arithmetic for every monetary and percentage calculation in Elecpro. */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type DecimalInput = DecimalJs.Value;
export type MoneyInput = DecimalInput | null | undefined;

export function decimal(value: MoneyInput): InstanceType<typeof Decimal> {
  return new Decimal(value === null || value === undefined || value === '' ? 0 : value);
}

export type QuoteItem = { category: CatalogCategory; quantity: DecimalInput; baseUnitPrice: DecimalInput };
export type QuoteRates = { materialIncreasePct: DecimalInput; administrationPct: DecimalInput; contingencyPct: DecimalInput; utilityPct: DecimalInput; vatUtilityPct: DecimalInput };

export function calculateQuote(items: QuoteItem[], rates: QuoteRates) {
  const materialFactor = decimal(1).plus(decimal(rates.materialIncreasePct).div(100));
  const lines = items.map((item) => {
    const quantity = decimal(item.quantity);
    const baseUnitPrice = decimal(item.baseUnitPrice);
    const finalUnitPrice = item.category === 'material' ? baseUnitPrice.times(materialFactor) : baseUnitPrice;
    return { ...item, finalUnitPrice, baseTotal: quantity.times(baseUnitPrice), finalTotal: quantity.times(finalUnitPrice) };
  });
  const directCost = lines.reduce((total, item) => total.plus(item.finalTotal), decimal(0));
  const administrationAmount = directCost.times(decimal(rates.administrationPct)).div(100);
  const contingencyAmount = directCost.times(decimal(rates.contingencyPct)).div(100);
  const utilityAmount = directCost.times(decimal(rates.utilityPct)).div(100);
  const vatUtilityAmount = utilityAmount.times(decimal(rates.vatUtilityPct)).div(100);
  return { lines, directCost, administrationAmount, contingencyAmount, utilityAmount, vatUtilityAmount, totalAmount: directCost.plus(administrationAmount).plus(contingencyAmount).plus(utilityAmount).plus(vatUtilityAmount) };
}

export const projectBalance = (value: DecimalInput, paid: DecimalInput) => Decimal.max(0, decimal(value).minus(decimal(paid)));
export const projectProfit = (mode: 'value' | 'manual', value: DecimalInput, initial: DecimalInput, expenses: DecimalInput) => decimal(mode === 'value' ? value : initial).minus(decimal(expenses));
export const shareAmount = (mode: 'percent' | 'fixed', value: DecimalInput, base: DecimalInput) => mode === 'percent' ? decimal(base).times(decimal(value)).div(100) : decimal(value);
export const realPercent = (numerator: DecimalInput, denominator: DecimalInput, decimals = 1) => {
  const total = decimal(denominator);
  if (total.isZero()) return null;
  return decimal(numerator).div(total).times(100).toDecimalPlaces(decimals);
};
export const visualPercent = (numerator: DecimalInput, denominator: DecimalInput) => realPercent(numerator, denominator, 0)?.clampedTo(0, 100).toNumber() ?? null;

export function alertKinds(project: { status: string; expectedEnd: string; actualEnd?: string | null; expenses: DecimalInput; budget: DecimalInput; value: DecimalInput; paid: DecimalInput }, today: string) {
  const alerts: string[] = [];
  const inactive = ['draft', 'quoted', 'cancelled'];
  if (!inactive.includes(project.status) && (project.status === 'finished' ? (project.actualEnd && project.actualEnd > project.expectedEnd) : project.expectedEnd < today)) alerts.push('retraso');
  if (decimal(project.budget).greaterThan(0) && decimal(project.expenses).greaterThan(decimal(project.budget))) alerts.push('sobrecosto');
  if (!['draft', 'cancelled'].includes(project.status) && projectBalance(project.value, project.paid).greaterThan(0)) alerts.push('cartera');
  const end = new Date(`${project.expectedEnd}T00:00:00`);
  const start = new Date(`${today}T00:00:00`);
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (!inactive.includes(project.status) && project.status !== 'finished' && days >= 0 && days <= 15) alerts.push('finalizacion_proxima');
  return alerts;
}
