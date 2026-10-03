import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QuoteDocument } from '../../components/quotes/QuoteDocument';
import { QuotePreviewDialog } from '../../components/quotes/QuotePreviewDialog';
import { useQuotePrintSize } from '../../components/quotes/useQuotePrintSize';
import { calculateQuote } from '../../lib/calculations';
import '../../app/globals.css';

const items = Array.from({ length: 36 }, (_, index) => ({ code: `MAT-${index}`, description: 'Conductor para instalación eléctrica y descripción extensa que debe ajustarse sin perder contenido', quantity: '1.25', unit: 'UND', category: 'material' as const, baseUnitPrice: '1250.50' }));
const totals = calculateQuote(items, { materialIncreasePct: '10', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19' });
function Fixture() {
  const [open, setOpen] = useState(false); const { printSize, changePrintSize } = useQuotePrintSize();
  const document = <QuoteDocument printSize={printSize} number="COT-PRUEBA" client={{ name: 'Cliente de prueba' }} items={items} totals={totals} form={{ issued_on: '2026-10-02', valid_until: '2026-10-17', scope: 'Condiciones de alcance con varias líneas.\n'.repeat(25), payment_terms: '50% de anticipo y 50% contra entrega.' }} company={{ manager_name: 'Gerencia Elecpro', manager_role: 'Gerente' }} />;
  return <main><h1>Aplicación de prueba</h1><button onClick={() => setOpen(true)}>Vista previa</button>
    <QuotePreviewDialog open={open} title="Vista previa de prueba" printSize={printSize} onPrintSizeChange={changePrintSize} onClose={() => setOpen(false)}>{document}</QuotePreviewDialog>
    {open && createPortal(<div className="quote-print-portal">{document}</div>, window.document.body)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
