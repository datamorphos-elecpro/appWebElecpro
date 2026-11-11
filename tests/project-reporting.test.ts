import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
import { getProjectReportingDetails } from '../lib/project-reporting';
const id = 'fa000000-0000-4000-8000-000000000001';
beforeEach(() => vi.clearAllMocks());
describe('datos económicos y facturas por lote', () => {
  it('conserva decimales exactos, orden de facturas y elimina IDs repetidos de la consulta', async () => {
    const record = { id, direct_cost: '123456789.123456', total_aiu: '234.456789', invoices: [{ id, original_name: 'Factura.pdf', mime_type: 'application/pdf' }] };
    mocks.rpc.mockResolvedValue({ data: [record] });
    expect((await getProjectReportingDetails([id, id])).get(id)).toEqual(record);
    expect(mocks.rpc).toHaveBeenCalledWith('project_reporting_details', { p_project_ids: [id] });
  });
  it('no consulta un lote vacío', async () => {
    expect((await getProjectReportingDetails([])).size).toBe(0); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ error: { message: 'No autorizado' } }, { data: [] }, { data: [{ id, direct_cost: null, total_aiu: '0', invoices: [] }] }])('rechaza errores y respuestas incompletas: %j', async (response) => {
    mocks.rpc.mockResolvedValue(response);
    await expect(getProjectReportingDetails([id])).rejects.toThrow();
  });
});
