'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AnalysisReportDialog.module.css';
import { Button } from '../ui/Controls';

export function AnalysisReportDialog({ open, src, onClose }: { open: boolean; src: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => { const node = dialog.current; if (!node) return; if (open) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; if (!node.open) node.showModal(); } else if (node.open) { node.close(); opener.current?.focus(); } }, [open]);
  function loaded() { try { const doc = frame.current?.contentDocument; setState(doc?.querySelector('.analysis-print-root') ? 'ready' : 'error'); } catch { setState('error'); } }
  return <dialog ref={dialog} className={styles.dialog} aria-label="Vista previa del informe" onCancel={(event) => { event.preventDefault(); onClose(); }}><header><strong>Vista previa del informe</strong><div><Button type="button" variant="primary" disabled={state !== 'ready'} onClick={() => frame.current?.contentWindow?.print()}>Imprimir / guardar PDF</Button><Button type="button" onClick={onClose}>Volver a Análisis</Button></div></header>{state === 'loading' && <p role="status">Cargando informe…</p>}{state === 'error' && <p role="alert">No fue posible cargar el informe. Cierre esta vista e inténtelo de nuevo.</p>}{open && <iframe ref={frame} title="Informe de Análisis" src={`${src}&preview=1`} onLoad={loaded} />}</dialog>;
}
