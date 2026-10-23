import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from, rpc })) }));
import { getAlertsData, getAlertsPage, getDashboardSnapshot } from '../lib/data';
describe('getAlertsData', () => { beforeEach(() => from.mockReset()); it('propaga un fallo de Supabase en lugar de mostrar alertas vacías', async () => { from.mockReturnValue({ select: vi.fn(() => Promise.resolve({ data: null, error: { message: 'permiso denegado' } })) }); await expect(getAlertsData()).rejects.toThrow('proyectos para alertas'); }); });

describe('consultas de alertas vigentes', () => {
  beforeEach(() => rpc.mockReset());
  it('conserva registros, total, página efectiva y fecha del servidor', async () => {
    rpc.mockResolvedValue({ data: { records: [{ id: 'a', balance: '0.000001' }], total: 21, page: 2, consulted_at: '2026-10-23T16:00:00Z' }, error: null });
    const result = await getAlertsPage({ q: 'Cliente', kind: 'cartera', page: 99, pageSize: 20 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('alerts_page_v2', { p_q: 'Cliente', p_kind: 'cartera', p_page: 99, p_limit: 20 });
    expect(result).toMatchObject({ records: [{ balance: '0.000001' }], page: { page: 2, total: 21 }, consulted_at: '2026-10-23T16:00:00Z' });
  });
  it.each([{ data: null, error: { message: 'migración faltante' } }, { data: null, error: null }])('no transforma un fallo en una lista vacía', async (response) => {
    rpc.mockResolvedValue(response);
    await expect(getAlertsPage({ q: '', kind: '', page: 1, pageSize: 20 })).rejects.toThrow('No fue posible cargar alertas');
    await expect(getDashboardSnapshot()).rejects.toThrow('No fue posible cargar el panel');
  });
  it('conserva el momento de consulta aunque no haya alertas', async () => {
    rpc.mockResolvedValue({ data: { records: [], total: 0, page: 1, consulted_at: '2026-10-23T16:00:00Z' }, error: null });
    expect(await getAlertsPage({ q: '', kind: '', page: 2, pageSize: 20 })).toMatchObject({ records: [], page: { page: 1, total: 0 }, consulted_at: '2026-10-23T16:00:00Z' });
  });
});

describe('fechas ausentes sin perder datos', () => {
  it.each([undefined, null, '', 'fecha inv?lida', '2026-10-23T16:00:00Z'])('normaliza %s en panel y listado', async (consulted_at) => {
    rpc.mockResolvedValue({ data: { records: [{ id: 'cartera' }], total: 21, page: 2, consulted_at, alert_total: 21 }, error: null });
    const expected = consulted_at === '2026-10-23T16:00:00Z' ? consulted_at : null;
    expect(await getAlertsPage({ q: '', kind: '', page: 99, pageSize: 20 })).toMatchObject({ records: [{ id: 'cartera' }], page: { page: 2, total: 21 }, consulted_at: expected });
    expect(await getDashboardSnapshot()).toMatchObject({ alert_total: 21, consulted_at: expected });
  });
});
