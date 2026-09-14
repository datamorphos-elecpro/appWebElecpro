'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.css';

type DialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

/** Native modal dialog with predictable focus and an Escape/Cancel path. */
export function Dialog({ open, title, children, onClose, initialFocusRef }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      window.setTimeout(() => openerRef.current?.focus());
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const timer = window.setTimeout(() => {
      const target = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>('[autofocus], input, select, textarea, button');
      target?.focus();
    });
    return () => window.clearTimeout(timer);
  }, [initialFocusRef, open]);

  useEffect(() => () => { if (dialogRef.current?.open) dialogRef.current.close(); }, []);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
    window.setTimeout(() => openerRef.current?.focus());
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); requestClose(); }} onClose={() => { if (open) onClose(); }}>
    <header className={styles.header}><h2 id={titleId}>{title}</h2><button type="button" className={styles.close} onClick={requestClose} aria-label="Cerrar diálogo"><span aria-hidden="true">×</span></button></header>
    <div className={styles.body}>{children}</div>
  </dialog>;
}
