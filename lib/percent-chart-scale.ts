import { decimal } from './calculations';

export type PercentChartKind = 'execution' | 'margin';

export type PercentBarPosition = {
  left: number;
  width: number;
};

export type PercentChartScale = {
  min: number;
  max: number;
  zero: number;
  reference: number | null;
  bar: (value: string) => PercentBarPosition;
};

/** Converts percentage values into CSS positions on a shared chart scale. */
export function createPercentChartScale(values: string[], kind: PercentChartKind): PercentChartScale {
  const parsed = values.map(decimal);
  const minValue = kind === 'margin'
    ? parsed.reduce((minimum, value) => value.lessThan(minimum) ? value : minimum, decimal(0))
    : decimal(0);
  const maxValue = parsed.reduce((maximum, value) => value.greaterThan(maximum) ? value : maximum, decimal(100));
  const span = maxValue.minus(minValue);
  const position = (value: string | number) => decimal(value).minus(minValue).div(span).times(100).toNumber();
  const zero = position(0);

  return {
    min: minValue.toNumber(),
    max: maxValue.toNumber(),
    zero,
    reference: kind === 'execution' ? position(100) : null,
    bar(value) {
      const endpoint = position(value);
      return { left: Math.min(zero, endpoint), width: Math.abs(endpoint - zero) };
    },
  };
}
