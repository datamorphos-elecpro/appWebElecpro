import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), auth: vi.fn(), revalidate: vi.fn(), business: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireProfile: mocks.auth }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../app/actions/revalidation', () => ({ revalidateBusinessViews: mocks.business }));
import { cleanupProjectFiles, finishProjectFile, prepareProjectFile, saveProjectPayment } from '../app/actions/project-files';

const projectId = 'fa000000-0000-4000-8000-000000000004'; const id = 'fa000000-0000-4000-8000-000000000011';
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ supabase: { rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) } } }); mocks.remove.mockResolvedValue({ error: null }); });
describe('acciones de archivos', () => {
  it('reserva con MIME canónico sin aceptar rutas del cliente', async () => {
    mocks.rpc.mockResolvedValue({ data: { id, object_path: 'PRY-SERVER/soportes-de-pago/a.pdf', mime_type: 'application/pdf' } });
    const result = await prepareProjectFile({ id, projectId, kind: 'receipt', name: 'pago.PDF', size: 100, object_path: 'otra/ruta' });
    expect(result.object_path).toBe('PRY-SERVER/soportes-de-pago/a.pdf'); expect(mocks.rpc).toHaveBeenCalledWith('prepare_project_file', expect.objectContaining({ p_mime: 'application/pdf', p_project_id: projectId }));
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('object_path');
  });
  it('no finaliza ni revalida cuando Storage no tiene un objeto válido', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'El archivo no terminó de cargar' } });
    await expect(finishProjectFile({ id })).rejects.toThrow('no terminó'); expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('crea el anticipo por RPC con su solicitud y soporte', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'payment' }, error: null });
    await saveProjectPayment({ project_id: projectId, request_id: id, payment_date: '2026-10-29', amount: '1000', payment_method: 'Transferencia' }, id);
    expect(mocks.rpc).toHaveBeenCalledWith('save_project_payment_with_file', expect.objectContaining({ p_file_id: id, payload: expect.objectContaining({ request_id: id }) })); expect(mocks.business).toHaveBeenCalledWith(projectId);
  });
  it('mantiene la limpieza pendiente si falla la API de Storage', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id, object_path: 'PRY-TEST/archivos-adjuntos/a.pdf' }] }); mocks.remove.mockResolvedValue({ error: { message: 'Unavailable' } });
    expect(await cleanupProjectFiles(projectId)).toEqual({ pending: true }); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('un fallo de red en la limpieza no revierte la operación de negocio', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { project_id: projectId } }).mockResolvedValueOnce({ data: [{ id, object_path: 'PRY-TEST/archivos-adjuntos/a.pdf' }] }); mocks.remove.mockRejectedValue(new Error('Network failure'));
    await expect(finishProjectFile({ id, typeName: 'Informe' })).resolves.toBeUndefined(); expect(mocks.revalidate).toHaveBeenCalledWith(`/proyectos/${projectId}`);
  });
  it('solo marca completada la limpieza después de eliminar por API', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id, object_path: 'PRY-TEST/archivos-adjuntos/a.pdf' }] }).mockResolvedValueOnce({ data: [] });
    expect(await cleanupProjectFiles(projectId)).toEqual({ pending: false }); expect(mocks.remove).toHaveBeenCalledWith(['PRY-TEST/archivos-adjuntos/a.pdf']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('project_file_cleanup', { p_project_id: projectId, p_completed_ids: [id] });
  });
});
