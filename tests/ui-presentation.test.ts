import { describe, expect, it } from 'vitest';
import { financialPercent } from '../components/ui/FinancialBar';
import { presentationLabel, quoteDisplayStatus } from '../lib/presentation';

describe('presentation labels', () => {
  it('keeps project and quote approval labels separate', () => {
    expect(presentationLabel('approved', 'project')).toBe('Aprobado');
    expect(presentationLabel('approved', 'quote')).toBe('Aprobada');
    expect(presentationLabel('critical', 'priority')).toBe('Crítica');
  });
  it('shows only undecided, expired quotes as Vencida', () => {
    expect(quoteDisplayStatus({ status: 'sent', valid_until: '2026-09-13' }, '2026-09-14')).toBe('expired');
    expect(quoteDisplayStatus({ status: 'draft', valid_until: '2026-09-14' }, '2026-09-14')).toBe('draft');
    expect(quoteDisplayStatus({ status: 'approved', valid_until: '2026-09-13' }, '2026-09-14')).toBe('approved');
    expect(quoteDisplayStatus({ status: 'rejected', valid_until: '2026-09-13' }, '2026-09-14')).toBe('rejected');
  });
});
describe('financialPercent', () => {
  it('preserves decimal inputs, clamps only the visual percentage, and never invents a denominator', () => {
    expect(financialPercent('25.000001', '100.000001')).toBe(25);
    expect(financialPercent('200.000001', '100.000001')).toBe(100);
    expect(financialPercent('-1', '100')).toBe(0);
    expect(financialPercent('10', '0')).toBeNull();
  });
});
