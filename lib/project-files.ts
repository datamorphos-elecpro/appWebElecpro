import { z } from 'zod';

export const projectFilesBucket = 'project-files';
export const receiptMaxBytes = 10 * 1024 * 1024;
export const attachmentMaxBytes = 50 * 1024 * 1024;
export type ProjectFileKind = 'receipt' | 'attachment';
export const fileMimeTypes: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'application/acad', dxf: 'application/dxf', zip: 'application/zip',
};
export const attachmentAccept = Object.keys(fileMimeTypes).map((extension) => `.${extension}`).join(',');
export const attachmentTypeName = z.string().trim().min(1, 'Seleccione o cree un tipo de documento.').max(100).transform((name) => name.replace(/\s+/g, ' '));
export type AttachmentType = { id: string; name: string };
export type ProjectFile = {
  id: string; project_id: string; kind: ProjectFileKind; payment_id: string | null;
  attachment_type_id: string | null; object_path: string; original_name: string;
  mime_type: string; size_bytes: number; status: 'pending' | 'ready' | 'deleted';
  created_at: string; updated_at: string; created_by: string; uploader_name: string;
  replaces_id: string | null; expected_updated_at: string | null; cleanup_complete: boolean;
  project_attachment_types?: AttachmentType | null;
};
export type PreparedProjectFile = Pick<ProjectFile, 'id' | 'object_path' | 'mime_type'>;

export function validateProjectFile(file: Pick<File, 'name' | 'size'>, kind: ProjectFileKind) {
  if (!file.name || file.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(file.name)) throw new Error('El nombre del archivo no es válido (máximo 240 caracteres y sin rutas).');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = fileMimeTypes[extension];
  if (!mime || (kind === 'receipt' && extension !== 'pdf')) throw new Error(kind === 'receipt' ? 'El soporte de pago debe ser un PDF.' : 'Formato de archivo no permitido.');
  const maximum = kind === 'receipt' ? receiptMaxBytes : attachmentMaxBytes;
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maximum) throw new Error(`Seleccione un archivo no vacío de máximo ${kind === 'receipt' ? '10' : '50'} MB.`);
  return mime;
}

export function fileSizeText(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`; }
export function canPreviewFile(mime: string) { return ['application/pdf', 'image/jpeg', 'image/png'].includes(mime); }
