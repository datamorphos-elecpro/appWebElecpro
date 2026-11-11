import { decimal } from '../../lib/calculations';
import type { ManagementMetric } from '../../lib/management-report';
import { managementReportSchema } from '../../lib/management-report';
import { pagination } from '../../lib/pagination';

const id = (n: number) => `ab040000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function metricReportFixture(metric: ManagementMetric, empty = typeof location !== 'undefined' && new URLSearchParams(location.search).has('empty')) {
  const rows = Array.from({ length: empty ? 0 : 135 }, (_, n) => {
    const common = { id: id(n + 1), project_id: id(n + 1), client_id: id(n % 3 + 1000), client_name: n % 3 < 2 ? 'Cliente homónimo de ingeniería eléctrica' : 'Cliente tercero', label: `PRY-${String(n + 1).padStart(3, '0')}`, title: `Proyecto de instalación eléctrica y mantenimiento industrial ${n + 1}` };
    if (metric === 'management.expenses') return { ...common, kind: 'expense' as const, date: '2026-11-04', category: n % 2 ? 'Materiales' : 'Mano de obra', note: 'Suministro y montaje de elementos eléctricos', amount: '1200000' };
    return { ...common, kind: 'project' as const, status: n % 2 ? 'approved' : 'in_progress', project_value: '1500000', paid: '100000', withheld: '50000', balance: '1350000', profit_mode: 'value' as const, base: '1500000', paid_distributions: '400000', expenses: '1200000', budget: '1600000', amount: metric === 'management.balance' ? '1350000' : metric === 'management.projectValue' ? '1500000' : '-100000' };
  });
  const projects = rows.map(row => ({...row,project_value:'1500000',direct_cost:'1500000',total_aiu:'0',expenses:'1200000',paid_distributions:'400000',real_profit:'-100000',projected_profit:'-100000',discount:'0',has_quote:false,items:[],expenses_detail:metric==='management.expenses'?[{id:row.id,date:'2026-11-04',category:'Materiales',note:'Gasto de prueba',method:'Transferencia',amount:'1200000'}]:[],distributions:[]}));
  return managementReportSchema.parse({ projects, metric, total: rows.length, value: rows.reduce((sum, row) => sum.plus(row.amount), decimal(0)).toString(), unit: 'money', components: {}, records: rows });
}
export async function commercialFixture() {
  return { snapshot: { metrics: { approvedValue: '1000000', pendingValue: '2000000', validSent: 4, expired: 0, approval: '75' }, byStatus: [{ key: 'sent', label: 'Enviada', value: '4' }], byMonth: [], byClient: [
    { key: id(1000), label: 'Cliente principal', value: '3000001', count: 8, segments: [{ status: 'draft', count: 1, value: '0' }, { status: 'sent', count: 4, value: '2000000' }, { status: 'approved', count: 2, value: '1000000' }, { status: 'rejected', count: 1, value: '1' }] },
    { key: id(1001), label: 'Cliente pequeño', value: '0', count: 2, segments: [{ status: 'draft', count: 2, value: '0' }] },
  ] }, table: { records: [], page: pagination(0, 1, 20) } };
}
export async function operationFixture() {
  return { snapshot: { total: 10, byStatus: [{ key: 'approved', label: 'Aprobado', value: '3' }, { key: 'in_progress', label: 'En proceso', value: '6' }, { key: 'pending_approval', label: 'Pendiente por aprobar', value: '1' }], bySchedule: [{ key: 'overdue', label: 'Atrasados', value: '4' }, { key: 'upcoming', label: 'Próximos a finalizar', value: '3' }, { key: 'later', label: 'Con fecha posterior', value: '2' }] }, table: { records: [], page: pagination(0, 1, 20) } };
}
