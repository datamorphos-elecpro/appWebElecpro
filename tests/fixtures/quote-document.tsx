import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QuoteDocument } from '../../components/quotes/QuoteDocument';
import { QuotePreviewDialog } from '../../components/quotes/QuotePreviewDialog';
import { useQuotePrintSize } from '../../components/quotes/useQuotePrintSize';
import { calculateQuote } from '../../lib/calculations';
import '../../app/globals.css';

const stress = new URLSearchParams(location.search).has('stress');
const items = Array.from({ length: 36 }, (_, index) => ({
  code: stress && index === 0 ? 'CODIGOEXTENSOSINESPACIOS'.repeat(4) : `MAT-${index}`,
  description: stress && index === 0 ? 'Descripción extensa con saltos escritos por el usuario.\nSegunda línea de la descripción. '.repeat(5) : 'Conductor para instalación eléctrica y descripción extensa que debe ajustarse sin perder contenido',
  quantity: stress ? '1234.56' : '1.25', unit: 'UND', category: 'material' as const,
  baseUnitPrice: stress ? '987654321.50' : '1250.50',
}));
const totals = calculateQuote(items, { materialIncreasePct: '10', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19' });
function Fixture() {
  const [open, setOpen] = useState(false); const { printSize, changePrintSize } = useQuotePrintSize();
  const document = <QuoteDocument printSize={printSize} number="COT-PRUEBA" client={{ name: 'Cliente de prueba' }} items={items} totals={totals} form={{ issued_on: '2026-10-02', valid_until: '2026-10-17', greeting: 'Reciban un cordial saludo. Presentamos nuestra propuesta para la ejecución del servicio.\nGracias por su interés.', project_description: 'Instalación y pruebas de los circuitos eléctricos.\nVerificación final.', notes: 'Primera nota.\nSegunda nota.', objective: 'Garantizar el funcionamiento de la instalación.', benefits: 'Continuidad del servicio eléctrico.', exclusions: 'Obras civiles adicionales.', execution_time: 'Diez días hábiles.', deliverable: 'Informe de pruebas y planos finales.', scope: 'Condiciones de alcance con varias líneas.\n'.repeat(25), payment_terms: '50% de anticipo y 50% contra entrega.' }} company={{ manager_name: 'Gerencia Elecpro', manager_role: 'Gerente' }} />;
  return <main><h1>Aplicación de prueba</h1><button onClick={() => setOpen(true)}>Vista previa</button>
    <QuotePreviewDialog open={open} title="Vista previa de prueba" printSize={printSize} onPrintSizeChange={changePrintSize} onClose={() => setOpen(false)}>{document}</QuotePreviewDialog>
    {open && createPortal(<div className="quote-print-portal">{document}</div>, window.document.body)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
