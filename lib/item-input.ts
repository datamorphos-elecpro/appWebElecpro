/** Prices travel as decimal strings; only presentation rounds COP amounts. */
export function normalizeBasePrice(value: string): string | null {
  const text = value.trim();
  return /^\d{1,12}(?:[.,]\d{1,2})?$/.test(text) ? text.replace(',', '.') : null;
}
export const basePriceMessage = 'Ingrese un precio no negativo, sin separadores de miles y con máximo dos decimales (ejemplo: 1250,50).';
/** An omitted VAT is zero; partial/invalid editing states are not persisted. */
export function normalizeItemVat(value: string): string | null {
  const text = value.trim();
  if (text === '') return '0';
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(text)) return null;
  const normalized = text.replace(',', '.');
  // Compare the integer and fraction as text, without binary financial arithmetic.
  const [integer, fraction = ''] = normalized.split('.');
  const significant = integer.replace(/^0+/, '') || '0';
  if (significant.length > 3 || (significant.length === 3 && (significant > '100' || (significant === '100' && /[1-9]/.test(fraction))))) return null;
  return normalized;
}
export const itemVatMessage = 'Ingrese un IVA entre 0 y 100 %, con máximo dos decimales. Dejar vacío equivale a 0 %.';
/** A trailing separator is an editing state, completed only on blur. */
export function finishBasePrice(value: string): string {
  const text = value.trim();
  return /^\d{1,12}[.,]$/.test(text) ? text.slice(0, -1) : value;
}
export function uppercaseUnit(value: string): string { return value.toLocaleUpperCase('es-CO'); }
export function normalizeUnit(value: string): string { return uppercaseUnit(value.trim()); }
