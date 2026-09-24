'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { approveAndConvertQuote, saveQuote } from '../../app/actions/quotes';
import { saveCompanySettings } from '../../app/actions/business';
import { calculateQuote } from '../../lib/calculations';
import { bogotaDate, money } from '../../lib/money';
import { useLocalDraft } from '../../lib/local-draft';
import { categoryOptions, type CatalogCategory } from '../../lib/presentation';
import { quotePayloadSchema, quoteValidationMessages } from '../../lib/validators/quote';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { Dialog } from '../ui/Dialog';
import { RemoteSearchSelect } from '../ui/RemoteSearchSelect';
import type { RemoteSearchResult } from '../../lib/remote-search';
import { QuoteDocument } from './QuoteDocument';
import { QuotePreviewDialog } from './QuotePreviewDialog';
import styles from './QuoteEditor.module.css';

type Category = CatalogCategory | '';
type Client = { id: string; name: string; contact_name?: string | null; email?: string | null; address?: string | null };
type Catalog = { id: string; code: string; description: string; unit: string; base_unit_price: string; category: Exclude<Category, ''> };
type Item = { localKey: string; catalog_item_id?: string | null; code: string; description: string; unit: string; category: Category; quantity: string; base_unit_price: string };
type Company = { legal_name: string; manager_name: string; manager_role: string; professional_card: string; phone: string; email: string; address: string; timezone: 'America/Bogota'; currency_code: 'COP' };
type InitialQuote = Record<string, unknown> & { id: string; number: string; project_id?: string | null; quote_items?: Array<Record<string, unknown>> };
type SaveState = 'dirty' | 'saving' | 'saved' | 'error';
type EditorDraft = { form: ReturnType<typeof initialForm>; items: Item[]; client: Client | null; started?: boolean; sections?: boolean[]; focus?: { section: number; field: number }; requestId?: string };

const decimalInput = (value: unknown, fallback = '0') => value === null || value === undefined ? fallback : String(value);
const datePlusDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00-05:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return bogotaDate(value);
};
const emptyItem = (localKey: string): Item => ({ localKey, code: '', description: '', unit: 'und', category: '', quantity: '1', base_unit_price: '0' });

function initialForm(quote?: InitialQuote) {
  const today = bogotaDate();
  return {
    client_id: String(quote?.client_id ?? ''), title: String(quote?.title ?? ''), status: String(quote?.status ?? 'draft'),
    address: String(quote?.address ?? ''), city: String(quote?.city ?? ''),
    issued_on: String(quote?.issued_on ?? today), valid_until: String(quote?.valid_until ?? datePlusDays(today, 15)),
    material_increase_pct: decimalInput(quote?.material_increase_pct, '0'), administration_pct: decimalInput(quote?.administration_pct, '8'),
    contingency_pct: decimalInput(quote?.contingency_pct, '3'), utility_pct: decimalInput(quote?.utility_pct, '10'), vat_utility_pct: decimalInput(quote?.vat_utility_pct, '19'),
    greeting: String(quote?.greeting ?? 'Cordial saludo. Presentamos para su consideración la siguiente propuesta técnica y económica.'),
    project_description: String(quote?.project_description ?? ''), objective: String(quote?.objective ?? ''),
    notes: String(quote?.notes ?? 'La oferta tiene una vigencia de 15 días calendario.'), scope: String(quote?.scope ?? ''), benefits: String(quote?.benefits ?? ''),
    exclusions: String(quote?.exclusions ?? ''), payment_terms: String(quote?.payment_terms ?? '50% de anticipo y 50% contra entrega.'),
    execution_time: String(quote?.execution_time ?? 'Por definir según programación y disponibilidad de materiales.'), deliverable: String(quote?.deliverable ?? ''),
  };
}
function initialItems(quote?: InitialQuote): Item[] {
  if (!quote?.quote_items?.length) return [emptyItem('draft-item-1')];
  return [...quote.quote_items].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).map((item, index) => ({
    localKey: String(item.id ?? `saved-item-${index}`), catalog_item_id: item.catalog_item_id ? String(item.catalog_item_id) : null,
    code: String(item.code ?? ''), description: String(item.description ?? ''), unit: String(item.unit ?? 'und'), category: String(item.category ?? '') as Category,
    quantity: decimalInput(item.quantity), base_unit_price: decimalInput(item.base_unit_price),
  }));
}

