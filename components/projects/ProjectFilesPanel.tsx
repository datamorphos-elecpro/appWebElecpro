'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { changeProjectFile, cleanupProjectFiles, finishProjectFile } from '../../app/actions/project-files';
import { attachmentAccept, attachmentTypeName, canPreviewFile, fileSizeText, validateProjectFile, type AttachmentType, type ProjectFile, type ProjectFileKind } from '../../lib/project-files';
import { uploadProjectFile, type FileUploadAttempt } from '../../lib/project-file-upload';
import type { PageInfo } from '../../lib/pagination';
import { bogotaDateText } from '../../lib/presentation';
import { Dialog } from '../ui/Dialog';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { Pagination } from '../ui/Pagination';
import { Icon, type IconName } from '../ui/Icon';
import styles from './ProjectFilesPanel.module.css';
import workspaceStyles from './ProjectWorkspace.module.css';

export function FilePicker({ kind, file, onChange, disabled = false }: { kind: ProjectFileKind; file: File | null; onChange: (file: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId(); const helpId = useId();
  const [error, setError] = useState('');
  return <div className={styles.picker}><strong id={labelId}>{kind === 'receipt' ? 'Soporte de pago (opcional)' : 'Archivo'}</strong><input ref={input} type="file" hidden aria-labelledby={labelId} name={kind === 'receipt' ? 'support_file' : 'attachment_file'} accept={kind === 'receipt' ? '.pdf,application/pdf' : attachmentAccept} disabled={disabled} onChange={(event) => {
    const next = event.target.files?.[0] ?? null;
    try { if (next) validateProjectFile(next, kind); setError(''); onChange(next); }
    catch (reason) { event.target.value = ''; onChange(null); setError(reason instanceof Error ? reason.message : 'Archivo no válido.'); }
  }} /><button type="button" aria-label={kind === 'receipt' ? 'Seleccionar soporte de pago' : 'Seleccionar archivo adjunto'} aria-describedby={helpId} disabled={disabled} onClick={() => input.current?.click()}>Seleccionar archivo</button><small id={helpId}>{kind === 'receipt' ? 'Un PDF de máximo 10 MB.' : 'PDF, imágenes JPG/PNG, Word, Excel, DWG, DXF o ZIP. Máximo 50 MB.'}</small>
    {file && <div className={styles.actions}><span>{file.name} · {fileSizeText(file.size)}</span><button type="button" disabled={disabled} onClick={() => { if (input.current) input.current.value = ''; setError(''); onChange(null); }}>Retirar selección</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function FilePreview({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
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

function TypeSelector({ types, value, onChange }: { types: AttachmentType[]; value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const listId = useId(); const inputRef = useRef<HTMLInputElement>(null); const optionsRef = useRef<HTMLDivElement>(null);
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  const query = normalize(value); const matches = types.filter((type) => normalize(type.name).includes(query));
  const existing = types.some((type) => normalize(type.name) === query);
  function choose(name: string) { onChange(name); inputRef.current?.focus(); setOpen(false); }
  function optionKey(event: KeyboardEvent<HTMLButtonElement>) {
    const options = Array.from(optionsRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? []);
    const index = options.indexOf(event.currentTarget);
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); inputRef.current?.focus(); setOpen(false); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; options[next]?.focus();
    }
  }
  return <div className={styles.typeSelect}><label>Tipo de documento<input ref={inputRef} value={value} maxLength={100} required role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => optionsRef.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus()); } }} /></label>
    {open && <div ref={optionsRef} id={listId} className={styles.options} role="listbox" aria-label="Tipos de documento">{matches.map((type) => <button role="option" aria-selected={normalize(type.name) === query} onKeyDown={optionKey} type="button" key={type.id} onClick={() => choose(type.name)}>{type.name}</button>)}{query && !existing && <button role="option" aria-selected={false} onKeyDown={optionKey} type="button" onClick={() => choose(value.trim().replace(/\s+/g, ' '))}>Crear «{value.trim()}»</button>}</div>}
    <small>Los tipos nuevos quedan disponibles para todos los proyectos al guardar.</small>
  </div>;
}

export function ProjectFileEditor({ projectId, kind, paymentId, existing, types = [], onClose }: { projectId: string; kind: ProjectFileKind; paymentId?: string; existing?: ProjectFile; types?: AttachmentType[]; onClose: () => void }) {
  const router = useRouter(); const [file, setFile] = useState<File | null>(null); const [typeName, setTypeName] = useState(existing?.project_attachment_types?.name ?? '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [confirm, setConfirm] = useState(false);
  const attempt = useRef<FileUploadAttempt>({ id: crypto.randomUUID() });
  const needsFile = !existing || kind === 'receipt';
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try {
      if (file) {
        const id = await uploadProjectFile(file, { projectId, kind, paymentId, replacesId: existing?.id, expectedUpdatedAt: existing?.updated_at }, attempt.current, setProgress);
        await finishProjectFile({ id, ...(kind === 'attachment' ? { typeName } : {}) });
      } else if (existing && kind === 'attachment') await changeProjectFile({ id: existing.id, expectedUpdatedAt: existing.updated_at, typeName });
      else throw new Error('Seleccione el archivo.');
      router.refresh(); onClose();
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'No fue posible guardar el archivo.'; setError(message); throw reason; }
    finally { setBusy(false); }
  }
  return <><Dialog open title={kind === 'receipt' ? (existing ? 'Reemplazar soporte de pago' : 'Agregar soporte de pago') : (existing ? 'Editar archivo adjunto' : 'Agregar archivo adjunto')} onClose={onClose} locked={busy}>
    <form className={styles.editor} onSubmit={(event) => { event.preventDefault(); try { if (kind === 'attachment') attachmentTypeName.parse(typeName); if (needsFile && !file) throw new Error('Seleccione el archivo.'); setError(''); setConfirm(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Revise los datos.'); } }}>
      {kind === 'attachment' && <TypeSelector types={types} value={typeName} onChange={setTypeName} />}
      {existing && <p>Archivo actual: {existing.original_name}{kind === 'attachment' ? '. Seleccione otro solo si desea reemplazarlo.' : ''}</p>}
      <FilePicker kind={kind} file={file} disabled={busy} onChange={(next) => { setFile(next); attempt.current = { id: crypto.randomUUID() }; setProgress(0); }} />
      {busy && <p role="status">Guardando… {file ? `${progress}%` : ''}</p>}{file && <progress value={progress} max={100} aria-label="Progreso de carga" />}
      {error && <p role="alert">{error}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" disabled={busy}>Guardar</button></div>
    </form>
  </Dialog>{confirm && <ConfirmationDialog open title={existing ? 'Confirmar cambios del archivo' : 'Confirmar archivo'} description={existing && file ? 'El archivo anterior será reemplazado. Se conservará la auditoría del cambio.' : 'Se guardará este documento en el proyecto.'} recordName={file?.name ?? existing?.original_name ?? ''} confirmLabel="Guardar archivo" onClose={() => setConfirm(false)} onConfirm={save} detail={busy ? <p role="status">Cargando y guardando… {progress}%</p> : undefined} />}</>;
}

function PdfIcon({ muted = false }: { muted?: boolean }) { return <svg className={muted ? styles.mutedIcon : styles.pdfIcon} viewBox="0 0 32 36" width="28" height="32" aria-hidden="true"><path d="M5 1h14l8 8v25H5z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M19 1v9h8" fill="none" stroke="currentColor" strokeWidth="2" /><text x="6" y="26" fill="currentColor" fontSize="10" fontWeight="bold">PDF</text></svg>; }

export function PaymentReceiptCell({ projectId, paymentId, file }: { projectId: string; paymentId: string; file?: ProjectFile }) {
  const router = useRouter(); const [preview, setPreview] = useState(false); const [edit, setEdit] = useState(false); const [remove, setRemove] = useState(false);
  return <div className={styles.receipt}>
    {file ? <button type="button" className={styles.fileButton} onClick={() => setPreview(true)} aria-label={`Abrir soporte de pago ${file.original_name}`}><PdfIcon /><span>{file.original_name}</span></button> : <span className={styles.noReceipt}><PdfIcon muted />No tiene soporte de pago</span>}
    <div className={styles.actions}><button type="button" onClick={() => setEdit(true)}>{file ? 'Reemplazar' : 'Agregar soporte'}</button>{file && <><a href={`/api/proyectos/archivos/${file.id}?download=1`} target="_blank" rel="noopener noreferrer">Descargar</a><button type="button" onClick={() => setRemove(true)}>Quitar</button></>}</div>
    {preview && file && <FilePreview file={file} onClose={() => setPreview(false)} />}
    {edit && <ProjectFileEditor projectId={projectId} kind="receipt" paymentId={paymentId} existing={file} onClose={() => setEdit(false)} />}
    {remove && file && <ConfirmationDialog open title="Quitar soporte de pago" description="Se retirará el PDF. Los datos del anticipo se conservarán." recordName={file.original_name} confirmLabel="Quitar soporte" variant="danger" onClose={() => setRemove(false)} onConfirm={async () => { await changeProjectFile({ id: file.id, expectedUpdatedAt: file.updated_at, remove: true }); setRemove(false); router.refresh(); }} />}
  </div>;
}

export function ProjectFilesCleanup({ projectId, revision = '' }: { projectId: string; revision?: string }) {
  const [pending, setPending] = useState(false);
  useEffect(() => { let active = true; void cleanupProjectFiles(projectId).then((result) => { if (active) setPending(result.pending); }).catch(() => { if (active) setPending(true); }); return () => { active = false; }; }, [projectId, revision]);
  return pending ? <p role="status" className={styles.cleanup}>Hay archivos retirados pendientes de limpieza del almacenamiento. <button type="button" onClick={() => { void cleanupProjectFiles(projectId).then((result) => setPending(result.pending)).catch(() => setPending(true)); }}>Reintentar limpieza</button></p> : null;
}

function FileAction({ label, fileName, icon, onClick, href, danger = false }: { label: string; fileName: string; icon: IconName; onClick?: () => void; href?: string; danger?: boolean }) {
  const tooltipId = useId(); const root = useRef<HTMLSpanElement>(null); const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  function cancelClose() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function show() {
    cancelClose(); const rect = root.current?.getBoundingClientRect(); if (!rect) return;
    const above = rect.bottom + 44 > window.innerHeight;
    setPosition({ left: Math.max(64, Math.min(window.innerWidth - 64, rect.left + rect.width / 2)), top: above ? rect.top - 8 : rect.bottom + 8, above });
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, true); window.addEventListener('resize', dismiss); window.addEventListener('keydown', dismissOnEscape);
    return () => { window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); window.removeEventListener('keydown', dismissOnEscape); };
  }, [position]);
  const controlProps = { className: `${styles.iconAction}${danger ? ` ${styles.dangerAction}` : ''}`, 'aria-label': `${label} ${fileName}`, 'aria-describedby': position ? tooltipId : undefined };
  return <span ref={root} className={styles.actionItem} onMouseEnter={show} onMouseLeave={() => { cancelClose(); closeTimer.current = setTimeout(() => { if (!root.current?.contains(document.activeElement)) setPosition(null); }, 150); }} onFocus={() => { show(); requestAnimationFrame(() => { if (root.current?.contains(document.activeElement)) show(); }); }} onBlur={() => setPosition(null)} onClickCapture={() => setPosition(null)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); cancelClose(); setPosition(null); } }}>
    {href ? <a {...controlProps} href={href} target="_blank" rel="noopener noreferrer"><Icon name={icon} /></a> : <button {...controlProps} type="button" onClick={onClick}><Icon name={icon} /></button>}
    {position && createPortal(<span id={tooltipId} role="tooltip" className={styles.actionTooltip} style={{ left: position.left, top: position.top, transform: `translate(-50%, ${position.above ? '-100%' : '0'})` }} onMouseEnter={cancelClose} onMouseLeave={() => { if (!root.current?.contains(document.activeElement)) setPosition(null); }}>{label}</span>, document.body)}
  </span>;
}

