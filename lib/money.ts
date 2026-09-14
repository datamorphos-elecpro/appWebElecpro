import { decimal, type MoneyInput } from './calculations';

const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const currency = formatter.formatToParts(0).find((part) => part.type === 'currency')?.value ?? '$';

/** Formats an exact decimal as COP without first coercing it to a JavaScript number. */
export function money(value: MoneyInput): string {
  const rounded = decimal(value).toDecimalPlaces(0).toFixed(0);
  const negative = rounded.startsWith('-');
  const digits = negative ? rounded.slice(1) : rounded;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${currency}\u00a0${grouped}`;
}

export const bogotaDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(value);