import { describe, expect, it, vi } from 'vitest';
import { alertKinds, projectBalance, projectCovered, projectProfit } from '../lib/calculations';
import { financialPercent, financialPercentText } from '../components/ui/FinancialBar';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));
import { revalidateBusinessViews } from '../app/actions/revalidation';

describe('cobertura del proyecto', () => {
  it.each([
    ['90000', '10000', '100000', '0', '100%'],
    ['90000', '0', '90000', '10000', '90%'],
    ['50000', '10000', '60000', '40000', '60%'],
    ['0', '100000', '100000', '0', '100%'],
    ['110000', '10000', '120000', '0', '120%'],
  ])('anticipos %s y retenciones %s', (paid, withheld, expected, balance, percentage) => {
    const covered = projectCovered(paid, withheld);
    expect(covered.toString()).toBe(expected);
    expect(projectBalance('100000', paid, withheld).toString()).toBe(balance);
    expect(financialPercentText(covered, '100000')).toBe(percentage);
    expect(financialPercent(covered, '100000')).toBeLessThanOrEqual(100);
  });

  it('conserva precisión decimal y admite proyectos anteriores sin retenciones', () => {
    expect(projectCovered('0.1', '0.2').toString()).toBe('0.3');
    expect(projectCovered('90000').toString()).toBe('90000');
    expect(financialPercentText(projectCovered('0', '0'), '0')).toBe('No calculable');
    expect(financialPercent(projectCovered('0', '0'), '0')).toBeNull();
  });

  it('anular la retención restaura cartera sin cambiar efectivo ni resultados', () => {
    const project = { status: 'approved', expectedEnd: '2026-12-01', expenses: '1000', budget: '2000', value: '100000', paid: '90000', withheld: '10000' };
    expect(alertKinds(project, '2026-10-22')).not.toContain('cartera');
    expect(alertKinds({ ...project, withheld: '0' }, '2026-10-22')).toContain('cartera');
    expect(project.paid).toBe('90000');
    expect(projectProfit('value', project.value, '0', project.expenses).toString()).toBe('99000');
  });

  it('invalida Panel, proyectos, análisis y alertas tras un movimiento', () => {
    revalidateBusinessViews('project-id');
    for (const path of ['/panel', '/proyectos', '/proyectos/project-id', '/analisis', '/alertas']) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });
});
