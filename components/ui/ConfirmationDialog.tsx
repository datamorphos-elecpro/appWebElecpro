'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import styles from './ConfirmationDialog.module.css';

type ConfirmationDialogProps = { open: boolean; title: string; description: string; detail?: ReactNode; recordName: string; confirmLabel: string; variant?: 'warning' | 'danger'; pending?: boolean; onClose: () => void; onConfirm: () => void | Promise<void> };

/** Keeps a sensitive operation open, locked and retryable until it succeeds. */
export function ConfirmationDialog({ open, title, description, detail, recordName, confirmLabel, variant = 'warning', pending: externalPending = false, onClose, onConfirm: execute }: ConfirmationDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const pending = externalPending || submitting;
  async function confirm() {
    if (pending) return;
    setError(''); setSubmitting(true);
    try { await execute(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible completar la acción.'); }
    finally { setSubmitting(false); }
  }
  return <Dialog open={open} title={title} onClose={onClose} initialFocusRef={variant === 'danger' ? cancelButton : undefined} locked={pending}>
    <div className={styles.content}><p>{description}</p><strong className={styles.name}>{recordName}</strong>{detail}{error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button ref={cancelButton} type="button" onClick={onClose} disabled={pending}>Cancelar</button><button type="button" className={variant === 'danger' ? styles.danger : styles.warning} onClick={() => void confirm()} disabled={pending}>{pending ? 'Procesando…' : confirmLabel}</button></div>
    </div>
  </Dialog>;
}
