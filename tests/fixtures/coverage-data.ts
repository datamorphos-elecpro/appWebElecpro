import { pagination } from '../../lib/pagination';

export const coverageProject = {
  id: '33333333-3333-4333-8333-333333333333', client_id: '22222222-2222-4222-8222-222222222222', title: 'Instalación eléctrica', quote_number: 'PRY-TEST',
  status: 'approved', priority: 'medium', responsible: 'Ana', clients: { name: 'Cliente de prueba' }, expected_end_date: '2099-12-01', actual_end_date: null,
  project_value: '100000', paid: '90000', withheld: '10000', balance: '0', expenses: '1000', budget: '2000', real_profit: '99000', projected_profit: '98000',
};
export async function getDashboardSnapshot() {
  return { financial: { ...coverageProject, contracted: '100000' }, project_total: 1, active_total: 1, delayed_total: 0, soon_total: 0, alert_total: 0, recent_projects: [coverageProject], priority_alerts: [] };
}
export async function getProjectPage() { return { records: [{ ...coverageProject, financialSummary: coverageProject }], page: pagination(1, 1, 20) }; }
export async function getQuoteProjectDashboard() { return { projects: { metrics: { count: 1, contracted_value: '100000', active_count: 1, active_value: '100000', consolidated_profit: '99000' } } }; }
export async function getFilterOptions() { return { clients: [], projects: [], responsible: [] }; }
export async function getManagement() {
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