export function ProjectFilesPanel({ projectId, result, types }: { projectId: string; result?: { records: ProjectFile[]; page: PageInfo }; types: AttachmentType[] }) {
  const router = useRouter(); const [editor, setEditor] = useState<ProjectFile | 'new' | null>(null); const [preview, setPreview] = useState<ProjectFile | null>(null); const [remove, setRemove] = useState<ProjectFile | null>(null);
  return <section className={workspaceStyles.section}><header className={workspaceStyles.sectionHead}><h3>Archivos Adjuntos · {result?.page.total ?? 0} registros</h3><button type="button" className={workspaceStyles.secondary} onClick={() => setEditor('new')}>Agregar archivo adjunto</button></header>
    <div className={`${workspaceStyles.tableWrap} ${styles.attachmentTable}`}><table><caption className="srOnly">Archivos adjuntos del proyecto</caption><thead><tr>{['Tipo de documento', 'Nombre del archivo', 'Tamaño', 'Fecha de carga', 'Cargado por', 'Acciones'].map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{result?.records.length ? result.records.map((file) => <tr key={file.id}><td>{file.project_attachment_types?.name}</td><td><button type="button" className={styles.fileLink} onClick={() => setPreview(file)}>{file.original_name}</button></td><td>{fileSizeText(file.size_bytes)}</td><td>{bogotaDateText(file.created_at.slice(0, 10))}</td><td>{file.uploader_name || 'Usuario'}</td><td><div className={styles.rowActions}>
      <FileAction label="Abrir" fileName={file.original_name} icon="visibility" onClick={() => setPreview(file)} />
      <FileAction label="Descargar" fileName={file.original_name} icon="download" href={`/api/proyectos/archivos/${file.id}?download=1`} />
      <FileAction label="Editar" fileName={file.original_name} icon="edit" onClick={() => setEditor(file)} />
      <FileAction label="Eliminar" fileName={file.original_name} icon="delete" danger onClick={() => setRemove(file)} />
    </div></td></tr>) : <tr><td colSpan={6}>Aún no hay archivos adjuntos.</td></tr>}</tbody></table></div>
    {result && <Pagination page={result.page} pageParam="attachments_page" />}
    <div className={styles.dialogs}>
    {editor && <ProjectFileEditor projectId={projectId} kind="attachment" existing={editor === 'new' ? undefined : editor} types={types} onClose={() => setEditor(null)} />}
    {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    {remove && <ConfirmationDialog open title="Eliminar archivo adjunto" description="Se eliminará el archivo del proyecto y se conservará la auditoría." recordName={remove.original_name} confirmLabel="Eliminar archivo" variant="danger" onClose={() => setRemove(null)} onConfirm={async () => { await changeProjectFile({ id: remove.id, expectedUpdatedAt: remove.updated_at, remove: true }); setRemove(null); router.refresh(); }} />}
    </div>
  </section>;
}
