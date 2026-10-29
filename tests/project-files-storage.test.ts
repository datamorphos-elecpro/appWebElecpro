import { createClient } from '@supabase/supabase-js';
import { Upload } from 'tus-js-client';
import { describe, expect, it } from 'vitest';

// Explicit opt-in against a dedicated Supabase TEST project. No service_role is required.
const configured = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_PUBLISHABLE_KEY', 'TEST_SUPABASE_EMAIL', 'TEST_SUPABASE_PASSWORD', 'TEST_SUPABASE_PROJECT_ID'].every((key) => Boolean(process.env[key]));
describe.skipIf(!configured)('Storage real (opt-in con TEST_SUPABASE_*)', () => {
  it('carga más de 6 MB mediante TUS, asocia, descarga y retira el objeto privado', async () => {
    const url = process.env.TEST_SUPABASE_URL!; const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email: process.env.TEST_SUPABASE_EMAIL!, password: process.env.TEST_SUPABASE_PASSWORD! });
    if (login.error || !login.data.session) throw new Error('No se pudo autenticar el usuario del entorno de pruebas.');
    const id = crypto.randomUUID(); const projectId = process.env.TEST_SUPABASE_PROJECT_ID!;
    const bytes = Buffer.alloc(7 * 1024 * 1024); bytes.write('%PDF-1.4\n');
    const { data: file, error: prepareError } = await client.rpc('prepare_project_file', { p_id: id, p_project_id: projectId, p_kind: 'attachment', p_name: 'integracion-storage.pdf', p_mime: 'application/pdf', p_size: bytes.length });
    expect(prepareError).toBeNull(); expect(file.object_path).toContain('/archivos-adjuntos/');
    let ready = false;
    try {
      await new Promise<void>((resolve, reject) => { new Upload(bytes, { endpoint: `${url}/storage/v1/upload/resumable`, headers: { authorization: `Bearer ${login.data.session!.access_token}`, apikey: key }, chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true, retryDelays: [0, 1000, 3000], metadata: { bucketName: 'project-files', objectName: file.object_path, contentType: 'application/pdf', cacheControl: '0' }, onSuccess: () => resolve(), onError: reject }).start(); });
      const finished = await client.rpc('finish_project_file', { p_id: id, p_type_name: 'Informe' }); expect(finished.error).toBeNull(); ready = true;
      const anonymous = createClient(url, key, { auth: { persistSession: false } });
      expect((await anonymous.storage.from('project-files').download(file.object_path)).error).toBeTruthy();
      const download = await client.storage.from('project-files').download(file.object_path); expect(download.error).toBeNull(); expect(download.data?.size).toBe(bytes.length);
      const removed = await client.rpc('change_project_file', { p_id: id, p_expected_updated_at: finished.data.updated_at, p_delete: true }); expect(removed.error).toBeNull(); ready = false;
      expect((await client.storage.from('project-files').createSignedUrl(file.object_path, 60)).error).toBeTruthy();
      const cleaned = await client.storage.from('project-files').remove([file.object_path]); expect(cleaned.error).toBeNull();
      expect((await client.rpc('project_file_cleanup', { p_project_id: projectId, p_completed_ids: [id] })).error).toBeNull();
    } finally {
      if (ready) { const current = await client.from('project_files').select('updated_at').eq('id', id).single(); if (current.data) await client.rpc('change_project_file', { p_id: id, p_expected_updated_at: current.data.updated_at, p_delete: true }); }
      // Failed pending uploads remain reserved and expire after 24h; do not bypass RLS to delete them.
      const pending = await client.rpc('project_file_cleanup', { p_project_id: projectId });
      if (pending.data?.length) { await client.storage.from('project-files').remove(pending.data.map((row: { object_path: string }) => row.object_path)); await client.rpc('project_file_cleanup', { p_project_id: projectId, p_completed_ids: pending.data.map((row: { id: string }) => row.id) }); }
      await client.auth.signOut();
    }
  }, 120000);
});
