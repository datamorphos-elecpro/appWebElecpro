import { validateProjectFile } from '../../lib/project-files';
import type { FileUploadAttempt } from '../../lib/project-file-upload';
export async function uploadProjectFile(file: File, input: { projectId: string; kind: 'receipt' | 'attachment'; paymentId?: string; replacesId?: string }, attempt: FileUploadAttempt, progress: (value: number) => void) {
  const mime = validateProjectFile(file, input.kind);
  if (localStorage.getItem('elecpro:test:fail-upload') === '1') throw new Error('No se completó la carga. Reintente o retire el archivo seleccionado.');
  localStorage.setItem('elecpro:test:upload', JSON.stringify({ ...input, name: file.name, size: file.size, mime }));
  progress(100); return attempt.id;
}
