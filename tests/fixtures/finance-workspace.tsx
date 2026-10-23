import { createRoot } from 'react-dom/client';
import { AnalysisMetricCard } from '../../components/analytics/MetricDetail';
import { ProjectWorkspace } from '../../components/projects/ProjectWorkspace';
import { metricLabels, type AnalysisMetric } from '../../lib/analytics-detail';
import { projectBalance, projectProfit } from '../../lib/calculations';
import { pagination } from '../../lib/pagination';
import '../../app/globals.css';

const params = new URLSearchParams(location.search);
const project = { id: '33333333-3333-4333-8333-333333333333', title: 'Instalación eléctrica', quote_number: 'PRY-TEST', client_id: '22222222-2222-4222-8222-222222222222', clients: { name: 'Cliente de prueba' }, project_value: '10000000', status: 'approved', priority: 'medium', responsible: 'Ana', address: 'Bogotá', profit_mode: 'value', initial_profit: '0', start_date: '2026-10-22', expected_end_date: '2026-11-22' };
const financial = { paid: '9600000', withheld: '200000', balance: '200000', expenses: '1000', budget: '2000', real_profit: '9999000', projected_profit: '9998000' };
if (params.has('coverage')) {
  project.project_value = params.get('value') ?? '100000';
  financial.paid = params.get('paid') ?? '90000';
  financial.withheld = params.get('withheld') ?? '10000';
  financial.balance = projectBalance(project.project_value, financial.paid, financial.withheld).toString();
  financial.real_profit = projectProfit('value', project.project_value, '0', financial.expenses).toString();
  financial.projected_profit = projectProfit('value', project.project_value, '0', financial.budget).toString();
}
const withholdings = [{ id: '55555555-5555-4555-8555-555555555555', project_id: project.id, withholding_date: '2026-10-22', kind: 'income' as const, amount: '200000', note: '', request_id: '66666666-6666-4666-8666-666666666666', voided_at: null, voided_by: null, void_reason: null, created_by: '11111111-1111-4111-8111-111111111111', created_at: '2026-10-22T12:00:00Z' }];
createRoot(document.getElementById('root')!).render(params.get('view') === 'project' ? <ProjectWorkspace project={project} summary={financial} section={params.get('section') === 'costs' ? 'costs' : params.get('section') === 'summary' ? 'summary' : 'payments'} withholdings={{ records: withholdings, page: pagination(1,1,20) }} payments={{ records: [], page: pagination(0,1,20) }} expenses={{ records: [{ id: 'old-expense', category: 'Categoría histórica especial', amount: '100', expense_date: '2026-10-22', payment_method: 'Transferencia', note: '' }], page: pagination(1,1,20) }} /> : <main style={{ padding: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>{(Object.entries(metricLabels) as [AnalysisMetric, string][]).map(([metric, label]) => <AnalysisMetricCard key={metric} metric={metric} label={label} value="0" />)}</main>);
