'use client';

import { useRef } from 'react';
import { Dialog } from './Dialog';
import styles from './ConfirmationDialog.module.css';

type ConfirmationDialogProps = { open: boolean; title: string; description: string; recordName: string; confirmLabel: string; variant?: 'warning' | 'danger'; pending?: boolean; onClose: () => void; onConfirm: () => void | Promise<void> };

export function ConfirmationDialog({ open, title, description, recordName, confirmLabel, variant = 'warning', pending = false, onClose, onConfirm }: ConfirmationDialogProps) {
  const button = useRef<HTMLButtonElement>(null);
  return <Dialog open={open} title={title} onClose={pending ? () => undefined : onClose} initialFocusRef={button}>
    <div className={styles.content}><p>{description}</p><strong className={styles.name}>{recordName}</strong>
      <div className={styles.actions}><button type="button" onClick={onClose} disabled={pending}>Cancelar</button><button ref={button} type="button" className={variant === 'danger' ? styles.danger : styles.warning} onClick={() => void onConfirm()} disabled={pending}>{pending ? 'Procesando…' : confirmLabel}</button></div>
    </div>
  </Dialog>;
}
