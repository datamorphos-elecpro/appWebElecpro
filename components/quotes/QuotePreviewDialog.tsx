'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './QuotePreviewDialog.module.css';

export function QuotePreviewDialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
  }, [open]);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
    window.setTimeout(() => openerRef.current?.focus());
  }

  return <dialog
    ref={dialogRef}
    className={styles.dialog}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={() => { if (open) onClose(); }}
  >
    <header className={styles.header}>
      <strong id={titleId}>{title}</strong>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => window.print()}>Imprimir / guardar PDF</button>
        <button type="button" className={styles.primary} onClick={close}>Volver a editar</button>
      </div>
    </header>
    <div className={styles.scroll}><div className={styles.print}>{children}</div></div>
  </dialog>;
}
