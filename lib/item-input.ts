/** Prices travel as decimal strings; only presentation rounds COP amounts. */
export function normalizeBasePrice(value: string): string | null {
  const text = value.trim();
  return /^\d{1,12}(?:[.,]\d{1,2})?$/.test(text) ? text.replace(',', '.') : null;
}
export const basePriceMessage = 'Ingrese un precio no negativo, sin separadores de miles y con máximo dos decimales (ejemplo: 1250,50).';
/** A trailing separator is an editing state, completed only on blur. */
export function finishBasePrice(value: string): string {
  const text = value.trim();
  return /^\d{1,12}[.,]$/.test(text) ? text.slice(0, -1) : value;
}
export function uppercaseUnit(value: string): string { return value.toLocaleUpperCase('es-CO'); }
export function normalizeUnit(value: string): string { return uppercaseUnit(value.trim()); }
