'use server';

import { z } from 'zod';
import { requireProfile } from '../../lib/auth';
import { attachmentTypeName, projectFilesBucket, validateProjectFile, type PreparedProjectFile, type ProjectFile } from '../../lib/project-files';
import { revalidateBusinessViews } from './revalidation';
import { revalidatePath } from 'next/cache';

const uuid = z.string().uuid();
const revision = z.string().datetime({ offset: true });
const prepareSchema = z.object({ id: uuid, projectId: uuid, kind: z.enum(['receipt', 'attachment']), name: z.string(), size: z.number(), paymentId: uuid.nullish(), replacesId: uuid.nullish(), expectedUpdatedAt: revision.nullish() });

export async function prepareProjectFile(input: unknown): Promise<PreparedProjectFile> {
  const value = prepareSchema.parse(input);
  const mime = validateProjectFile({ name: value.name, size: value.size }, value.kind);
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('prepare_project_file', { p_id: value.id, p_project_id: value.projectId, p_kind: value.kind, p_name: value.name, p_mime: mime, p_size: value.size, p_payment_id: value.paymentId ?? null, p_replaces_id: value.replacesId ?? null, p_expected_updated_at: value.expectedUpdatedAt ?? null });
  if (error) throw new Error(error.message);
  return { id: data.id, object_path: data.object_path, mime_type: data.mime_type };
}

export async function finishProjectFile(input: unknown) {
  const value = z.object({ id: uuid, typeName: attachmentTypeName.optional() }).parse(input);
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('finish_project_file', { p_id: value.id, p_type_name: value.typeName ?? null });
  if (error) throw new Error(error.message);
  revalidatePath(`/proyectos/${data.project_id}`);
  await cleanupProjectFiles(data.project_id);
}

export async function changeProjectFile(input: unknown) {
  const value = z.object({ id: uuid, expectedUpdatedAt: revision, remove: z.boolean().default(false), typeName: attachmentTypeName.optional() }).parse(input);
  const { supabase } = await requireProfile();
  const { data: file, error: readError } = await supabase.from('project_files').select('project_id').eq('id', value.id).single();
  if (readError || !file) throw new Error('Archivo no encontrado.');
  const { error } = await supabase.rpc('change_project_file', { p_id: value.id, p_expected_updated_at: value.expectedUpdatedAt, p_delete: value.remove, p_type_name: value.typeName ?? null });
  if (error) throw new Error(error.message);
  revalidatePath(`/proyectos/${file.project_id}`);
  await cleanupProjectFiles(file.project_id);
}

export async function saveProjectPayment(input: unknown, fileId?: string) {
  const value = z.object({ project_id: uuid, request_id: uuid, payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/), payment_method: z.string().trim().min(1), note: z.string().optional() }).parse(input);
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc('save_project_payment_with_file', { payload: value, p_file_id: fileId ? uuid.parse(fileId) : null });
  if (error) throw new Error(error.message);
  revalidateBusinessViews(value.project_id);
  return data as { id: string };
}

/** Best effort: the RPC keeps tombstones until Storage confirms physical removal. */
export async function cleanupProjectFiles(projectId: string): Promise<{ pending: boolean }> {
  uuid.parse(projectId);
  const { supabase } = await requireProfile();
  try {
    const { data, error } = await supabase.rpc('project_file_cleanup', { p_project_id: projectId });
    if (error) return { pending: true };
    const rows = (data ?? []) as ProjectFile[];
    if (!rows.length) return { pending: false };
    const { error: removeError } = await supabase.storage.from(projectFilesBucket).remove(rows.map((row) => row.object_path));
    if (removeError) return { pending: true };
    const { data: remaining, error: markError } = await supabase.rpc('project_file_cleanup', { p_project_id: projectId, p_completed_ids: rows.map((row) => row.id) });
    return { pending: Boolean(markError || remaining?.length) };
  } catch { return { pending: true }; }
}
