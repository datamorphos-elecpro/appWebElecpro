'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProjectPayment, editProjectPayment } from '../../app/actions/project-payments';
import { editPaymentSchema, type ProjectPayment } from '../../lib/validators/payment';
import { money } from '../../lib/money';
import { bogotaDateText } from '../../lib/presentation';
import { Dialog } from '../ui/Dialog';
import { IconAction } from '../ui/IconAction';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import styles from './ProjectWorkspace.module.css';

export function PaymentActions({ payment }: { payment: ProjectPayment }) {
  const router = useRouter();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [edit, setEdit] = useState<ReturnType<typeof editPaymentSchema.parse> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const request = useRef('');
  const identity = () => ({ id: payment.id, project_id: payment.project_id, expected_updated_at: payment.updated_at, request_id: request.current });
  function open(next: 'edit' | 'delete') { request.current = crypto.randomUUID(); setReason(''); setError(''); setMode(next); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { setEdit(editPaymentSchema.parse({ ...Object.fromEntries(new FormData(event.currentTarget)), ...identity() })); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revise los datos.'); }
  }
  return <>
    <div className={styles.paymentActions}><IconAction label="Editar" icon="edit" onClick={() => open('edit')} /><IconAction label="Eliminar" icon="delete" danger onClick={() => open('delete')} /></div>
    {mode === 'edit' && <Dialog open title="Editar anticipo" onClose={() => setMode(null)}><form className={styles.compact} onSubmit={submit}>
      <label>Fecha<input type="date" name="payment_date" defaultValue={payment.payment_date} required /></label>
      <label>Valor<input type="number" name="amount" defaultValue={payment.amount} min="0.01" step="0.01" required /></label>
      <label>Medio de pago<input name="payment_method" defaultValue={payment.payment_method} required /></label>
      <label>Observación<input name="note" defaultValue={payment.note} /></label>
      <p>El soporte se conserva. Puede gestionarlo desde la columna Soporte de pago.</p>
      {error && <p role="alert">{error}</p>}<button type="submit" className={styles.primary}>Guardar cambios</button>
    </form></Dialog>}
    {edit && <ConfirmationDialog open title="Confirmar edición del anticipo" description="Se actualizarán los datos y se recalcularán la cobertura, cartera y caja." recordName={`${bogotaDateText(edit.payment_date)} · ${money(edit.amount)}`} confirmLabel="Guardar cambios" onClose={() => setEdit(null)} onConfirm={async () => { await editProjectPayment(edit); setEdit(null); setMode(null); router.refresh(); }} />}
    {mode === 'delete' && <ConfirmationDialog open title="Eliminar anticipo" variant="danger" description="El anticipo dejará de contabilizarse y quedará oculto. Se conservarán el registro y su soporte para auditoría." recordName={`${bogotaDateText(payment.payment_date)} · ${money(payment.amount)}`} detail={<label>Motivo de eliminación<textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={1000} rows={3} /></label>} confirmLabel="Eliminar anticipo" onClose={() => setMode(null)} onConfirm={async () => { await deleteProjectPayment({ ...identity(), reason }); setMode(null); router.refresh(); }} />}
  </>;
}
