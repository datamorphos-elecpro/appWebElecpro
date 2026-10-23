import DecimalJs from 'decimal.js';
import type { CatalogCategory } from './presentation';

/** Decimal arithmetic for every monetary and percentage calculation in Elecpro. */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type DecimalInput = DecimalJs.Value;
export type MoneyInput = DecimalInput | null | undefined;

export function decimal(value: MoneyInput): InstanceType<typeof Decimal> {
  return new Decimal(value === null || value === undefined || value === '' ? 0 : value);
}

export type QuoteItem = { category: CatalogCategory; quantity: DecimalInput; baseUnitPrice: DecimalInput; vatPct?: MoneyInput };
export type QuoteRates = { materialIncreasePct: DecimalInput; administrationPct: DecimalInput; contingencyPct: DecimalInput; utilityPct: DecimalInput; vatUtilityPct: DecimalInput; applyDirectVat?: boolean; vatDirectPct?: MoneyInput; applyDirectDiscount?: boolean; directDiscountType?: 'percent' | 'fixed'; directDiscountPct?: MoneyInput; directDiscountFixedAmount?: MoneyInput };

export function calculateQuote(items: QuoteItem[], rates: QuoteRates) {
  const materialFactor = decimal(1).plus(decimal(rates.materialIncreasePct).div(100));
  const lines = items.map((item) => {
    const quantity = decimal(item.quantity);
    const baseUnitPrice = decimal(item.baseUnitPrice);
    const costUnitPrice = baseUnitPrice.times(decimal(1).plus(decimal(item.vatPct).div(100)));
    const finalUnitPrice = item.category === 'material' ? costUnitPrice.times(materialFactor) : costUnitPrice;
    return { ...item, costUnitPrice, finalUnitPrice, baseTotal: quantity.times(baseUnitPrice), costTotal: quantity.times(costUnitPrice), finalTotal: quantity.times(finalUnitPrice) };
  });
  const directCost = lines.reduce((total, item) => total.plus(item.finalTotal), decimal(0));
  const directDiscountAmount = rates.applyDirectDiscount
    ? rates.directDiscountType === 'fixed' ? decimal(rates.directDiscountFixedAmount) : directCost.times(decimal(rates.directDiscountPct)).div(100)
    : decimal(0);
  const netDirectCost = directCost.minus(directDiscountAmount);
  const administrationAmount = netDirectCost.times(decimal(rates.administrationPct)).div(100);
  const contingencyAmount = netDirectCost.times(decimal(rates.contingencyPct)).div(100);
  const utilityAmount = netDirectCost.times(decimal(rates.utilityPct)).div(100);
  const vatUtilityAmount = utilityAmount.times(decimal(rates.vatUtilityPct)).div(100);
  const vatDirectAmount = rates.applyDirectVat ? netDirectCost.times(decimal(rates.vatDirectPct)).div(100) : decimal(0);
  const serviceSubtotal = netDirectCost.plus(administrationAmount).plus(contingencyAmount).plus(utilityAmount);
  return { lines, directCost, directDiscountAmount, netDirectCost, administrationAmount, contingencyAmount, utilityAmount, vatUtilityAmount, vatDirectAmount, serviceSubtotal, totalAmount: serviceSubtotal.plus(vatUtilityAmount).plus(vatDirectAmount) };
}

export const projectCovered = (paid: MoneyInput, withheld: MoneyInput = 0) => decimal(paid).plus(decimal(withheld));

export const projectBalance = (value: DecimalInput, paid: DecimalInput, withheld: MoneyInput = 0) => Decimal.max(0, decimal(value).minus(projectCovered(paid, withheld)));
export const projectProfit = (mode: 'value' | 'manual', value: DecimalInput, initial: DecimalInput, expenses: DecimalInput) => decimal(mode === 'value' ? value : initial).minus(decimal(expenses));
export const shareAmount = (mode: 'percent' | 'fixed', value: DecimalInput, base: DecimalInput) => mode === 'percent' ? decimal(base).times(decimal(value)).div(100) : decimal(value);
export const realPercent = (numerator: DecimalInput, denominator: DecimalInput, decimals = 1) => {
  const total = decimal(denominator);
  if (total.isZero()) return null;
  return decimal(numerator).div(total).times(100).toDecimalPlaces(decimals);
};
export const visualPercent = (numerator: DecimalInput, denominator: DecimalInput) => realPercent(numerator, denominator, 0)?.clampedTo(0, 100).toNumber() ?? null;

export function alertKinds(project: { status: string; expectedEnd: string; actualEnd?: string | null; expenses: DecimalInput; budget: DecimalInput; value: DecimalInput; paid: DecimalInput; withheld?: MoneyInput }, today: string) {
  const alerts: string[] = [];
  const inactive = ['draft', 'quoted', 'cancelled'];
  if (!inactive.includes(project.status) && (project.status === 'finished' ? (project.actualEnd && project.actualEnd > project.expectedEnd) : project.expectedEnd < today)) alerts.push('retraso');
  if (decimal(project.budget).greaterThan(0) && decimal(project.expenses).greaterThan(decimal(project.budget))) alerts.push('sobrecosto');
  if (!['draft', 'cancelled'].includes(project.status) && projectBalance(project.value, project.paid, project.withheld).greaterThan(0)) alerts.push('cartera');
  const end = new Date(`${project.expectedEnd}T00:00:00`);
  const start = new Date(`${today}T00:00:00`);
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (!inactive.includes(project.status) && project.status !== 'finished' && days >= 0 && days <= 15) alerts.push('finalizacion_proxima');
  return alerts;
}
