import { describe, expect, it } from 'vitest';
import { cashByProject, commercialAnalysis, delayDays, filterCommercialQuotes, managementAnalysis, operationAnalysis, type AnalyticsData } from '../lib/analytics-data';

const data: AnalyticsData = {
  projects: [{ id: 'p1', client_id: 'c1', title: 'Tablero', quote_number: 'COT-001', status: 'in_progress', priority: 'high', responsible: 'Ana', location: '', start_date: '2026-01-01', expected_end_date: '2026-01-31', actual_end_date: null, project_value: '1000.25', observations: '', profit_mode: 'value', initial_profit: '0', created_at: '2026-01-01', clients: { name: 'Cliente uno' }, financialSummary: { id: 'p1', project_value: '1000.25', paid: '100.10', balance: '900.15', expenses: '300.50', budget: '250', real_profit: '699.75', projected_profit: '750.25' } }],
  quotes: [{ id: 'q1', number: 'COT-002', title: 'Oferta', status: 'sent', client_id: 'c1', issued_on: '2026-02-10', valid_until: '2026-02-15', total_amount: '500.50', clients: { name: 'Cliente uno' }, quote_items: [] }, { id: 'q2', number: 'COT-003', title: 'Oferta aprobada', status: 'approved', client_id: 'c2', issued_on: '2026-01-10', valid_until: '2026-01-20', total_amount: '250.25', clients: { name: 'Cliente dos' }, quote_items: [] }],
  payments: [{ project_id: 'p1', payment_date: '2026-02-03', amount: '10.50' }],
  expenses: [{ project_id: 'p1', expense_date: '2026-02-04', amount: '30.75' }],
  shares: [{ id: 's1', participant: 'Gerencia', mode: 'percent', value: '10', is_paid: false, paid_on: null }],
  portfolioSummary: { contracted: '1000.25', paid: '100.10', balance: '900.15', expenses: '300.50', budget: '250', real_profit: '699.75', projected_profit: '750.25' },
};

describe('análisis', () => {
  it('filtra gerencia por IDs y conserva importes exactos con diferencia negativa', () => {
    const result = managementAnalysis(data, { client: 'c1', month: '2026-02' });
    expect(result.projects).toHaveLength(1);
    expect(result.monthly).toEqual([
      { key: '2026-02:payments', label: '2026-02 · Cobros', value: '10.5', unit: 'money', series: 'Cobros' },
      { key: '2026-02:expenses', label: '2026-02 · Gastos', value: '-30.75', unit: 'money', series: 'Gastos' },
      { key: '2026-02:difference', label: '2026-02 · Diferencia', value: '-20.25', unit: 'money', series: 'Diferencia' },
    ]);
    expect(result.balance).toBe('900.15');
    expect(result.projectValue).toBe('1000.25');
    expect(result.periodPaid).toBe('10.5');
    expect(result.periodExpenses).toBe('30.75');
    expect(result.periodDifference).toBe('-20.25');
    expect(result.profitability).toHaveLength(2);
    expect(result.costs).toHaveLength(2);
  });
  it('cuenta responsables únicamente en proyectos activos', () => {
    expect(operationAnalysis(data, { responsible: 'Ana' }).byResponsible).toEqual([{ key: 'Ana', label: 'Ana', value: '1', unit: 'count' }]);
  });
  it('mantiene el conteo numérico en value y representa responsables vacíos con una clave estable', () => {
    const unassigned = { ...data.projects[0], id: 'p2', responsible: '' };
    const chart = operationAnalysis({ ...data, projects: [data.projects[0], unassigned] }, {}).byResponsible;
    expect(chart).toContainEqual({ key: '__unassigned__', label: 'Sin responsable', value: '1', unit: 'count' });
    expect(chart.find((item) => item.key === 'Ana')?.value).toBe('1');
  });
  it('calcula caja por proyecto, conserva gastos negativos en la diferencia y desempata por ID', () => {
    const p2 = { ...data.projects[0], id: 'p2', quote_number: 'COT-002', title: 'Segundo' };
    const result = cashByProject({ ...data, projects: [data.projects[0], p2], payments: [...data.payments, { project_id: 'p2', payment_date: '2026-02-03', amount: '10.5' }], expenses: [...data.expenses, { project_id: 'p2', expense_date: '2026-02-04', amount: '30.75' }] }, { month: '2026-02' });
    expect(result).toEqual([
      { key: 'p1', label: 'COT-001 — Tablero', paid: '10.5', expenses: '30.75', difference: '-20.25' },
      { key: 'p2', label: 'COT-002 — Segundo', paid: '10.5', expenses: '30.75', difference: '-20.25' },
    ]);
  });
  it('mantiene separados los clientes homónimos mediante su identificador', () => {
    const second = { ...data.projects[0], id: 'p2', client_id: 'c2', clients: { name: 'Cliente uno' }, financialSummary: { ...data.projects[0].financialSummary, id: 'p2', balance: '50' } };
    const result = managementAnalysis({ ...data, projects: [data.projects[0], second] }, {});
    expect(result.balances.map((row) => row.key).sort()).toEqual(['c1', 'c2']);
  });
  it('presenta las cotizaciones vencidas y no calcula aprobación sin decisión', () => {
    expect(filterCommercialQuotes(data, { status: 'expired' }, '2026-02-16').map((quote) => quote.id)).toEqual(['q1']);
    const result = commercialAnalysis({ ...data, quotes: [data.quotes[0]] }, {}, '2026-02-16');
    expect(result.expired).toBe(1);
    expect(result.approval).toBe('No calculable');
  });
  it('mide retraso contra la fecha real para finalizados y Bogotá para abiertos', () => {
    expect(delayDays({ status: 'finished', expected_end_date: '2026-01-10', actual_end_date: '2026-01-13' }, '2026-03-01')).toBe(3);
    expect(delayDays({ status: 'in_progress', expected_end_date: '2026-01-10', actual_end_date: null }, '2026-01-12')).toBe(2);
  });
});
