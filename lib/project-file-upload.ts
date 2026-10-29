'use client';

import { Upload } from 'tus-js-client';
import { prepareProjectFile } from '../app/actions/project-files';
import { createClient } from './supabase/client';
import { projectFilesBucket, validateProjectFile, type PreparedProjectFile, type ProjectFileKind } from './project-files';

export type FileUploadAttempt = { id: string; prepared?: PreparedProjectFile; uploaded?: boolean };
export async function uploadProjectFile(file: File, input: { projectId: string; kind: ProjectFileKind; paymentId?: string | null; replacesId?: string | null; expectedUpdatedAt?: string | null }, attempt: FileUploadAttempt, onProgress: (percent: number) => void) {
  validateProjectFile(file, input.kind);
  const prepared = attempt.prepared ?? await prepareProjectFile({ ...input, id: attempt.id, name: file.name, size: file.size });
  attempt.prepared = prepared;
  if (attempt.uploaded) return prepared.id;
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('La sesión venció. Inicie sesión nuevamente.');
  const endpoint = new URL('/storage/v1/upload/resumable', process.env.NEXT_PUBLIC_SUPABASE_URL);
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: endpoint.toString(), headers: { authorization: `Bearer ${data.session!.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      fingerprint: async () => `elecpro:${data.session!.user.id}:${attempt.id}`,
      metadata: { bucketName: projectFilesBucket, objectName: prepared.object_path, contentType: prepared.mime_type, cacheControl: '0' },
      onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
      onError: () => reject(new Error('No se completó la carga. Reintente o retire el archivo seleccionado.')),
      onSuccess: () => { attempt.uploaded = true; onProgress(100); resolve(); },
    });
    void upload.findPreviousUploads().then((previous) => { if (previous[0]) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
  });
  return prepared.id;
}