export function QuoteEditor({ quote, initialClient, company, userId }: { quote?: InitialQuote; initialClient?: Client | null; company: Company; userId: string }) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialForm(quote));
  const [items, setItems] = useState(() => initialItems(quote));
  const [saved, setSaved] = useState<InitialQuote | undefined>(quote);
  const [draftStarted, setDraftStarted] = useState(Boolean(quote));
  const [selectedClient, setSelectedClient] = useState<Client | null>(initialClient ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [managerConfirmOpen, setManagerConfirmOpen] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [sections, setSections] = useState([true, true, true, false, false]);
  const editorRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<EditorDraft['focus']>(undefined);
  const draft = useLocalDraft<EditorDraft>('quote', quote?.id ?? 'new', userId);
  const writeDraft = draft.write;
  const managerDraft = useLocalDraft<Company>('manager', 'global', userId);
  const [saveState, setSaveState] = useState<SaveState>(quote ? 'saved' : 'dirty');
  const [validation, setValidation] = useState<string[]>([]);
  const [manager, setManager] = useState(company);
  const [managerMessage, setManagerMessage] = useState('');
  const [converting, setConverting] = useState(false);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<InitialQuote | null> | null>(null);
  const savedRef = useRef(saved);
  // Una creación conserva su llave al reintentar; cada editor nuevo inicia una
  // operación diferente al abrir el borrador.
  const createRequestIdRef = useRef<string | undefined>(undefined);
  const currentRef = useRef({ form, items });
  const managerDirtyRef = useRef(false);
  const itemSequence = useRef(items.length + 1);
  const locked = Boolean(saved?.project_id);

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => {
    if (!draft.key) return;
    const stored = draft.read();
    if (stored && !locked) queueMicrotask(() => { setDraftAvailable(true); setDraftConflict(Boolean(quote?.updated_at && stored.serverUpdatedAt && quote.updated_at !== stored.serverUpdatedAt)); });
  // Restore is offered once when the draft key becomes available.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.key]);
  const persistDraft = useCallback(() => {
    if (!draft.key || draftAvailable || locked || revisionRef.current <= savedRevisionRef.current) return;
    writeDraft({ form: currentRef.current.form, items: currentRef.current.items, client: selectedClient, started: draftStarted, sections, focus: focusRef.current, requestId: createRequestIdRef.current }, String(quote?.updated_at ?? ''));
  }, [draft.key, writeDraft, draftAvailable, locked, selectedClient, draftStarted, sections, quote?.updated_at]);
  useLayoutEffect(() => { currentRef.current = { form, items }; persistDraft(); }, [form, items, persistDraft]);
  useEffect(() => { window.addEventListener('pagehide', persistDraft); return () => window.removeEventListener('pagehide', persistDraft); }, [persistDraft]);
  function restoreDraft() {
    const stored = draft.read(); if (!stored) return;
    setForm(stored.value.form); setItems(stored.value.items); setSelectedClient(stored.value.client?.id === stored.value.form.client_id ? stored.value.client : null);
    setSections(stored.value.sections ?? [true, true, true, false, false]);
    createRequestIdRef.current = stored.value.requestId;
    setDraftStarted(stored.value.started ?? true); markDirty(); setDraftAvailable(false); setDraftConflict(false);
    if (stored.value.focus) window.setTimeout(() => { const section = editorRef.current?.querySelectorAll('details')[stored.value.focus!.section]; const field = section?.querySelectorAll<HTMLElement>('input, textarea, select, button')[stored.value.focus!.field]; section?.scrollIntoView({ block: 'start' }); field?.focus(); }, 80);
  }
  function discardDraft() { draft.clear(); setDraftAvailable(false); setDraftConflict(false); }
  function clearFields() {
    setForm(initialForm(quote)); setItems(initialItems(quote)); setSelectedClient(initialClient ?? null);
    draft.clear(); markDirty();
  }

  const totals = useMemo(() => calculateQuote(items.map((item) => ({
    category: (item.category || 'labor') as CatalogCategory, quantity: item.quantity, baseUnitPrice: item.base_unit_price,
  })), {
    materialIncreasePct: form.material_increase_pct, administrationPct: form.administration_pct, contingencyPct: form.contingency_pct,
    utilityPct: form.utility_pct, vatUtilityPct: form.vat_utility_pct,
  }), [items, form.material_increase_pct, form.administration_pct, form.contingency_pct, form.utility_pct, form.vat_utility_pct]);

  const payload = useCallback(() => {
    return {
      ...currentRef.current.form,
      id: savedRef.current?.id,
      request_id: savedRef.current?.id ? undefined : createRequestIdRef.current,
      items: currentRef.current.items.map(({ localKey: _localKey, ...item }) => item),
    };
  }, []);

  function markDirty() {
    revisionRef.current += 1;
    setSaveState('dirty');
    setValidation([]);
  }

  function patchForm(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  }

  function patchItem(localKey: string, key: keyof Omit<Item, 'localKey'>, value: string) {
    setItems((current) => current.map((item) => item.localKey === localKey ? { ...item, [key]: value } : item));
    markDirty();
  }

  function addItem(catalogItem?: Catalog) {
    const localKey = `item-${itemSequence.current++}`;
    setItems((current) => [...current, catalogItem ? {
      localKey, catalog_item_id: catalogItem.id, code: catalogItem.code, description: catalogItem.description, unit: catalogItem.unit,
      category: catalogItem.category, quantity: '1', base_unit_price: decimalInput(catalogItem.base_unit_price),
    } : emptyItem(localKey)]);
    markDirty();
  }

  function selectClient(result: RemoteSearchResult | null) {
    if (!result) { setForm((current) => ({ ...current, client_id: '' })); setSelectedClient(null); markDirty(); return; }
    const metadata = result.metadata as Record<string, unknown>;
    setSelectedClient({ id: result.id, name: result.primary, contact_name: String(metadata.contact_name ?? ''), email: String(metadata.email ?? ''), address: String(metadata.address ?? '') });
    if (!form.address) patchForm('address', String(metadata.address ?? ''));
    patchForm('client_id', result.id);
  }

  function selectCatalogItem(result: RemoteSearchResult | null) {
    if (!result) return;
    const metadata = result.metadata as Record<string, unknown>;
    addItem({ id: result.id, code: String(metadata.code ?? ''), description: String(metadata.description ?? ''), unit: String(metadata.unit ?? 'und'), base_unit_price: String(metadata.base_unit_price ?? '0'), category: String(metadata.category ?? 'labor') as Exclude<Category, ''> });
  }

  function removeItem(localKey: string) {
    setItems((current) => current.filter((item) => item.localKey !== localKey));
    markDirty();
  }

  const saveLatest = useCallback(async (showErrors = false): Promise<InitialQuote | null> => {
    if (locked) return savedRef.current ?? null;
    if (savePromiseRef.current) return savePromiseRef.current;
    const task = (async () => {
      let latest: InitialQuote | null = savedRef.current ?? null;
      while (savedRevisionRef.current < revisionRef.current) {
        const parsed = quotePayloadSchema.safeParse(payload());
        if (!parsed.success) {
          setSaveState('dirty');
          if (showErrors) setValidation(quoteValidationMessages(payload()));
          return latest;
        }
        const targetRevision = revisionRef.current;
        setSaveState('saving');
        try {
          const response = await saveQuote(parsed.data);
          if (!response.ok) {
            setSaveState('error');
            setValidation([response.message]);
            return null;
          }
          latest = { ...savedRef.current, ...response.data } as InitialQuote;
          savedRef.current = latest;
          setSaved(latest);
          savedRevisionRef.current = targetRevision;
          setSaveState(savedRevisionRef.current === revisionRef.current ? 'saved' : 'dirty');
        } catch (error) {
          setSaveState('error');
          setValidation([error instanceof Error ? error.message : 'No se pudo guardar la cotización.']);
          return null;
        }
      }
      return latest;
    })();
    savePromiseRef.current = task;
    let result: InitialQuote | null;
    try {
      result = await task;
    } finally {
      savePromiseRef.current = null;
    }
    if (result?.id && savedRevisionRef.current === revisionRef.current) { draft.clear(); setDraftAvailable(false); }
    if (!quote && result?.id && savedRevisionRef.current === revisionRef.current) router.replace(`/cotizaciones/${result.id}`);
    return result;
  }, [locked, payload, quote, router, draft]);

  useEffect(() => {
    const hasPendingChanges = () => revisionRef.current > savedRevisionRef.current || managerDirtyRef.current;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  function startDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.client_id || !form.title.trim()) { setValidation(['Seleccione un cliente y escriba el nombre del proyecto o servicio.']); return; }
    createRequestIdRef.current ??= crypto.randomUUID();
    setDraftStarted(true);
    markDirty();
  }

  function openPreview() {
    const messages = quoteValidationMessages(payload());
    if (messages.length) { setValidation(messages); return; }
    setValidation([]);
    setPreviewOpen(true);
  }

  function requestConversion() {
    const messages = quoteValidationMessages(payload());
    if (messages.length) { setValidation(messages); return; }
    setConfirmOpen(true);
  }

  async function convertCurrent() {
    if (converting) return;
    setConverting(true);
    try {
        const parsed = quotePayloadSchema.parse(payload());
        const response = await approveAndConvertQuote(parsed);
        if (!response.ok) {
          setSaveState('error');
          setValidation([response.message]);
          throw new Error(response.message);
        }
        const project = response.data;
        const quoteId = savedRef.current?.id ?? project.quote_id;
        const next = { ...savedRef.current, id: quoteId, number: savedRef.current?.number ?? project.source_quote_number, project_id: project.id, status: 'approved' } as InitialQuote;
        savedRef.current = next;
        setSaved(next);
        setForm((current) => ({ ...current, status: 'approved' }));
        savedRevisionRef.current = revisionRef.current;
        setSaveState('saved');
        if (!quote && quoteId) router.replace(`/cotizaciones/${quoteId}`);
        setConfirmOpen(false);
    } catch (error) {
        setSaveState('error');
        setValidation([error instanceof Error ? error.message : 'No se pudo convertir la cotización.']);
        throw error;
    } finally { setConverting(false); }
  }

  function patchManager(key: keyof Company, value: string) {
    const next = { ...manager, [key]: value };
    setManager(next);
    managerDraft.write(next);
    managerDirtyRef.current = true;
    setManagerMessage('Cambios pendientes');
  }

  return <>
    <Link className={styles.back} href="/cotizaciones">Volver a cotizaciones</Link>
    <header className={styles.sectionHead}>
      <div><h1>{saved?.number ?? 'Cotización pendiente'}</h1><p>Edite a todo el ancho; la vista previa conserva el documento completo.</p></div>
      <div className={styles.headerSide}>
        <div className={`${styles.saveIndicator} ${styles[saveState]}`} role="status" aria-live="polite">
          <span aria-hidden="true" />{saveState === 'dirty' ? 'Cambios pendientes' : saveState === 'saving' ? 'Guardando' : saveState === 'error' ? 'Error al guardar' : 'Guardado'}
          {saveState === 'error' && <button type="button" onClick={() => setSaveConfirmOpen(true)}>Reintentar</button>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => setSaveConfirmOpen(true)} disabled={locked || saveState === 'saving'}>Guardar</button>
          {!locked && <button type="button" className={styles.secondary} onClick={clearFields}>Limpiar campos</button>}
          <button type="button" className={styles.secondary} onClick={openPreview}>Vista previa</button>
          {locked && saved?.project_id ? <Link className={styles.primary} href={`/proyectos/${saved.project_id}`}>Abrir proyecto →</Link> : <button type="button" className={styles.primary} onClick={requestConversion} disabled={converting}>{converting ? 'Convirtiendo…' : 'Convertir en proyecto'}</button>}
        </div>
      </div>
    </header>

    {validation.length > 0 && <div className={styles.validation} role="alert"><strong>Revise la cotización:</strong><ul>{validation.map((message) => <li key={message}>{message}</li>)}</ul></div>}
    {locked && <div className={styles.lockedNote}>Esta cotización ya fue convertida. La información comercial está bloqueada para conservar su instantánea económica.</div>}

    <div className={styles.editor} ref={editorRef} onFocusCapture={(event) => { const section = event.target.closest('details'); if (!section) return; const sectionIndex = Array.from(editorRef.current?.querySelectorAll('details') ?? []).indexOf(section); const field = Array.from(section.querySelectorAll('input, textarea, select, button')).indexOf(event.target); if (sectionIndex >= 0 && field >= 0) { focusRef.current = { section: sectionIndex, field }; persistDraft(); } }}>
      <EditorSection number="1" title="Información principal" open={sections[0]} onOpenChange={(value) => setSections((current) => current.map((v, i) => i === 0 ? value : v))}>
        <div className={styles.formGrid}>
          <Field label="Cliente"><RemoteSearchSelect kind="clients" value={form.client_id} defaultResult={selectedClient ? { id: selectedClient.id, primary: selectedClient.name, secondary: '', metadata: {} } : null} onSelect={selectClient} placeholder="Escriba al menos 2 caracteres" disabled={locked} /></Field>
          <Field label="Estado"><select value={form.status} onChange={(event) => patchForm('status', event.target.value)} disabled={locked}><option value="draft">Borrador</option><option value="sent">Enviada</option><option value="approved">Aprobada</option><option value="rejected">Rechazada</option></select></Field>
          <Field label="Fecha"><input type="date" value={form.issued_on} onChange={(event) => patchForm('issued_on', event.target.value)} disabled={locked} /></Field>
          <Field label="Válida hasta"><input type="date" value={form.valid_until} onChange={(event) => patchForm('valid_until', event.target.value)} disabled={locked} /></Field>
        </div>
        <Field label="Título / proyecto"><input value={form.title} onChange={(event) => patchForm('title', event.target.value)} disabled={locked} /></Field>
        <div className={styles.formGrid}><Field label="Dirección de ejecución"><input value={form.address} onChange={(event) => patchForm('address', event.target.value)} disabled={locked} /></Field><Field label="Ciudad"><input value={form.city} onChange={(event) => patchForm('city', event.target.value)} disabled={locked} /></Field></div>
        <Field label="Saludo e introducción"><textarea value={form.greeting} onChange={(event) => patchForm('greeting', event.target.value)} disabled={locked} /></Field>
        <Field label="Descripción del proyecto"><textarea value={form.project_description} onChange={(event) => patchForm('project_description', event.target.value)} disabled={locked} /></Field>
        <Field label="Objetivo del servicio"><textarea value={form.objective} onChange={(event) => patchForm('objective', event.target.value)} disabled={locked} /></Field>
      </EditorSection>

      <EditorSection number="2" title="Materiales y servicio" open={sections[1]} onOpenChange={(value) => setSections((current) => current.map((v, i) => i === 1 ? value : v))}>
        <Field label="Buscar en catálogo"><RemoteSearchSelect kind="catalog" value="" onSelect={selectCatalogItem} placeholder="Código o descripción (mínimo 2 caracteres)" disabled={locked} /></Field>
        <div className={styles.materialEditor}>{items.map((item, index) => <MaterialRow key={item.localKey} item={item} index={index} line={totals.lines[index]} locked={locked} patch={patchItem} remove={removeItem} />)}</div>
        {!locked && <button type="button" className={styles.secondary} onClick={() => addItem()}>+ Agregar ítem manual</button>}
      </EditorSection>

      <EditorSection number="3" title="Resumen económico" open={sections[2]} onOpenChange={(value) => setSections((current) => current.map((v, i) => i === 2 ? value : v))}>
        <div className={styles.economicsGrid}>
          <span>Costo directo ajustado</span><span>-</span><strong>{money(totals.directCost)}</strong>
          <EconomicRow label="Incremento sobre materiales" field="material_increase_pct" value={form.material_increase_pct} amount="-" patch={patchForm} disabled={locked} />
          <EconomicRow label="Administración" field="administration_pct" value={form.administration_pct} amount={money(totals.administrationAmount)} patch={patchForm} disabled={locked} />
          <EconomicRow label="Imprevistos" field="contingency_pct" value={form.contingency_pct} amount={money(totals.contingencyAmount)} patch={patchForm} disabled={locked} />
          <EconomicRow label="Utilidad" field="utility_pct" value={form.utility_pct} amount={money(totals.utilityAmount)} patch={patchForm} disabled={locked} />
          <EconomicRow label="IVA sobre utilidad" field="vat_utility_pct" value={form.vat_utility_pct} amount={money(totals.vatUtilityAmount)} patch={patchForm} disabled={locked} />
        </div>
        <div className={styles.economicsTotal}><span>Total de la propuesta</span><strong>{money(totals.totalAmount)}</strong></div>
        <Field label="Notas importantes"><textarea value={form.notes} onChange={(event) => patchForm('notes', event.target.value)} disabled={locked} /></Field>
      </EditorSection>

      <EditorSection number="4" title="Alcance y condiciones" open={sections[3]} onOpenChange={(value) => setSections((current) => current.map((v, i) => i === 3 ? value : v))}>
        <Field label="Alcance y actividades"><textarea value={form.scope} onChange={(event) => patchForm('scope', event.target.value)} disabled={locked} /></Field>
        <Field label="Beneficio esperado"><textarea value={form.benefits} onChange={(event) => patchForm('benefits', event.target.value)} disabled={locked} /></Field>
        <Field label="Actividades no incluidas"><textarea value={form.exclusions} onChange={(event) => patchForm('exclusions', event.target.value)} disabled={locked} /></Field>
        <Field label="Condiciones de pago"><textarea value={form.payment_terms} onChange={(event) => patchForm('payment_terms', event.target.value)} disabled={locked} /></Field>
        <Field label="Tiempo de ejecución"><textarea value={form.execution_time} onChange={(event) => patchForm('execution_time', event.target.value)} disabled={locked} /></Field>
        <Field label="Entregable"><textarea value={form.deliverable} onChange={(event) => patchForm('deliverable', event.target.value)} disabled={locked} /></Field>
      </EditorSection>

      <EditorSection number="5" title="Tarjeta del gerente" open={sections[4]} onOpenChange={(value) => setSections((current) => current.map((v, i) => i === 4 ? value : v))}>
        <p className={styles.managerHelp}>Esta información es global y aparecerá en todas las cotizaciones.</p>
        <div className={styles.managerActions}><button type="button" onClick={() => { const savedDraft = managerDraft.read(); if (savedDraft) { setManager(savedDraft.value); managerDirtyRef.current = true; } }}>Recuperar borrador de tarjeta</button><button type="button" onClick={() => { managerDraft.clear(); setManager(company); managerDirtyRef.current = false; }}>Limpiar cambios de tarjeta</button></div>
        <div className={styles.formGrid}>
          <Field label="Nombre"><input value={manager.manager_name} onChange={(event) => patchManager('manager_name', event.target.value)} /></Field>
          <Field label="Cargo"><input value={manager.manager_role} onChange={(event) => patchManager('manager_role', event.target.value)} /></Field>
          <Field label="Tarjeta profesional"><input value={manager.professional_card} onChange={(event) => patchManager('professional_card', event.target.value)} /></Field>
          <Field label="Teléfono"><input value={manager.phone} onChange={(event) => patchManager('phone', event.target.value)} /></Field>
          <Field label="Correo"><input type="email" value={manager.email} onChange={(event) => patchManager('email', event.target.value)} /></Field>
          <Field label="Dirección" full><input value={manager.address} onChange={(event) => patchManager('address', event.target.value)} /></Field>
        </div>
        <div className={styles.managerActions}><button type="button" className={styles.secondary} onClick={() => setManagerConfirmOpen(true)}>Guardar tarjeta</button>{managerMessage && <span role="status">{managerMessage}</span>}</div>
      </EditorSection>
    </div>

    <Dialog open={!draftStarted} title="Nueva cotización" onClose={() => router.push('/cotizaciones')}>
      {draftAvailable && <div className={styles.validation} role="status"><strong>{draftConflict ? 'El registro cambió en el servidor. Revise el borrador antes de guardarlo.' : 'Hay un borrador local sin guardar.'}</strong><div className={styles.dialogActions}><button type="button" onClick={restoreDraft}>Recuperar borrador</button><button type="button" onClick={discardDraft}>Descartar</button></div></div>}
      <form className={styles.initialForm} onSubmit={startDraft}>
        <div className={styles.formGrid}>
          <Field label="Cliente"><RemoteSearchSelect kind="clients" value={form.client_id} onSelect={selectClient} placeholder="Escriba al menos 2 caracteres" /></Field>
          <Field label="Nombre del proyecto o servicio" full><input value={form.title} onChange={(event) => patchForm('title', event.target.value)} required autoFocus /></Field>
          <Field label="Fecha"><input type="date" value={form.issued_on} onChange={(event) => patchForm('issued_on', event.target.value)} required /></Field>
          <Field label="Válida hasta"><input type="date" value={form.valid_until} onChange={(event) => patchForm('valid_until', event.target.value)} required /></Field>
        </div>
        <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={() => router.push('/cotizaciones')}>Cancelar</button><button type="submit" className={styles.primary}>Crear borrador</button></div>
      </form>
    </Dialog>
    {Boolean(quote) && <Dialog open={draftAvailable} title="Borrador de cotización" onClose={discardDraft}><p>{draftConflict ? 'Esta cotización cambió en el servidor después de guardar el borrador local. Revise los datos recuperados antes de guardarlos.' : 'Encontramos cambios sin guardar en este navegador.'}</p><div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={discardDraft}>Descartar</button><button type="button" className={styles.primary} onClick={restoreDraft}>Recuperar borrador</button></div></Dialog>}

    <ConfirmationDialog open={confirmOpen} title="Aprobar y convertir" description={`La cotización está en estado «${form.status === 'draft' ? 'Borrador' : form.status === 'sent' ? 'Enviada' : form.status === 'approved' ? 'Aprobada' : 'Rechazada'}». Se creará el proyecto conservando la instantánea económica actual.`} recordName={saved?.number ?? form.title} confirmLabel="Aprobar y convertir" onClose={() => setConfirmOpen(false)} onConfirm={convertCurrent} />
    <ConfirmationDialog open={saveConfirmOpen} title="Confirmar guardado" description="Se guardará la cotización y sus ítems en Elecpro." recordName={saved?.number ?? form.title} confirmLabel="Guardar cotización" onClose={() => setSaveConfirmOpen(false)} onConfirm={async () => { const result = await saveLatest(true); if (!result || savedRevisionRef.current !== revisionRef.current) throw new Error('Revise los datos de la cotización.'); setSaveConfirmOpen(false); }} />
    <ConfirmationDialog open={managerConfirmOpen} title="Guardar tarjeta del gerente" description="Los nuevos datos de firma se mostrarán en las cotizaciones." recordName={manager.manager_name || 'Gerencia Elecpro'} confirmLabel="Guardar tarjeta" onClose={() => setManagerConfirmOpen(false)} onConfirm={async () => { await saveCompanySettings(manager); managerDraft.clear(); managerDirtyRef.current = false; setManagerMessage('Tarjeta guardada'); setManagerConfirmOpen(false); }} />

    <QuotePreviewDialog open={previewOpen} title={`Vista previa · ${saved?.number ?? 'Pendiente de guardar'}`} onClose={() => setPreviewOpen(false)}>
      <QuoteDocument form={form} items={items} totals={totals} number={saved?.number ? String(saved.number) : undefined} client={selectedClient} company={manager} />
    </QuotePreviewDialog>
    {previewOpen && typeof document !== 'undefined' && createPortal(<div className="quote-print-portal"><QuoteDocument form={form} items={items} totals={totals} number={saved?.number ? String(saved.number) : undefined} client={selectedClient} company={manager} /></div>, document.body)}
  </>;
}

function EditorSection({ number, title, open = false, onOpenChange, children }: { number: string; title: string; open?: boolean; onOpenChange: (value: boolean) => void; children: React.ReactNode }) {
  return <details className={styles.section} open={open} onToggle={(event) => { if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }}><summary>{number}. {title}</summary><div className={styles.sectionBody}>{children}</div></details>;
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`${styles.field} ${full ? styles.full : ''}`}><span>{label}</span>{children}</label>;
}

