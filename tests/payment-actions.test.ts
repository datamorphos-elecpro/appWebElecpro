import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn(), revalidate: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireProfile: mocks.auth }));
vi.mock('../app/actions/revalidation', () => ({ revalidateBusinessViews: mocks.revalidate }));
import { editProjectPayment, deleteProjectPayment } from '../app/actions/project-payments';

const identity = { id: 'ca000000-0000-4000-8000-000000000001', project_id: 'ca000000-0000-4000-8000-000000000002', request_id: 'ca000000-0000-4000-8000-000000000003', expected_updated_at: '2026-11-03T15:00:00.123456+00:00' };
const edit = { ...identity, payment_date: '2026-10-01', amount: '1500.25', payment_method: 'Transferencia', note: 'Corrección' };
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ supabase: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ error: null }); });

describe('gestión de anticipos', () => {
  it('edita mediante RPC autorizado con revisión, importe decimal y solicitud original', async () => {
    await editProjectPayment(edit);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('edit_project_payment', { payload: edit });
    expect(mocks.revalidate).toHaveBeenCalledWith(identity.project_id);
  });
  it.each(['0', '-1', '1.123', 'NaN', '1e5'])('rechaza importe inválido %s sin mutación', async (amount) => {
    await expect(editProjectPayment({ ...edit, amount })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('exige motivo para eliminar y conserva identidad y revisión', async () => {
    await expect(deleteProjectPayment({ ...identity, reason: ' ' })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    await deleteProjectPayment({ ...identity, reason: '  Duplicado  ' });
    expect(mocks.rpc).toHaveBeenCalledWith('delete_project_payment', { payload: { ...identity, reason: 'Duplicado' } });
  });
  it('propaga conflictos sin anunciar éxito ni revalidar', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'El anticipo cambió. Actualice el proyecto' } });
    await expect(editProjectPayment(edit)).rejects.toThrow('cambió');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('rechaza usuarios sin autorización antes de llamar la base', async () => {
    mocks.auth.mockRejectedValue(new Error('No autorizado'));
    await expect(deleteProjectPayment({ ...identity, reason: 'Duplicado' })).rejects.toThrow('No autorizado');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
