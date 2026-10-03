export const quotePrintSizes = ['compact', 'normal', 'large'] as const;
export type QuotePrintSize = (typeof quotePrintSizes)[number];
export const quotePrintStorageKey = 'elecpro:quote-print-size:v1';
export function parseQuotePrintSize(value: unknown): QuotePrintSize {
  return quotePrintSizes.includes(value as QuotePrintSize) ? value as QuotePrintSize : 'normal';
}
