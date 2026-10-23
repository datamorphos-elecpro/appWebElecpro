import { describe, expect, it } from 'vitest';
import { alertKinds, projectBalance } from '../lib/calculations';
import { financialAttributes, financialTone } from '../lib/financial-tone';

const base = { status: 'approved', expectedEnd: '2026-10-23', expenses: '101', budget: '100', value: '1000', paid: '600', withheld: '100' };
const kinds = (changes: Partial<typeof base> = {}) => alertKinds({ ...base, ...changes }, '2026-10-23');

describe('alertas vigentes', () => {
  it('cartera usa anticipos y retenciones vigentes sin redondear', () => {
    expect(projectBalance('1000', '600', '100').toString()).toBe('300');
    expect(kinds()).toContain('cartera');
    expect(kinds({ paid: '1000', withheld: '0' })).not.toContain('cartera');
    expect(kinds({ paid: '900', withheld: '100' })).not.toContain('cartera');
    expect(kinds({ paid: '900', withheld: '0' })).toContain('cartera');
    expect(kinds({ paid: '999.999999', withheld: '0' })).toContain('cartera');
  });
  it('finalizados solo conservan cartera y cancelados no generan alertas', () => {
    expect(kinds({ status: 'finished', expectedEnd: '2026-10-01' })).toEqual(['cartera']);
    expect(kinds({ status: 'finished', paid: '900' })).toEqual([]);
    expect(kinds({ status: 'cancelled' })).toEqual([]);
    expect(kinds({ status: 'draft' })).not.toContain('cartera');
    expect(kinds({ status: 'quoted' })).toContain('cartera');
  });
  it.each(['approved', 'in_progress', 'paused'])('fechas inclusivas en %s', (status) => {
    expect(kinds({ status, expectedEnd: '2026-10-22' })).toContain('retraso');
    expect(kinds({ status, expectedEnd: '2026-10-23' })).toContain('finalizacion_proxima');
    expect(kinds({ status, expectedEnd: '2026-11-07' })).toContain('finalizacion_proxima');
    expect(kinds({ status, expectedEnd: '2026-11-08' })).not.toContain('finalizacion_proxima');
  });
  it('sobrecosto exige presupuesto positivo y exceso estricto', () => {
    expect(kinds({ budget: '0' })).not.toContain('sobrecosto');
    expect(kinds({ expenses: '100' })).not.toContain('sobrecosto');
    expect(kinds({ expenses: '100.000001' })).toContain('sobrecosto');
  });
});

describe('semántica financiera accesible', () => {
  it('cero incluido -0 es neutro; precisión anterior al formato COP', () => {
    expect(financialTone('-0', 'result')).toBeUndefined();
    expect(financialTone('-0.000001', 'result')).toBe('danger');
    expect(financialTone('0.000001', 'result')).toBe('success');
    expect(financialTone('0', 'balance')).toBeUndefined();
  });
  it('ejecución no anticipa avisos al 90 ni al 100 por ciento', () => {
    for (const value of ['0', '90', '99', '100']) expect(financialTone(value, 'execution')).toBeUndefined();
    expect(financialTone('100.000001', 'execution')).toBe('danger');
    expect(financialAttributes('101', 'execution')['aria-description']).toBe('Presupuesto excedido');
  });
});
