import { validateProjectFile } from '../../lib/project-files';
import type { FileUploadAttempt } from '../../lib/project-file-upload';
export async function uploadProjectFile(file: File, input: { projectId: string; kind: 'receipt' | 'attachment'; paymentId?: string; replacesId?: string }, attempt: FileUploadAttempt, progress: (value: number) => void) {
  const mime = validateProjectFile(file, input.kind);
  if (attempt.uploaded) { progress(100); return attempt.id; }
  const delay = Number(localStorage.getItem('elecpro:test:upload-delay') ?? 0);
  if (delay) { progress(25); await new Promise((resolve) => setTimeout(resolve, delay)); progress(75); await new Promise((resolve) => setTimeout(resolve, delay)); }
  if (localStorage.getItem('elecpro:test:fail-upload') === '1') throw new Error('No se completó la carga. Reintente o retire el archivo seleccionado.');
  localStorage.setItem('elecpro:test:upload', JSON.stringify({ ...input, name: file.name, size: file.size, mime }));
  localStorage.setItem('elecpro:test:upload-count', String(Number(localStorage.getItem('elecpro:test:upload-count') ?? 0) + 1));
  attempt.uploaded = true; progress(100); return attempt.id;
}
