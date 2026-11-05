import styles from './FileUploadStatus.module.css';

export type FileUploadState = {
  phase: 'selected' | 'preparing' | 'uploading' | 'saving' | 'success' | 'error';
  percent: number;
};

const messages: Record<FileUploadState['phase'], string> = {
  selected: 'Archivo seleccionado correctamente. Pendiente de guardar',
  preparing: 'Preparando carga…',
  uploading: 'Cargando archivo…',
  saving: 'Carga completada. Guardando…',
  success: 'Archivo cargado y guardado correctamente',
  error: 'No se pudo completar el guardado. Puede reintentar.',
};

export function FileUploadStatus({ state }: { state: FileUploadState }) {
  const percent = Math.max(0, Math.min(100, state.percent));
  return <div className={styles.status} data-state={state.phase}>
    <p role="status">{messages[state.phase]}</p>
    {state.phase !== 'selected' && <>
      <progress className={styles.progress} max={100} value={percent} aria-label="Progreso de carga del archivo" aria-valuetext={`${percent}% transferido. ${messages[state.phase]}`} />
      <span aria-hidden="true">{percent}%</span>
    </>}
  </div>;
}
