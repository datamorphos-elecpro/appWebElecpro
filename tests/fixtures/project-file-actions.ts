import type { ProjectFile } from '../../lib/project-files';

const key = 'elecpro:test:files';
export const fixtureFiles = (): ProjectFile[] => JSON.parse(localStorage.getItem(key) ?? '[]');
function persist(rows: ProjectFile[]) { localStorage.setItem(key, JSON.stringify(rows)); }
export async function prepareProjectFile() { return { id: 'upload', object_path: 'PRY-TEST/archivos-adjuntos/upload.pdf', mime_type: 'application/pdf' }; }
export async function cleanupProjectFiles() { return { pending: false }; }
export async function finishProjectFile(input: { id: string; typeName?: string }) {
  const pending = JSON.parse(localStorage.getItem('elecpro:test:upload')!);
  const rows = fixtureFiles().filter((row) => row.id !== pending.replacesId);
  rows.push({ ...pending, id: input.id, project_id: pending.projectId, original_name: pending.name, mime_type: pending.mime, size_bytes: pending.size, payment_id: pending.paymentId, status: 'ready', created_at: '2026-10-29T15:00:00Z', updated_at: new Date().toISOString(), uploader_name: 'Ana', project_attachment_types: { id: 'type', name: input.typeName } }); persist(rows);
}
export async function changeProjectFile(input: { id: string; remove?: boolean; typeName?: string }) {
  const rows = fixtureFiles(); const file = rows.find((row) => row.id === input.id);
  if (input.remove) persist(rows.filter((row) => row.id !== input.id));
  else if (file) { file.project_attachment_types = { id: 'type', name: input.typeName! }; persist(rows); }
}
export async function saveProjectPayment(input: unknown, fileId?: string) {
  localStorage.setItem('elecpro:test:project-record', JSON.stringify({ kind: 'payment', input }));
  if (fileId) { const pending = JSON.parse(localStorage.getItem('elecpro:test:upload')!); pending.paymentId = 'payment-new'; localStorage.setItem('elecpro:test:upload', JSON.stringify(pending)); await finishProjectFile({ id: fileId }); }
  return { id: 'payment-new' };
}
