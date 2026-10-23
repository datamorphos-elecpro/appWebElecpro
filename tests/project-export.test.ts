import { describe, expect, it, vi } from 'vitest';

const { requireProfile } = vi.hoisted(() => ({ requireProfile: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireProfile }));
import { GET } from '../app/(protected)/proyectos/exportar/route';

describe('exportación de cobertura', () => {
  it('exporta el ejemplo completo separando efectivo, retenciones, cubierto y cartera', async () => {
    requireProfile.mockResolvedValue({ supabase: { from: (table: string) => ({
      select: () => table === 'projects' ? { order: async () => ({ data: [{ id: 'p1', quote_number: 'PRY-1', title: 'Instalación', status: 'approved', project_value: '100000', clients: { name: 'Cliente' } }] }) }
        : Promise.resolve({ data: [{ id: 'p1', paid: '90000', withheld: '10000', balance: '0', expenses: '1000', real_profit: '99000' }] }),
    }) } });
    const response = await GET();
    const text = await response.text();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(text).toContain('"Anticipos";"Retenciones";"Cubierto";"Saldo"');
    expect(text).toContain('"100000";"90000";"10000";"100000";"0";"1000";"99000"');
    expect(text.split('\r\n')[1].split(';')).toHaveLength(11);
  });

  it('requiere autorización antes de consultar o exportar', async () => {
    requireProfile.mockRejectedValue(new Error('No autorizado'));
    await expect(GET()).rejects.toThrow('No autorizado');
  });
});
