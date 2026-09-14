import { describe, expect, it } from 'vitest';
import { attachFinancialSummaries, sortProjectsByProfit, type ProjectFinancialSummary } from '../lib/data';
const summary = (id: string, values: Partial<ProjectFinancialSummary> = {}): ProjectFinancialSummary => ({ id, project_value: '100.000001', paid: '0', balance: '100.000001', expenses: '0', budget: '0', real_profit: '100.000001', projected_profit: '100.000001', ...values });
describe('attachFinancialSummaries', () => {
  it('asocia proyectos y resúmenes aunque lleguen desordenados', () => { const rows = attachFinancialSummaries([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], [summary('b', { real_profit: '2.123456' }), summary('a', { real_profit: '1.654321' })]); expect(rows.map((row) => row.financialSummary.real_profit)).toEqual(['1.654321', '2.123456']); });
  it('conserva una lista vacía', () => { expect(attachFinancialSummaries([], [])).toEqual([]); });
  it('acepta el resumen calculado de un proyecto sin movimientos', () => { expect(attachFinancialSummaries([{ id: 'a' }], [summary('a')])[0].financialSummary.balance).toBe('100.000001'); });
  it('rechaza un proyecto sin resumen, en vez de simular ceros', () => { expect(() => attachFinancialSummaries([{ id: 'a' }], [])).toThrow('no tiene resumen financiero'); });
  it('ordena la ganancia exacta de menor a mayor', () => { const rows = sortProjectsByProfit([{ financialSummary: summary('a', { real_profit: '10.000001' }) }, { financialSummary: summary('b', { real_profit: '-0.000001' }) }]); expect(rows.map((row) => row.financialSummary.id)).toEqual(['b', 'a']); });
});
