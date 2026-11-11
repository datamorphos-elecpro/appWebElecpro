'use client';
import { useEffect, useState } from 'react';
import { canPreviewFile } from '../../lib/project-files';
import type { PreviewFile } from '../../lib/project-reporting';
import { Dialog } from '../ui/Dialog';
import styles from './ProjectFilesPanel.module.css';

export function FilePreview({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const endpoint = `/api/proyectos/archivos/${file.id}`;
  useEffect(() => {
    if (!canPreviewFile(file.mime_type)) return;
    const controller = new AbortController();
    void fetch(`${endpoint}?format=json`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setUrl(body.url);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No fue posible mostrar la vista previa.'); });
    return () => controller.abort();
  }, [endpoint, attempt, file.mime_type]);
  return <Dialog open title={file.original_name} onClose={onClose} wide><div className={styles.preview}>
    <div className={styles.actions}><a href={`${endpoint}?download=1`} target="_blank" rel="noopener noreferrer">Descargar archivo</a>{canPreviewFile(file.mime_type) && <button type="button" onClick={() => { setUrl(''); setError(''); setAttempt((value) => value + 1); }}>Actualizar vista previa</button>}</div>
    {error && <p role="alert">{error} Puede descargar el archivo.</p>}
    {!canPreviewFile(file.mime_type) ? <p>Este formato está disponible para descarga.</p> : !url && !error ? <p role="status">Cargando vista previa…</p> : url && (file.mime_type === 'application/pdf'
      ? <><iframe src={url} title={`Vista previa de ${file.original_name}`} /><p>Si su navegador no muestra el PDF, use Descargar archivo.</p></>
      // Native images preserve the authenticated, short-lived URL without an image proxy.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={url} alt={file.original_name} onError={() => setError('No se pudo mostrar la imagen.')} />)}
  </div></Dialog>;
}
