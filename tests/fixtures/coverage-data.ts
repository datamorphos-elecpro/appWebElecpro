import type { AlertRecord } from '../../lib/data';
import { pagination } from '../../lib/pagination';

export const coverageProject = {
  id: '33333333-3333-4333-8333-333333333333', client_id: '22222222-2222-4222-8222-222222222222', title: 'Instalación eléctrica', quote_number: 'PRY-TEST',
  status: 'approved', priority: 'medium', responsible: 'Ana', clients: { name: 'Cliente de prueba' }, expected_end_date: '2099-12-01', actual_end_date: null,
  project_value: '100000', paid: '90000', withheld: '10000', balance: '0', expenses: '1000', budget: '2000', real_profit: '99000', projected_profit: '98000',
};
export async function getDashboardSnapshot() {
  return { consulted_at: fixtureTimestamp(), financial: { ...coverageProject, contracted: '100000' }, project_total: 1, active_total: 1, delayed_total: 0, soon_total: 0, alert_total: fixtureAlerts().length, recent_projects: [coverageProject], priority_alerts: fixtureAlerts() };
}
function fixtureTimestamp() {
  const params = new URLSearchParams(location.search);
  if (params.get('date') === 'missing') return undefined;
  return params.has('date') ? params.get('date') : '2026-10-23T15:00:00Z';
}
export async function getAlertsPage() { return { records: fixtureAlerts(), page: pagination(fixtureAlerts().length, 1, 20), consulted_at: fixtureTimestamp() }; }
export async function getProjectPage() { return { records: [{ ...coverageProject, financialSummary: coverageProject }], page: pagination(1, 1, 20) }; }
export async function getQuoteProjectDashboard() { return { projects: { metrics: { count: 1, contracted_value: '100000', active_count: 1, active_value: '100000', consolidated_profit: '99000' } } }; }
export async function getFilterOptions() { return { clients: [], projects: [], responsible: [] }; }
export async function getManagement(input?: { page?: number }) {
  const months = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('months')) : 0;
  if (months) {
    const records = Array.from({ length: 135 }, (_, i) => ({ ...coverageProject, id: `p-${i}`, quote_number: `PRY-${i}`, title: `Proyecto con nombre extenso ${i}`, project_value: '999999999999', balance: '999999999999', paid: '999999999999', withheld: '999999999999', budget: '999999999999', expenses: '999999999999', real_profit: '-999999999999' }));
    const page = input?.page ?? 1;
    return {
      snapshot: { metrics: { paid: '999999999999', budget: '999999999999', projectValue: '999999999999', balance: '999999999999', expenses: '999999999999', profit: '-999999999999', projectedProfit: '999999999999' }, monthly: Array.from({ length: months }, (_, i) => ({ label: `Mes ${i}`, key: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, paid: String((i + 1) * 1000000), expenses: '500000', difference: String((i + 1) * 1000000 - 500000) })), period: { paid: '999999999999', expenses: '500000', movementCount: months * 2 }, cashByProject: [], budgetExecution: [], profitMargins: [], excluded: { budgetExecution: 0, profitMargins: 0 }, balances: Array.from({ length: 45 }, (_, i) => ({ key: `c-${i}`, label: `Cliente ${i} con razón social muy larga de ingeniería eléctrica y mantenimiento industrial`, value: String((i + 1) * 1000000) })) },
      table: { records: records.slice((page - 1) * 100, page * 100), page: pagination(records.length, page, 100) },
    };
  }
  return {
    snapshot: {
      metrics: { projectValue: '100000', paid: '90000', balance: '0', expenses: '1000', budget: '2000', profit: '99000', projectedProfit: '98000' },
      period: { paid: '90000', expenses: '1000', movementCount: 2 },
      monthly: [{ key: '2026-10', label: 'Octubre', paid: '90000', expenses: '1000', difference: '89000' }],
      balances: [], cashByProject: [], budgetExecution: [], profitMargins: [], excluded: { budgetExecution: 1, profitMargins: 1 },
    },
    table: { records: [coverageProject], page: pagination(1, 1, 20) },
  };
}
export async function getCommercial() { throw new Error('Fuera de esta fixture'); }
export async function getOperation() { throw new Error('Fuera de esta fixture'); }
export async function requireProfile() { return {}; }

function fixtureAlerts(): AlertRecord[] {
  if (!new URLSearchParams(location.search).has('alerts')) return [];
  return (['retraso', 'sobrecosto', 'cartera', 'finalizacion_proxima'] as const).map((kind) => ({
    ...coverageProject, id: kind, project_id: coverageProject.id, kind, client_name: 'Cliente de prueba',
    consulted_on: '2026-10-23', consulted_at: '2026-10-23T15:00:00Z',
  }));
}
