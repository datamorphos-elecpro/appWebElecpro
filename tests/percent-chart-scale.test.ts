import { describe, expect, it } from 'vitest';
import { createPercentChartScale } from '../lib/percent-chart-scale';

describe('createPercentChartScale', () => {
  it('mantiene 100 % como referencia para ejecuciones por debajo, en y por encima del presupuesto', () => {
    const below = createPercentChartScale(['60'], 'execution');
    const exact = createPercentChartScale(['100'], 'execution');
    const over = createPercentChartScale(['180'], 'execution');

    expect(below.max).toBe(100);
    expect(below.reference).toBe(100);
    expect(below.bar('60')).toEqual({ left: 0, width: 60 });
    expect(exact.bar('100')).toEqual({ left: 0, width: 100 });
    expect(over.max).toBe(180);
    expect(over.reference).toBeCloseTo(55.5555555556);
    expect(over.bar('180')).toEqual({ left: 0, width: 100 });
  });

  it('incluye márgenes negativos, cero y superiores a 100 % en una escala común', () => {
    const scale = createPercentChartScale(['-25', '0', '150'], 'margin');

    expect(scale.min).toBe(-25);
    expect(scale.max).toBe(150);
    expect(scale.zero).toBeCloseTo(14.2857142857);
    expect(scale.reference).toBeNull();
    expect(scale.bar('-25')).toEqual({ left: 0, width: expect.closeTo(14.2857142857) });
    expect(scale.bar('0')).toEqual({ left: expect.closeTo(14.2857142857), width: 0 });
    expect(scale.bar('150')).toEqual({ left: expect.closeTo(14.2857142857), width: expect.closeTo(85.7142857143) });
  });
});
