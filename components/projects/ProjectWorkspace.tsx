'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProject, saveProjectRecord } from '../../app/actions/projects';
import { money } from '../../lib/money';
import styles from './ProjectWorkspace.module.css';

type Client = { id: string; name: string; address?: string | null };
type Props = { project?: any; clients: Client[]; summary?: any; payments?: any[]; expenses?: any[]; budgets?: any[]; shares?: any[] };
const labels: Record<string, string> = { draft: 'Borrador', quoted: 'Cotizado', approved: 'Aprobado', in_progress: 'En proceso', paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado', low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Cr?tica' };

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()); }
function inThirtyDays() { const date = new Date(); date.setDate(date.getDate() + 30); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date); }
function formValues(event: FormEvent<HTMLFormElement>) { return Object.fromEntries(new FormData(event.currentTarget)); }

export function ProjectWorkspace({ project, clients, summary, payments = [], expenses = [], budgets = [], shares = [] }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState('resumen');
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState('');
  const projectId = project?.id as string | undefined;
  const defaults = useMemo(() => ({
    client_id: project?.client_id ?? clients[0]?.id ?? '', title: project?.title ?? '', project_value: String(project?.project_value ?? '0'),
    status: project?.status ?? 'draft', priority: project?.priority ?? 'medium', responsible: project?.responsible ?? '', location: project?.location ?? '',
    start_date: project?.start_date ?? today(), expected_end_date: project?.expected_end_date ?? inThirtyDays(), actual_end_date: project?.actual_end_date ?? '',
    observations: project?.observations ?? '', profit_mode: project?.profit_mode ?? 'value', initial_profit: String(project?.initial_profit ?? '0'),
  }), [project, clients]);

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { ...formValues(event), id: projectId };
    start(async () => { try { const saved = await saveProject(value); setNotice('Proyecto guardado.'); if (!projectId) router.push(`/proyectos/${saved.id}`); } catch (error) { setNotice(error instanceof Error ? error.message : 'No fue posible guardar el proyecto.'); } });
  }
  function submitRecord(kind: 'payment' | 'expense' | 'budget' | 'share', event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const form = event.currentTarget;
    const value = formValues(event) as Record<string, string | boolean>;
    if (kind === 'share') value.is_paid = value.is_paid === 'on' ? true : false;
    start(async () => { try { await saveProjectRecord(kind, { ...value, project_id: projectId }); form.reset(); setNotice('Movimiento registrado.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'No fue posible registrar el movimiento.'); } });
  }

  return <section className={styles.workspace}>
    <nav aria-label="Secciones del proyecto" className={styles.tabs}>{[['resumen', 'Resumen'], ['anticipos', 'Anticipos'], ['gastos', 'Gastos y presupuesto'], ['distribucion', 'Distribuci?n'], ['fechas', 'Fechas y condiciones']].map(([id, label]) => <button key={id} type="button" className={tab === id ? styles.active : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {tab === 'resumen' && <form onSubmit={submitProject} className={styles.form}>
      <h2>{projectId ? 'Editar proyecto' : 'Crear proyecto'}</h2>
      <label>Cliente<select name="client_id" defaultValue={defaults.client_id} required><option value="">Seleccione un cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
      <label>T?tulo<input name="title" defaultValue={defaults.title} required /></label>
      <label>Valor contratado<input name="project_value" type="number" min="0" step="0.01" defaultValue={defaults.project_value} required /></label>
      <label>Estado<select name="status" defaultValue={defaults.status}>{Object.entries(labels).slice(0, 7).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Prioridad<select name="priority" defaultValue={defaults.priority}>{Object.entries(labels).slice(7).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Responsable<input name="responsible" defaultValue={defaults.responsible} /></label>
      <label>Lugar de ejecuci?n<input name="location" defaultValue={defaults.location} /></label>
      <label>Inicio<input name="start_date" type="date" defaultValue={defaults.start_date} required /></label><label>Final prevista<input name="expected_end_date" type="date" defaultValue={defaults.expected_end_date} required /></label><label>Final real<input name="actual_end_date" type="date" defaultValue={defaults.actual_end_date} /></label><label>Modelo de ganancia<select name="profit_mode" defaultValue={defaults.profit_mode}><option value="value">Valor del proyecto</option><option value="manual">Ganancia manual</option></select></label>
      <label>Ganancia inicial manual<input name="initial_profit" type="number" min="0" step="0.01" defaultValue={defaults.initial_profit} required /></label>
      <label className={styles.full}>Observaciones<textarea name="observations" defaultValue={defaults.observations} rows={3} /></label>
      <button className={styles.primary} disabled={pending}>{pending ? 'Guardando?' : 'Guardar proyecto'}</button>
      {projectId && <div className={styles.totals}><span>Pagado <b>{money(summary?.paid ?? 0)}</b></span><span>Saldo <b>{money(summary?.balance ?? 0)}</b></span><span>Ganancia actual <b>{money(summary?.real_profit ?? 0)}</b></span></div>}
    </form>}
    {tab === 'anticipos' && <section className={styles.section}><h2>Anticipos y cobros</h2>{projectId ? <form onSubmit={(event) => submitRecord('payment', event)} className={styles.compact}><label>Fecha<input name="payment_date" type="date" defaultValue={today()} required /></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Medio de pago<select name="payment_method" defaultValue="Transferencia"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option><option>Otro</option></select></label><label>Observaci?n<input name="note" /></label><button className={styles.primary} disabled={pending}>Registrar anticipo</button></form> : <p>Guarde el proyecto para registrar movimientos.</p>}<RecordList rows={payments} date="payment_date" amount="amount" /></section>}
    {tab === 'gastos' && <section className={styles.section}><h2>Gastos y presupuesto</h2>{projectId && <><form onSubmit={(event) => submitRecord('expense', event)} className={styles.compact}><label>Fecha<input name="expense_date" type="date" defaultValue={today()} required /></label><label>Categor?a<input name="category" required /></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Medio de pago<select name="payment_method" defaultValue="Transferencia"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option><option>Otro</option></select></label><label>Descripci?n<input name="note" /></label><button className={styles.primary} disabled={pending}>Registrar gasto</button></form><form onSubmit={(event) => submitRecord('budget', event)} className={styles.compact}><label>Categor?a<input name="category" required /></label><label>Valor presupuestado<input name="amount" type="number" min="0" step="0.01" required /></label><label>Descripci?n<input name="note" /></label><button className={styles.secondary} disabled={pending}>Agregar presupuesto</button></form></>}<h3>Gastos registrados</h3><RecordList rows={expenses} date="expense_date" amount="amount" /><h3>Presupuesto</h3><RecordList rows={budgets} amount="amount" /></section>}
    {tab === 'distribucion' && <section className={styles.section}><h2>Distribuci?n del proyecto</h2>{projectId && <form onSubmit={(event) => submitRecord('share', event)} className={styles.compact}><label>Participante<input name="participant" required /></label><label>Modo<select name="mode"><option value="percent">Porcentaje</option><option value="fixed">Valor fijo</option></select></label><label>Valor<input name="value" type="number" min="0" step="0.01" required /></label><label>Base<select name="basis"><option value="project_value">Valor del proyecto</option><option value="real_profit">Ganancia real</option></select></label><label><input name="is_paid" type="checkbox" /> Pagado</label><label>Fecha de pago<input name="paid_on" type="date" /></label><button className={styles.primary} disabled={pending}>Registrar participaci?n</button></form>}<ShareList rows={shares} projectValue={project?.project_value ?? 0} realProfit={summary?.real_profit ?? 0} /></section>}
    {tab === 'fechas' && <form onSubmit={submitProject} className={styles.form}><h2>Fechas y condiciones</h2><input type="hidden" name="client_id" value={defaults.client_id}/><input type="hidden" name="title" value={defaults.title}/><input type="hidden" name="project_value" value={defaults.project_value}/><input type="hidden" name="status" value={defaults.status}/><input type="hidden" name="priority" value={defaults.priority}/><input type="hidden" name="responsible" value={defaults.responsible}/><input type="hidden" name="location" value={defaults.location}/><input type="hidden" name="profit_mode" value={defaults.profit_mode}/><input type="hidden" name="initial_profit" value={defaults.initial_profit}/><input type="hidden" name="observations" value={defaults.observations}/><label>Inicio<input name="start_date" type="date" defaultValue={defaults.start_date} required /></label><label>Final prevista<input name="expected_end_date" type="date" defaultValue={defaults.expected_end_date} required /></label><label>Final real<input name="actual_end_date" type="date" defaultValue={defaults.actual_end_date} /></label><button className={styles.primary} disabled={pending}>Guardar fechas</button></form>}
  </section>;
}

function RecordList({ rows, date, amount }: { rows: any[]; date?: string; amount: string }) { return rows.length ? <div className={styles.records}>{rows.map((row) => <article key={row.id}><span>{date ? row[date] : row.category ?? row.participant}</span><b>{money(row[amount])}</b><small>{row.note ?? row.payment_method ?? row.mode}</small></article>)}</div> : <p className={styles.empty}>A?n no hay registros.</p>; }

function ShareList({ rows, projectValue, realProfit }: { rows: any[]; projectValue: any; realProfit: any }) {
  if (!rows.length) return <p className={styles.empty}>Aún no hay participaciones.</p>;
  return <div className={styles.records}>{rows.map(row => { const base = row.basis === 'project_value' ? Number(projectValue) : Number(realProfit); const amount = row.mode === 'percent' ? base * Number(row.value) / 100 : Number(row.value); return <article key={row.id}><span>{row.participant}</span><b>{money(amount)}</b><small>{row.mode === 'percent' ? `${row.value}%` : 'Valor fijo'} · {row.basis === 'project_value' ? 'Valor contratado' : 'Ganancia real'} · {row.is_paid ? 'Pagada' : 'Pendiente'}{row.paid_on ? ` (${row.paid_on})` : ''}</small></article>; })}</div>;
}