function MaterialRow({ item, index, line, locked, patch, remove }: { item: Item; index: number; line: { finalUnitPrice: unknown; finalTotal: unknown }; locked: boolean; patch: (id: string, key: keyof Omit<Item, 'localKey'>, value: string) => void; remove: (id: string) => void }) {
  return <div className={styles.materialRow}>
    <Field label="Código"><input value={item.code} onChange={(event) => patch(item.localKey, 'code', event.target.value)} disabled={locked} /></Field>
    <Field label="Descripción"><input value={item.description} onChange={(event) => patch(item.localKey, 'description', event.target.value)} disabled={locked} /></Field>
    <Field label="Categoría"><select required value={item.category} onChange={(event) => patch(item.localKey, 'category', event.target.value)} disabled={locked}><option value="">Elegir</option>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
    <Field label="Cant."><input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => patch(item.localKey, 'quantity', event.target.value)} disabled={locked} /></Field>
    <Field label="Unidad"><input value={item.unit} onChange={(event) => patch(item.localKey, 'unit', event.target.value)} disabled={locked} /></Field>
    <Field label="Precio base"><input type="number" min="0" step="0.01" value={item.base_unit_price} onChange={(event) => patch(item.localKey, 'base_unit_price', event.target.value)} disabled={locked} /></Field>
    <Field label="Precio final"><output>{money(line?.finalUnitPrice as never)}</output></Field>
    <Field label="Total"><output>{money(line?.finalTotal as never)}</output></Field>
    {!locked && <button type="button" className={styles.iconButton} onClick={() => remove(item.localKey)} aria-label={`Eliminar ítem ${index + 1}`}>×</button>}
  </div>;
}

function EconomicRow({ label, field, value, amount, patch, disabled }: { label: string; field: 'material_increase_pct' | 'administration_pct' | 'contingency_pct' | 'utility_pct' | 'vat_utility_pct'; value: string; amount: string; patch: (key: typeof field, value: string) => void; disabled: boolean }) {
  return <><span>{label} (%)</span><input aria-label={`${label} porcentaje`} type="number" min="0" step="0.01" value={value} onChange={(event) => patch(field, event.target.value)} disabled={disabled} /><strong>{amount}</strong></>;
}
