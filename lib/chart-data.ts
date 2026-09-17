/** Contract shared by analytics RPC readers and chart components. Numeric values
 * cross the wire as strings because PostgreSQL numeric must not lose precision. */
export type ChartUnit = 'money' | 'count' | 'percent';

export type ChartDatum = {
  key: string;
  label: string;
  value: string;
  unit?: ChartUnit;
  series?: string;
};
