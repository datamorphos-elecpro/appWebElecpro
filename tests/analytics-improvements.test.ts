import { describe, expect, it } from 'vitest';
import { projectSchedule, sortProjectStatuses } from '../lib/operation-schedule';
import { managementReportSchema, reportCharts } from '../lib/management-report';
import { commercialAnalysis, type AnalyticsData } from '../lib/analytics-data';

describe('cronograma de Bogotá', () => {
  it('clasifica ayer, hoy, día 15 y día 16 sin incluir estados inactivos', () => {
    const check = (expected_end_date: string, status = 'approved') => projectSchedule({ expected_end_date, status }, '2026-11-04');
    expect(check('2026-11-03')).toBe('overdue'); expect(check('2026-11-04')).toBe('upcoming');
    expect(check('2026-11-19', 'paused')).toBe('upcoming'); expect(check('2026-11-20')).toBe('later');
    for (const status of ['draft', 'quoted', 'pending_approval', 'finished', 'cancelled']) expect(check('2026-11-03', status)).toBe('');
  });
  it('ordena cantidades descendentes y desempata con el orden de estados', () => {
    expect(sortProjectStatuses([{ key: 'finished', value: '2' }, { key: 'in_progress', value: '5' }, { key: 'pending_approval', value: '2' }]).map((row) => row.key)).toEqual(['in_progress', 'pending_approval', 'finished']);
  });
});

const id = (n: number) => `ab040000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function reportFixture() {
  return { metric: 'management.balance', total: 135, unit: 'money', value: '135', components: {}, records: Array.from({ length: 135 }, (_, n) => ({ kind: 'project', id: id(n), project_id: id(n), client_id: id(n % 2 + 1000), client_name: 'Mismo nombre', label: `PRY-${n}`, title: `Proyecto ${n}`, status: 'approved', amount: '1', project_value: '10', paid: '8', withheld: '1', balance: '1', profit_mode: 'value', base: '10', paid_distributions: '0', expenses: '2', budget: '3' })) };
}
describe('informes completos de Gerencia', () => {
  it('incluye más de 100 filas y separa clientes homónimos por ID', () => {
    const report = managementReportSchema.parse(reportFixture());
    const charts = reportCharts(report);
    expect(charts[0].data).toHaveLength(2); expect(charts[0].data.map((row) => row.value)).toEqual(['68', '67']);
    expect(charts[1].data.map((row) => row.value)).toEqual(['68', '67']);
  });
  it('rechaza un informe truncado, un total inconsistente o clientes sin identificador', () => {
    const fixture = reportFixture();
    expect(managementReportSchema.safeParse({ ...fixture, records: fixture.records.slice(0, 100) }).success).toBe(false);
    expect(managementReportSchema.safeParse({ ...fixture, value: '134' }).success).toBe(false);
    expect(managementReportSchema.safeParse({ ...fixture, records: fixture.records.map(({ client_id: _id, ...row }) => row) }).success).toBe(false);
  });
});

describe('comercial sin vencimiento automático', () => {
  it('mantiene estados y cuenta vigentes por fecha; segmentos y totales concilian', () => {
    const quotes = [
      { id: id(1), client_id: id(10), status: 'sent', total_amount: '100.25', valid_until: '2026-11-03' },
      { id: id(2), client_id: id(10), status: 'sent', total_amount: '200.25', valid_until: '2026-11-04' },
      { id: id(3), client_id: id(10), status: 'draft', total_amount: '0', valid_until: '2026-11-01' },
    ].map((quote) => ({ ...quote, title: 'Cotización', number: quote.id, issued_on: '2026-11-01', clients: { name: 'Cliente' }, quote_items: [] }));
    const input: AnalyticsData = { projects: [], quotes, payments: [], expenses: [], shares: [], portfolioSummary: { contracted: '0', paid: '0', balance: '0', expenses: '0', budget: '0', real_profit: '0', projected_profit: '0' } };
    const today = commercialAnalysis(input, {}, '2026-11-04');
    expect(today.pendingValue).toBe('200.25'); expect(today.validSent).toBe(1); expect(today.expired).toBe(0);
    expect(today.byClient[0]).toMatchObject({ value: '300.5', count: 3, segments: [{ status: 'draft', count: 1, value: '0' }, { status: 'sent', count: 2, value: '300.5' }] });
    expect(commercialAnalysis(input, {}, '2026-11-05').pendingValue).toBe('0');
    expect(commercialAnalysis(input, {}, '2026-11-05').byStatus).toEqual(today.byStatus);
  });
});
