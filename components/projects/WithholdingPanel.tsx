'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerWithholding, voidWithholding } from '../../app/actions/withholdings';
import { decimal } from '../../lib/calculations';
import { useNativeFormDraft } from '../../lib/local-draft';
import { bogotaDate, money } from '../../lib/money';
import { bogotaDateText } from '../../lib/presentation';
import { withholdingSchema, withholdingTypes, type ProjectWithholding } from '../../lib/validators/withholding';
import type { PageInfo } from '../../lib/pagination';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Controls';
import { Pagination } from '../ui/Pagination';
import styles from './ProjectWorkspace.module.css';

export function WithholdingPanel({ projectId, balance, withheld, result }: {
  projectId: string; balance: string; withheld: string; result?: { records: ProjectWithholding[]; page: PageInfo };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState<ProjectWithholding | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  return <article className={styles.withholdingPanel}>
    <div className={styles.sectionHead}><h3>Retenciones vigentes · {money(withheld)}</h3><Button type="button" onClick={() => setOpen(true)}>Registrar retención</Button></div>
    <p>Cartera disponible: <strong>{money(balance)}</strong>. Las retenciones reducen cartera; el efectivo recibido se muestra en anticipos.</p>
    {notice && <p role="status">{notice}</p>}
    <div className={styles.tableWrap}><table><caption className="srOnly">Retenciones registradas</caption><thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Observación</th><th>Estado</th><th>Acción</th></tr></thead>
      <tbody>{result?.records.length ? result.records.map((row) => <tr key={row.id}><td>{bogotaDateText(row.withholding_date)}</td><td>{withholdingTypes.find((type) => type.value === row.kind)?.label}</td><td>{money(row.amount)}</td><td>{row.note || '—'}</td><td>{row.voided_at ? <>Anulada · {bogotaDateText(row.voided_at)}<br />{row.void_reason}</> : 'Vigente'}</td><td>{!row.voided_at && <Button type="button" onClick={() => { setVoiding(row); setReason(''); }}>Anular</Button>}</td></tr>) : <tr><td colSpan={6}>Sin retenciones registradas.</td></tr>}</tbody>
    </table></div>
    {result && <Pagination page={result.page} pageParam="withholdings_page" />}
    {open && <WithholdingForm projectId={projectId} balance={balance} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setNotice('Retención registrada.'); router.refresh(); }} />}
    {voiding && <ConfirmationDialog open title="Anular retención" description="La retención dejará de descontarse de cartera. Su historial se conservará." recordName={money(voiding.amount)} variant="danger" confirmLabel="Anular retención" onClose={() => setVoiding(null)} detail={<label>Motivo de anulación<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>} onConfirm={async () => { await voidWithholding({ id: voiding.id, reason }); setVoiding(null); setNotice('Retención anulada.'); router.refresh(); }} />}
  </article>;
}

function WithholdingForm({ projectId, balance, onClose, onSaved }: { projectId: string; balance: string; onClose: () => void; onSaved: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState('income');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Record<string, FormDataEntryValue> | null>(null);
  const { formRef, available, capture, restore, discard, clearDraft } = useNativeFormDraft('project-withholding', projectId, '', (values) => setKind(values.kind || 'income'));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = withholdingSchema.safeParse({ ...input, project_id: projectId });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (decimal(parsed.data.amount).gt(balance)) { setError(`La retención supera la cartera disponible: ${money(balance)}.`); return; }
    setError(''); setConfirmation(input);
  }
  return <><Dialog open title="Registrar retención" onClose={onClose}><form ref={formRef} className={styles.compact} onInput={capture} onChange={capture} onSubmit={submit}>
    {available && <p role="status">Borrador disponible <button type="button" onClick={restore}>Recuperar</button><button type="button" onClick={discard}>Descartar</button></p>}
    <input name="request_id" type="hidden" defaultValue={requestId} />
    <label>Fecha<input name="withholding_date" type="date" required defaultValue={bogotaDate()} /></label>
    <label>Tipo de retención<select name="kind" defaultValue="income" onChange={(event) => setKind(event.target.value)}>{withholdingTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
    <label>Valor retenido<input name="amount" type="number" min="0.01" step="0.01" required /></label>
    <label className={styles.full}>Observación{kind === 'other' ? ' (obligatoria)' : ''}<textarea name="note" required={kind === 'other'} rows={3} /></label>
    <p className={styles.full}>Cartera disponible: {money(balance)}</p>{error && <p className={styles.full} role="alert">{error}</p>}
    <Button type="button" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary">Guardar retención</Button>
  </form></Dialog>{confirmation && <ConfirmationDialog open title="Confirmar retención" description="Se descontará este valor de cartera sin modificar caja ni ganancia." recordName={money(String(confirmation.amount))} confirmLabel="Registrar retención" onClose={() => setConfirmation(null)} onConfirm={async () => { await registerWithholding({ ...confirmation, project_id: projectId }); clearDraft(); onSaved(); }} />}</>;
}
