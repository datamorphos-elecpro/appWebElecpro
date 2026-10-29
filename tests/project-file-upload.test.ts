import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileUploadAttempt } from '../lib/project-file-upload';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), session: vi.fn(), options: null as any, previous: vi.fn(), resume: vi.fn(), fail: false, constructed: 0 }));
vi.mock('../app/actions/project-files', () => ({ prepareProjectFile: mocks.prepare }));
vi.mock('../lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: mocks.session } }) }));
vi.mock('tus-js-client', () => ({ Upload: class {
  constructor(_file: unknown, options: any) { mocks.options = options; mocks.constructed++; }
  findPreviousUploads = mocks.previous;
  resumeFromPreviousUpload = mocks.resume;
  start() { if (mocks.fail) mocks.options.onError(new Error('Disconnected')); else { mocks.options.onProgress(100, 100); mocks.options.onSuccess(); } }
} }));
import { uploadProjectFile } from '../lib/project-file-upload';

const file = new File(['%PDF'], 'pago.pdf', { type: 'application/pdf' });
const input = { projectId: 'project', kind: 'receipt' as const };
beforeEach(() => {
  vi.clearAllMocks(); mocks.fail = false; mocks.constructed = 0;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.test'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public');
  mocks.prepare.mockResolvedValue({ id: 'file', object_path: 'PRY-SERVER/soportes-de-pago/server.pdf', mime_type: 'application/pdf' });
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'session-token', user: { id: 'user' } } } }); mocks.previous.mockResolvedValue([]);
});
describe('carga directa reanudable', () => {
  it('usa exclusivamente la ruta y MIME autorizados por el servidor, sin sobrescritura', async () => {
    const progress = vi.fn(); const attempt: FileUploadAttempt = { id: 'upload-request' };
    expect(await uploadProjectFile(file, input, attempt, progress)).toBe('file');
    expect(mocks.options.metadata).toMatchObject({ bucketName: 'project-files', objectName: 'PRY-SERVER/soportes-de-pago/server.pdf', contentType: 'application/pdf' });
    expect(mocks.options.headers['x-upsert']).toBeUndefined(); expect(mocks.options.chunkSize).toBe(6 * 1024 * 1024); expect(progress).toHaveBeenCalledWith(100);
    expect(attempt.uploaded).toBe(true);
  });
  it('un reintento de finalización no vuelve a cargar el archivo', async () => {
    const attempt: FileUploadAttempt = { id: 'request' }; await uploadProjectFile(file, input, attempt, vi.fn()); await uploadProjectFile(file, input, attempt, vi.fn());
    expect(mocks.prepare).toHaveBeenCalledTimes(1); expect(mocks.constructed).toBe(1);
  });
  it('reutiliza la reserva y reanuda después de un fallo de red', async () => {
    const attempt: FileUploadAttempt = { id: 'request' }; mocks.fail = true;
    await expect(uploadProjectFile(file, input, attempt, vi.fn())).rejects.toThrow('No se completó'); expect(attempt.uploaded).toBeUndefined();
    mocks.fail = false; mocks.previous.mockResolvedValue([{ uploadUrl: 'https://storage.test/resume' }]);
    await uploadProjectFile(file, input, attempt, vi.fn()); expect(mocks.prepare).toHaveBeenCalledTimes(1); expect(mocks.resume).toHaveBeenCalled();
  });
  it('rechaza archivos inválidos antes de reservar una ruta', async () => {
    await expect(uploadProjectFile(new File(['a'], 'a.exe'), input, { id: 'request' }, vi.fn())).rejects.toThrow('PDF'); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('no inicia cargas con sesión vencida', async () => {
    mocks.session.mockResolvedValue({ data: { session: null } }); await expect(uploadProjectFile(file, input, { id: 'request' }, vi.fn())).rejects.toThrow('sesión venció'); expect(mocks.constructed).toBe(0);
  });
});
