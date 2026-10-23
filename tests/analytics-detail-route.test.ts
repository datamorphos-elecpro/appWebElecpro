import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { getClaims, single, rpc, from } = vi.hoisted(() => ({ getClaims: vi.fn(), single: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ auth: { getClaims }, from, rpc }) }));
import { GET } from '../app/api/analisis/detalle/route';
const request = (query = 'metric=management.projectValue') => new NextRequest(`http://localhost/api/analisis/detalle?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: '11111111-1111-4111-8111-111111111111' } } });
  single.mockResolvedValue({ data: { is_active: true } });
  from.mockReturnValue({ select: () => ({ eq: () => ({ single }) }) });
  rpc.mockResolvedValue({ data: { metric: 'management.projectValue', records: [], total: 0, page: 1, pageSize: 20, value: '0', unit: 'money', components: {} }, error: null });
});
describe('GET detalle autenticado', () => {
  it('rechaza anónimos antes de consultar perfiles o RPC', async () => {
    getClaims.mockResolvedValue({ data: null }); expect((await GET(request())).status).toBe(401); expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it('rechaza perfiles inactivos', async () => {
    single.mockResolvedValue({ data: { is_active: false } }); expect((await GET(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it('valida filtros y paginación antes de llamar SQL', async () => {
    expect((await GET(request('metric=management.expenses&pageSize=300'))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('envía filtros tipados y evita caché compartida', async () => {
    const response = await GET(request('metric=management.projectValue&page=2&pageSize=50&management_status=approved&management_month=2026-01'));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(rpc).toHaveBeenCalledWith('analytics_metric_detail', expect.objectContaining({ p_metric: 'management.projectValue', p_page: 2, p_page_size: 50, p_filters: expect.objectContaining({ management_status: ['approved'] }) }));
    expect(rpc.mock.calls[0][1].p_filters).not.toHaveProperty('management_month');
  });
  it('no convierte un fallo de base de datos en un detalle vacío', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'fallo interno' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(request()); expect(response.status).toBe(500); expect((await response.json()).message).not.toContain('fallo interno'); log.mockRestore();
  });
});
