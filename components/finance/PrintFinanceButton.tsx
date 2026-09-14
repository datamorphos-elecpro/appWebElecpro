'use client';

export function PrintFinanceButton({ className }: { className?: string }) {
  return <button type="button" className={className} data-print-control onClick={() => window.print()}>Informe PDF</button>;
}
