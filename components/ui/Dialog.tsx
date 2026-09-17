'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.css';

type DialogProps = { open: boolean; title: string; children: ReactNode; onClose: () => void; initialFocusRef?: React.RefObject<HTMLElement | null>; locked?: boolean };

/** Native modal dialog with focus restoration and a lock for in-flight mutations. */
export function Dialog({ open, title, children, onClose, initialFocusRef, locked = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closingProgrammatically = useRef(false);
  const titleId = useId();
  const restoreFocus = () => window.setTimeout(() => openerRef.current?.focus());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) { closingProgrammatically.current = true; dialog.close(); }
      restoreFocus();
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const timer = window.setTimeout(() => (initialFocusRef?.current ?? dialog.querySelector<HTMLElement>('[autofocus], input, select, textarea, button'))?.focus());
    return () => window.clearTimeout(timer);
  }, [initialFocusRef, open]);

  useEffect(() => () => { if (dialogRef.current?.open) dialogRef.current.close(); restoreFocus(); }, []);
  function requestClose() { if (!locked) onClose(); }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    onClose={() => { if (closingProgrammatically.current) { closingProgrammatically.current = false; return; } if (open && !locked) onClose(); }}>
    <header className={styles.header}><h2 id={titleId}>{title}</h2><button type="button" className={styles.close} onClick={requestClose} disabled={locked} aria-label="Cerrar diálogo"><span aria-hidden="true">×</span></button></header>
    <div className={styles.body}>{children}</div>
  </dialog>;
}
