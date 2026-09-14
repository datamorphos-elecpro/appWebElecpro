import { beforeEach, describe, expect, it, vi } from 'vitest';
const from = vi.fn();
vi.mock('../lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from })) }));
import { getAlertsData } from '../lib/data';
describe('getAlertsData', () => { beforeEach(() => from.mockReset()); it('propaga un fallo de Supabase en lugar de mostrar alertas vacías', async () => { from.mockReturnValue({ select: vi.fn(() => Promise.resolve({ data: null, error: { message: 'permiso denegado' } })) }); await expect(getAlertsData()).rejects.toThrow('proyectos para alertas'); }); });
