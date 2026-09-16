import { describe, expect, it } from 'vitest';
import { alertKinds, calculateQuote, projectBalance, projectProfit, shareAmount } from '../lib/calculations';
import { money } from '../lib/money';

describe('cálculos Elecpro', () => {
  it('incrementa materiales una sola vez, conserva decimales y calcula AIU e IVA', () => {
    const result = calculateQuote([
      { category: 'material', quantity: '1', baseUnitPrice: '100' },
      { category: 'material', quantity: '2', baseUnitPrice: '1250.5' },
      { category: 'labor', quantity: '1', baseUnitPrice: '50' },
      { category: 'design', quantity: '1', baseUnitPrice: '70' },
      { category: 'technical_visit', quantity: '1', baseUnitPrice: '80' },
    ], { materialIncreasePct: '10', administrationPct: '10', contingencyPct: '5', utilityPct: '20', vatUtilityPct: '19' });

    expect(result.lines[0].finalUnitPrice.toString()).toBe('110');
    expect(result.lines[1].finalUnitPrice.toString()).toBe('1375.55');
    expect(result.lines[1].finalTotal.toString()).toBe('2751.1');
    expect(result.lines[2].finalUnitPrice.toString()).toBe('50');
    expect(result.lines[3].finalUnitPrice.toString()).toBe('70');
    expect(result.lines[4].finalUnitPrice.toString()).toBe('80');
    expect(result.directCost.toString()).toBe('3061.1');
    expect(result.administrationAmount.toString()).toBe('306.11');
    expect(result.utilityAmount.toString()).toBe('612.22');
    expect(result.vatUtilityAmount.toString()).toBe('116.3218');
  });

  it('formatea COP desde el decimal exacto, sin coerción a number', () => {
    expect(money('1250.5')).toContain('1.251');
  });

  it('calcula saldos, ganancia manual y participaciones con decimales exactos', () => {
    expect(projectBalance('100', '140').toString()).toBe('0');
    expect(projectProfit('manual', '500', '200', '75').toString()).toBe('125');
    expect(shareAmount('percent', '10', '800').toString()).toBe('80');
  });

  it('calcula alertas sin persistirlas', () => {
    expect(alertKinds({ status: 'in_progress', expectedEnd: '2026-09-01', expenses: '120', budget: '100', value: '500', paid: '0' }, '2026-09-09')).toEqual(expect.arrayContaining(['retraso', 'sobrecosto', 'cartera']));
  });
  it('solo marca retraso finalizado cuando la fecha real excede la prevista y reconoce finalización próxima', () => {
    expect(alertKinds({ status: 'finished', expectedEnd: '2026-09-01', actualEnd: '2026-09-03', expenses: '0', budget: '0', value: '0', paid: '0' }, '2026-09-09')).toContain('retraso');
    expect(alertKinds({ status: 'in_progress', expectedEnd: '2026-09-20', expenses: '0', budget: '0', value: '0', paid: '0' }, '2026-09-09')).toContain('finalizacion_proxima');
  });
});
