'use client';

import { FormEvent, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProject, saveProjectRecord } from '../../app/actions/projects';
import { decimal, realPercent, shareAmount } from '../../lib/calculations';
import { money } from '../../lib/money';
import { bogotaDateText, priorityText, profitModeText, projectStatusText, shareBasisText, shareModeText } from '../../lib/presentation';
import { Dialog } from '../ui/Dialog';
import { FinancialBar, financialPercentText } from '../ui/FinancialBar';
import { Status } from '../ui/Status';
import styles from './ProjectWorkspace.module.css';

type Client = { id: string; name: string; address?: string | null };
type Props = { project?: any; clients: Client[]; summary?: any; payments?: any[]; expenses?: any[]; budgets?: any[]; shares?: any[] };
type RecordKind = 'payment' | 'expense' | 'budget' | 'share';
const projectStatuses = ['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'];
const priorities = ['low', 'medium', 'high', 'critical'];

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()); }
function inThirtyDays() { const date = new Date(); date.setDate(date.getDate() + 30); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date); }
function formValues(event: FormEvent<HTMLFormElement>) { return Object.fromEntries(new FormData(event.currentTarget)); }
function percentLabel(value: unknown, total: unknown) { return financialPercentText(value as never, total as never); }

export function ProjectWorkspace({ project, clients, summary, payments = [], expenses = [], budgets = [], shares = [] }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState('resumen');
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [projectDialog, setProjectDialog] = useState(!project);
  const [recordDialog, setRecordDialog] = useState<RecordKind | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const projectId = project?.id as string | undefined;
  const defaults = useMemo(() => ({
    client_id: project?.client_id ?? clients[0]?.id ?? '', title: project?.title ?? '', project_value: String(project?.project_value ?? '0'),
    status: project?.status ?? 'draft', priority: project?.priority ?? 'medium', responsible: project?.responsible ?? '', location: project?.location ?? '',
    start_date: project?.start_date ?? today(), expected_end_date: project?.expected_end_date ?? inThirtyDays(), actual_end_date: project?.actual_end_date ?? '',
    observations: project?.observations ?? '', profit_mode: project?.profit_mode ?? 'value', initial_profit: String(project?.initial_profit ?? '0'),
  }), [project, clients]);
  const financial = summary ?? { paid: '0', balance: '0', expenses: '0', budget: '0', real_profit: '0', projected_profit: '0' };
  const budgetPercent = realPercent(financial.budget, project?.project_value ?? 0, 1);

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { ...formValues(event), id: projectId };
    start(async () => { try { const saved = await saveProject(value); setNotice({ tone: 'success', text: 'Proyecto guardado.' }); setProjectDialog(false); if (!projectId) router.push(`/proyectos/${saved.id}`); else router.refresh(); } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible guardar el proyecto.' }); } });
  }
  function submitRecord(kind: RecordKind, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const form = event.currentTarget;
    const value = formValues(event) as Record<string, string | boolean>;
    if (kind === 'share') value.is_paid = value.is_paid === 'on';
    start(async () => { try { await saveProjectRecord(kind, { ...value, project_id: projectId }); form.reset(); setRecordDialog(null); setNotice({ tone: 'success', text: 'Registro guardado.' }); router.refresh(); } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible guardar el registro.' }); } });
  }

  if (!project) return <section className={styles.workspace}>{notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${styles[notice.tone]}`}>{notice.text}</p>}<ProjectForm clients={clients} defaults={defaults} pending={pending} submitProject={submitProject} first={first} /></section>;

  return <section className={styles.workspace}>
    <header className={styles.projectHeader}>
      <div><span>{project.quote_number || 'Sin identificador'} · {project.clients?.name ?? 'Sin cliente'}</span><h2>{project.title}</h2><p>{project.location || 'Sin ubicación'} · Responsable: {project.responsible || 'Sin responsable'}</p></div>
      <div className={styles.headerMetrics}><span>Valor<b>{money(project.project_value)}</b></span><span>Pagado<b>{money(financial.paid)}</b></span><span>Saldo<b>{money(financial.balance)}</b></span><span>Ganancia<b>{money(financial.real_profit)}</b></span></div>
      <button type="button" className={styles.headerButton} onClick={() => setProjectDialog(true)}>Editar proyecto</button>
    </header>
    <nav aria-label="Secciones del proyecto" className={styles.tabs}>{[['resumen', 'Resumen'], ['anticipos', 'Anticipos'], ['gastos', 'Gastos y presupuesto'], ['distribucion', 'Distribución'], ['fechas', 'Fechas y condiciones']].map(([id, label]) => <button key={id} type="button" className={tab === id ? styles.active : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${styles[notice.tone]}`}>{notice.text}</p>}

    {tab === 'resumen' && <section className={styles.section}><div className={styles.summaryGrid}><article><h3>Información general</h3><dl><dt>Estado</dt><dd><Status value={project.status} /></dd><dt>Prioridad</dt><dd>{priorityText(project.priority)}</dd><dt>Modelo de ganancia</dt><dd>{profitModeText(project.profit_mode)}</dd><dt>Ganancia proyectada</dt><dd>{money(financial.projected_profit)}</dd></dl></article><article><h3>Observaciones</h3><p>{project.observations || 'Sin observaciones registradas.'}</p><h3>Tiempo invertido</h3><p>{bogotaDateText(project.start_date)} a {bogotaDateText(project.expected_end_date)}</p></article></div><div className={styles.bars}><FinancialBar label="Cobrado" value={financial.paid} total={project.project_value} valueLabel={`${money(financial.paid)} · ${percentLabel(financial.paid, project.project_value)}`} /><FinancialBar label="Saldo" value={financial.balance} total={project.project_value} valueLabel={`${money(financial.balance)} · ${percentLabel(financial.balance, project.project_value)}`} /><FinancialBar label="Presupuesto" value={financial.budget} total={project.project_value} valueLabel={`${money(financial.budget)} · ${budgetPercent === null ? 'No calculable' : `${budgetPercent.toFixed(1).replace(/\.0$/, '')}%`}`} /></div></section>}

    {tab === 'anticipos' && <section className={styles.section}><SectionHead title="Anticipos" total={money(financial.paid)} action="Registrar anticipo" onClick={() => setRecordDialog('payment')} /><SimpleTable label="Anticipos registrados" columns={['Fecha', 'Valor', 'Medio de pago', 'Observación']} rows={payments.map((row) => [bogotaDateText(row.payment_date), money(row.amount), row.payment_method, row.note || '—'])} /></section>}

    {tab === 'gastos' && <section className={styles.section}><div className={styles.twoCol}><article><SectionHead title="Gastos reales" total={money(financial.expenses)} action="Registrar gasto" onClick={() => setRecordDialog('expense')} /><SimpleTable label="Gastos registrados" columns={['Fecha', 'Categoría', 'Valor', 'Descripción']} rows={expenses.map((row) => [bogotaDateText(row.expense_date), row.category, money(row.amount), row.note || '—'])} /></article><article><SectionHead title="Presupuesto de costos" total={money(financial.budget)} action="Presupuestar" onClick={() => setRecordDialog('budget')} /><SimpleTable label="Presupuesto registrado" columns={['Categoría', 'Costo base', 'Valor incrementado', 'Descripción']} rows={budgets.map((row) => [row.category, money(row.amount ?? row.base_total ?? 0), row.final_total ? money(row.final_total) : '—', row.note || '—'])} /></article></div></section>}

    {tab === 'distribucion' && <section className={styles.section}><SectionHead title="Distribución del proyecto" total={`${shares.length} registros`} action="Registrar participación" onClick={() => setRecordDialog('share')} /><div className={styles.distributionGrid}>{shares.length ? shares.map((row) => { const base = row.basis === 'project_value' ? project.project_value : financial.real_profit; return <article key={row.id}><strong>{row.participant}</strong><span>{shareModeText(row.mode)} · {shareBasisText(row.basis)}</span><b>{money(shareAmount(row.mode, row.value, base))}</b><small>{row.is_paid ? 'Pagada' : 'Pendiente'}{row.paid_on ? ` · ${bogotaDateText(row.paid_on)}` : ''}</small></article>; }) : <p className={styles.empty}>Aún no hay participaciones.</p>}</div></section>}

    {tab === 'fechas' && <section className={styles.section}><dl className={styles.dateGrid}><dt>Inicio</dt><dd>{bogotaDateText(project.start_date)}</dd><dt>Final prevista</dt><dd>{bogotaDateText(project.expected_end_date)}</dd><dt>Final real</dt><dd>{bogotaDateText(project.actual_end_date)}</dd><dt>Duración</dt><dd>{duration(project.start_date, project.expected_end_date)} días</dd><dt>Retraso</dt><dd>{delayDays(project) ? `${delayDays(project)} días` : '—'}</dd><dt>Prioridad</dt><dd>{priorityText(project.priority)}</dd><dt>Observaciones</dt><dd>{project.observations || 'Sin observaciones registradas.'}</dd></dl></section>}

    <Dialog open={projectDialog} title={projectId ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={() => projectId ? setProjectDialog(false) : router.push('/proyectos')} initialFocusRef={first}><ProjectForm clients={clients} defaults={defaults} pending={pending} submitProject={submitProject} first={first} /></Dialog>
    <Dialog open={recordDialog !== null} title={recordTitle(recordDialog)} onClose={() => setRecordDialog(null)}>{recordDialog && <RecordForm kind={recordDialog} pending={pending} submitRecord={submitRecord} />}</Dialog>
  </section>;
}

function ProjectForm({ clients, defaults, pending, submitProject, first }: { clients: Client[]; defaults: Record<string, string>; pending: boolean; submitProject: (event: FormEvent<HTMLFormElement>) => void; first: React.RefObject<HTMLInputElement | null> }) {
  return <form onSubmit={submitProject} className={styles.form}>
    <label>Cliente<select name="client_id" defaultValue={defaults.client_id} required><option value="">Seleccione un cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
    <label>Título<input ref={first} name="title" defaultValue={defaults.title} required /></label>
    <label>Valor contratado<input name="project_value" type="number" min="0" step="0.01" defaultValue={defaults.project_value} required /></label>
    <label>Estado<select name="status" defaultValue={defaults.status}>{projectStatuses.map((value) => <option key={value} value={value}>{projectStatusText(value)}</option>)}</select></label>
    <label>Prioridad<select name="priority" defaultValue={defaults.priority}>{priorities.map((value) => <option key={value} value={value}>{priorityText(value)}</option>)}</select></label>
    <label>Responsable<input name="responsible" defaultValue={defaults.responsible} /></label>
    <label>Lugar de ejecución<input name="location" defaultValue={defaults.location} /></label>
    <label>Inicio<input name="start_date" type="date" defaultValue={defaults.start_date} required /></label><label>Final prevista<input name="expected_end_date" type="date" defaultValue={defaults.expected_end_date} required /></label><label>Final real<input name="actual_end_date" type="date" defaultValue={defaults.actual_end_date} /></label><label>Modelo de ganancia<select name="profit_mode" defaultValue={defaults.profit_mode}><option value="value">Valor del proyecto</option><option value="manual">Ganancia manual</option></select></label>
    <label>Ganancia inicial manual<input name="initial_profit" type="number" min="0" step="0.01" defaultValue={defaults.initial_profit} required /></label>
    <label className={styles.full}>Observaciones<textarea name="observations" defaultValue={defaults.observations} rows={3} /></label>
    <button className={styles.primary} disabled={pending}>{pending ? 'Guardando…' : 'Guardar proyecto'}</button>
  </form>;
}

function RecordForm({ kind, pending, submitRecord }: { kind: RecordKind; pending: boolean; submitRecord: (kind: RecordKind, event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={(event) => submitRecord(kind, event)} className={styles.compact}>{kind === 'payment' && <><label>Fecha<input name="payment_date" type="date" defaultValue={today()} required /></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Medio de pago<PaymentMethod /></label><label>Observación<input name="note" /></label></>}{kind === 'expense' && <><label>Fecha<input name="expense_date" type="date" defaultValue={today()} required /></label><label>Categoría<input name="category" required /></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Medio de pago<PaymentMethod /></label><label>Descripción<input name="note" /></label></>}{kind === 'budget' && <><label>Categoría<input name="category" required /></label><label>Valor presupuestado<input name="amount" type="number" min="0" step="0.01" required /></label><label>Descripción<input name="note" /></label></>}{kind === 'share' && <><label>Participante<input name="participant" required /></label><label>Modalidad<select name="mode"><option value="percent">Porcentaje</option><option value="fixed">Valor fijo</option></select></label><label>Valor<input name="value" type="number" min="0" step="0.01" required /></label><label>Base<select name="basis"><option value="project_value">Valor del proyecto</option><option value="real_profit">Ganancia real</option></select></label><label className={styles.checkbox}><input name="is_paid" type="checkbox" /> Pagada</label><label>Fecha de pago<input name="paid_on" type="date" /></label></>}<button className={styles.primary} disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button></form>;
}

function PaymentMethod() { return <select name="payment_method" defaultValue="Transferencia"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option><option>Otro</option></select>; }
function SectionHead({ title, total, action, onClick }: { title: string; total: string; action: string; onClick: () => void }) { return <div className={styles.sectionHead}><h3>{title} · {total}</h3><button type="button" className={styles.secondary} onClick={onClick}>{action}</button></div>; }
function SimpleTable({ label, columns, rows }: { label: string; columns: string[]; rows: React.ReactNode[][] }) { return <div className={styles.tableWrap}><table><caption className="srOnly">{label}</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length}>Sin registros</td></tr>}</tbody></table></div>; }
function recordTitle(kind: RecordKind | null) { return kind === 'payment' ? 'Registrar anticipo' : kind === 'expense' ? 'Registrar gasto' : kind === 'budget' ? 'Agregar presupuesto' : kind === 'share' ? 'Registrar participación' : 'Registrar'; }
function duration(start: string, end: string) { return Math.max(0, Math.round((new Date(`${end}T12:00:00-05:00`).getTime() - new Date(`${start}T12:00:00-05:00`).getTime()) / 86400000)); }
function delayDays(project: { status: string; expected_end_date: string; actual_end_date?: string | null }) { const comparison = project.status === 'finished' ? project.actual_end_date : today(); if (!comparison || comparison <= project.expected_end_date || ['draft', 'quoted', 'cancelled'].includes(project.status)) return 0; return duration(project.expected_end_date, comparison); }


