import { describe, expect, it } from 'vitest';
import { distributionMetrics, type Distribution } from '../lib/distributions-data';

const row = (overrides: Partial<Distribution>): Distribution => ({
  id: 'share', participant: 'Participante', mode: 'fixed', value: '0', basis: 'portfolio_profit',
  is_active: true, is_paid: false, paid_on: null, paid_amount: null, created_at: '2026-01-01', ...overrides,
});

describe('métricas de distribuciones', () => {
  it('distingue pagado histórico, pendiente activo y asignado', () => {
    const metrics = distributionMetrics([
      row({ id: 'paid', is_paid: true, is_active: false, paid_amount: '30', paid_on: '2026-01-01' }),
      row({ id: 'pending', value: '25' }),
      row({ id: 'inactive', value: '99', is_active: false }),
    ], '100');
    expect(metrics).toMatchObject({ result: '100', paid: '30', pending: '25', assigned: '55', available: '45', overAssigned: false });
  });

  it('calcula porcentajes exactos y alerta sobreasignación sin bloquearla', () => {
    const metrics = distributionMetrics([row({ mode: 'percent', value: '60' }), row({ id: 'other', mode: 'percent', value: '50' })], '100.01');
    expect(metrics.pending).toBe('110.011');
    expect(metrics.available).toBe('-10.001');
    expect(metrics.overAssigned).toBe(true);
  });
});
