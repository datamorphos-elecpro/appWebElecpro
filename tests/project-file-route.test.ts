import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ claims: vi.fn(), from: vi.fn(), sign: vi.fn() }));
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims }, from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));
import { GET } from '../app/api/proyectos/archivos/[fileId]/route';

const id = 'fa000000-0000-4000-8000-000000000011';
const file = { object_path: 'PRY-TEST/soportes-de-pago/pago.pdf', original_name: 'pago original.pdf', mime_type: 'application/pdf' };
function row(data: unknown) { const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(async () => ({ data })) }; query.select.mockReturnValue(query); query.eq.mockReturnValue(query); return query; }
function request(search = '', fileId = id) { return GET(new NextRequest(`https://elecpro.test/api/proyectos/archivos/${fileId}${search}`), { params: Promise.resolve({ fileId }) }); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.claims.mockResolvedValue({ data: { claims: { sub: 'user' } } });
  mocks.from.mockImplementation((table: string) => row(table === 'profiles' ? { is_active: true } : file));
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.test/temporary' }, error: null });
});
describe('enlaces privados de archivos', () => {
  it('rechaza identificadores inválidos antes de consultar la sesión', async () => {
    expect((await request('', 'invalid')).status).toBe(400); expect(mocks.claims).not.toHaveBeenCalled();
  });
  it('rechaza acceso anónimo', async () => {
    mocks.claims.mockResolvedValue({ data: null }); expect((await request()).status).toBe(401); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rechaza perfiles inactivos', async () => {
    mocks.from.mockReturnValue(row({ is_active: false })); expect((await request()).status).toBe(403); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('solo firma archivos vigentes encontrados a través de RLS', async () => {
    const files = row(null); mocks.from.mockImplementation((table: string) => table === 'profiles' ? row({ is_active: true }) : files);
    expect((await request()).status).toBe(404); expect(files.eq).toHaveBeenCalledWith('status', 'ready'); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('devuelve una URL de vista previa de corta duración y sin caché', async () => {
    const response = await request('?format=json'); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({ url: 'https://storage.test/temporary' }); expect(mocks.sign).toHaveBeenCalledWith(file.object_path, 60, undefined);
  });
  it('descarga usando el nombre original y redirige al enlace temporal', async () => {
    const response = await request('?download=1'); expect(response.status).toBe(302); expect(response.headers.get('Location')).toBe('https://storage.test/temporary');
    expect(mocks.sign).toHaveBeenCalledWith(file.object_path, 60, { download: file.original_name });
  });
  it('los formatos sin vista previa se descargan automáticamente', async () => {
    mocks.from.mockImplementation((table: string) => row(table === 'profiles' ? { is_active: true } : { ...file, mime_type: 'application/acad' }));
    await request(); expect(mocks.sign).toHaveBeenCalledWith(file.object_path, 60, { download: file.original_name });
  });
  it('informa fallos de Storage sin devolver un enlace', async () => {
    mocks.sign.mockResolvedValue({ error: { message: 'Storage unavailable' } }); const response = await request('?format=json');
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty('url');
  });
});
