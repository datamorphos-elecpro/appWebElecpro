import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalyticsBarChart } from '../../components/analytics/AnalyticsBarChart';
import { SvgBarChart } from '../../components/ui/SvgBarChart';
import { QuotePreviewDialog } from '../../components/quotes/QuotePreviewDialog';
import { ProjectPercentChart } from '../../components/analytics/ProjectPercentChart';
import { DistributionComparisonChart } from '../../components/analytics/DistributionComparisonChart';
import '../../app/globals.css';

function Fixture() {
  const [selected, select] = useState('');
  const [open, setOpen] = useState(false);
  const [printSize, setPrintSize] = useState<'compact' | 'normal' | 'large'>('normal');
  const [large, setLarge] = useState(false);
  const [changed, setChanged] = useState(false);
  const values = [changed ? '999999999999999999999.99' : '999999999999.99', '-123456789012.34', '0', '12', '-800000000000'];
  const data = Array.from({ length: 24 }, (_, i) => ({ key: `${i}:series`, label: i % 2 ? 'NombreSinEspacios'.repeat(7) : 'Proyecto de ingeniería eléctrica con un nombre extenso en Bogotá', value: values[i % values.length], series: i % 2 ? 'Gastos' : 'Ingresos' }));
  return <main style={{ padding: 14, minWidth: 0, fontSize: large ? 24 : 16 }}>
    <h1>Gráficos: datos sintéticos</h1>
    <button onClick={() => setLarge(!large)}>Cambiar tamaño</button>
    <button onClick={() => setChanged(!changed)}>Cambiar datos</button>
    <button onClick={() => setOpen(true)}>Vista previa</button>
    <output aria-label="Selección">{selected}</output>
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: large ? 900 : undefined }}>
      <AnalyticsBarChart data={data} label="Mixtos" onSelect={select} />
      <SvgBarChart data={data.slice(0, 5).map((row) => ({ ...row, value: row.value.replace('-', ''), formattedValue: '$ 999.999.999.999' }))} label="Positivos" onSelect={select} />
      <SvgBarChart data={data.slice(0, 5).map((row) => ({ ...row, value: '-' + row.value.replace('-', ''), formattedValue: '-$ 999.999.999.999' }))} label="Negativos" />
      <SvgBarChart data={[{ key: 'zero', label: 'Cero', value: '0' }]} label="Ceros" />
      <AnalyticsBarChart data={[]} label="Vacío" />
      {location.search.includes('extras') && <>
        <ProjectPercentChart kind="margin" label="Porcentajes extensos" data={data.slice(0, 5).map((row) => ({ key: row.key, label: row.label, current: '999999999999.9', projected: '-88888888888.8', unit: 'percent' as const }))} />
        <DistributionComparisonChart participants={data.slice(0, 5).map((row) => ({ key: row.key, label: row.label, value: '999999999999', paid: '999999999999', pending: '999999999999' }))} />
      </>}
    </section>
    <QuotePreviewDialog printSize={printSize} onPrintSizeChange={setPrintSize} open={open} title="Vista previa con cabecera extensa y acciones accesibles" onClose={() => setOpen(false)}><AnalyticsBarChart data={data} label="Informe" /></QuotePreviewDialog>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
