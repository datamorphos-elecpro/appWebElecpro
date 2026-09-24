import Image from 'next/image';
import { money } from '../../lib/money';
import { bogotaDateText } from '../../lib/presentation';
import styles from './QuoteDocument.module.css';

type DocumentItem = { code: string; description: string; quantity: string; unit: string };
type DocumentTotals = {
  lines: Array<{ finalUnitPrice: unknown; finalTotal: unknown }>;
  directCost: unknown;
  administrationAmount: unknown;
  contingencyAmount: unknown;
  utilityAmount: unknown;
  vatUtilityAmount: unknown;
  totalAmount: unknown;
};
type DocumentClient = { name?: string; contact_name?: string | null; email?: string | null };
type DocumentCompany = {
  manager_name?: string;
  manager_role?: string;
  professional_card?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export function QuoteDocument({ form, items, totals, number, client, company }: {
  form: Record<string, string>;
  items: DocumentItem[];
  totals: DocumentTotals;
  number?: string;
  client?: DocumentClient | null;
  company?: DocumentCompany | null;
}) {
  const economicRows = [
    ['Costo directo', '—', totals.directCost],
    ['Administración', `${form.administration_pct || '0'}%`, totals.administrationAmount],
    ['Imprevistos', `${form.contingency_pct || '0'}%`, totals.contingencyAmount],
    ['Utilidad', `${form.utility_pct || '0'}%`, totals.utilityAmount],
    ['IVA sobre utilidad', `${form.vat_utility_pct || '0'}%`, totals.vatUtilityAmount],
  ] as const;
  const contact = [client?.contact_name, client?.email].filter(Boolean).join(' · ');

  return <article className={`${styles.document} quote-print-root`} aria-label="Documento de cotización">
    <header className={styles.header}>
      <div>
        <div className={styles.kicker}>Propuesta técnico-económica</div>
        <h2>{number ?? 'Pendiente de guardar'}</h2>
        <p>Fecha: {bogotaDateText(form.issued_on)} · Válida hasta: {bogotaDateText(form.valid_until)}</p>
        {(form.address || form.city) && <p>Ejecución: {[form.address, form.city].filter(Boolean).join(' · ')}</p>}
      </div>
      <Image src="/images/elecpro-logo.png" width={155} height={71} alt="Elecpro Ingeniería Eléctrica" />
    </header>
    <div className={styles.intro}>
      <strong>Señores<br />{client?.name ?? 'Cliente por definir'}</strong><br />
      {contact}<br /><br />
      {form.greeting || 'Sin información registrada.'}
    </div>
    <DocumentSection title="Objetivo del servicio" value={form.objective} />
    <section className={styles.section}>
      <h3>Materiales y servicios</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>Valor unit.</th><th>Valor total</th></tr></thead>
          <tbody>{items.length ? items.map((item, index) => <tr key={`${item.code}-${index}`}><td>{index + 1}</td><td>{item.code || '—'}</td><td>{item.description || 'Sin descripción'}</td><td className={styles.number}>{item.quantity}</td><td>{item.unit}</td><td className={styles.number}>{money(totals.lines[index]?.finalUnitPrice as never)}</td><td className={styles.number}>{money(totals.lines[index]?.finalTotal as never)}</td></tr>) : <tr><td colSpan={7}>Sin ítems registrados</td></tr>}</tbody>
        </table>
      </div>
    </section>
    <section className={styles.section}>
      <h3>Información del proyecto</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}><tbody>
          <tr><th className={styles.rowHeading}>Descripción</th><td>{form.project_description || 'Sin información registrada.'}</td></tr>
          <tr><th className={styles.rowHeading}>Notas importantes</th><td className={styles.multiline}>{form.notes || 'Sin información registrada.'}</td></tr>
        </tbody></table>
      </div>
    </section>
    <section className={styles.section}>
      <h3>Resumen económico</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Concepto</th><th>Porcentaje</th><th>Valor</th></tr></thead>
          <tbody>{economicRows.map(([label, percentage, amount]) => <tr key={label}><td>{label}</td><td>{percentage}</td><td className={styles.number}>{money(amount as never)}</td></tr>)}<tr className={styles.totalRow}><td colSpan={2}>TOTAL PROPUESTA</td><td className={styles.number}>{money(totals.totalAmount as never)}</td></tr></tbody>
        </table>
      </div>
    </section>
    <DocumentSection title="Alcance y actividades del servicio" value={form.scope} />
    <DocumentSection title="Beneficio esperado" value={form.benefits} />
    <DocumentSection title="Actividades no incluidas" value={form.exclusions} />
    <DocumentSection title="Condiciones de pago" value={form.payment_terms} />
    <DocumentSection title="Tiempo de ejecución" value={form.execution_time} />
    <DocumentSection title="Entregable" value={form.deliverable} />
    <footer className={styles.managerCard}>
      <div>
        <strong>{company?.manager_name || 'Gerencia Elecpro'}</strong>
        <span>{company?.manager_role || 'Gerencia'}</span>
        {company?.professional_card && <span>Tarjeta profesional: {company.professional_card}</span>}
        <span>{[company?.phone, company?.email].filter(Boolean).join(' · ') || 'Datos de contacto por registrar'}</span>
        <span>{company?.address || 'Dirección por registrar'}</span>
      </div>
      <Image src="/images/elecpro-logo.png" width={110} height={50} alt="Elecpro" />
    </footer>
  </article>;
}

function DocumentSection({ title, value }: { title: string; value?: string }) {
  return <section className={styles.section}><h3>{title}</h3><p>{value || 'Sin información registrada.'}</p></section>;
}
