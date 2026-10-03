'use client';
import { useEffect, useState } from 'react';
import { parseQuotePrintSize, quotePrintStorageKey, type QuotePrintSize } from '../../lib/quote-print';
export function useQuotePrintSize() {
  const [printSize, setPrintSize] = useState<QuotePrintSize>('normal');
  useEffect(() => {
    try { const size = parseQuotePrintSize(localStorage.getItem(quotePrintStorageKey)); queueMicrotask(() => setPrintSize(size)); }
    catch { /* Printing remains available when browser storage is disabled. */ }
  }, []);
  function changePrintSize(size: QuotePrintSize) {
    setPrintSize(size);
    try { localStorage.setItem(quotePrintStorageKey, size); } catch { /* Session preference still applies. */ }
  }
  return { printSize, changePrintSize };
}
