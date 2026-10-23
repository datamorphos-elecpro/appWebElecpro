import { z } from 'zod';

export const metricLabels = {
  'management.projectValue': 'Valor de proyectos', 'management.balance': 'Cartera pendiente', 'management.expenses': 'Gastos reales',
  'management.profit': 'Resultado actual', 'management.projectedProfit': 'Resultado proyectado',
  'commercial.approvedValue': 'Valor aprobado', 'commercial.validSent': 'Propuestas vigentes', 'commercial.expired': 'Vencidas', 'commercial.approval': 'Aprobación',
  'distribution.result': 'Resultado', 'distribution.paid': 'Pagado', 'distribution.pending': 'Pendiente', 'distribution.assigned': 'Asignado', 'distribution.available': 'Disponible',
} as const;
export type AnalysisMetric = keyof typeof metricLabels;
const metrics = Object.keys(metricLabels) as [AnalysisMetric, ...AnalysisMetric[]];
const projectStatuses = ['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'] as const;
const quoteStatuses = ['draft', 'sent', 'approved', 'rejected', 'expired'] as const;
const ids = z.array(z.string().uuid()).max(500);
const filtersSchema = z.object({
  management_client: ids, management_project: ids, management_status: z.array(z.enum(projectStatuses)).max(7),
  commercial_client: ids, commercial_status: z.array(z.enum(quoteStatuses)).max(5),
  commercial_month: z.string().regex(/^(?:\d{4}-(?:0[1-9]|1[0-2]))?$/),
  distribution_q: z.string().trim().max(200),
  distribution_activity: z.array(z.enum(['active', 'inactive'])).max(2),
  distribution_payment: z.array(z.enum(['paid', 'pending'])).max(2),
});
export type AnalysisDetailFilters = z.infer<typeof filtersSchema>;
const detailRequestSchema = z.object({
  metric: z.enum(metrics), filters: filtersSchema,
  page: z.coerce.number().int().min(1).max(10000000), pageSize: z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])),
});
export function parseAnalysisDetailRequest(params: URLSearchParams) {
  const single = (key: string, fallback = '') => {
    if (params.getAll(key).length > 1) throw new Error(`Parámetro repetido: ${key}`);
    return params.get(key) ?? fallback;
  };
  const multiple = (key: string) => [...new Set(params.getAll(key))];
  const metric = z.enum(metrics).parse(single('metric'));
  const activeMultiple = (key: string) => key.startsWith(`${metric.split('.')[0]}_`) ? multiple(key) : [];
  const activeSingle = (key: string) => key.startsWith(`${metric.split('.')[0]}_`) ? single(key) : '';
  return detailRequestSchema.parse({ metric, page: single('page', '1'), pageSize: single('pageSize', '20'), filters: {
    management_client: activeMultiple('management_client'), management_project: activeMultiple('management_project'), management_status: activeMultiple('management_status'),
    commercial_client: activeMultiple('commercial_client'), commercial_status: activeMultiple('commercial_status'), commercial_month: activeSingle('commercial_month'),
    distribution_q: activeSingle('distribution_q'), distribution_activity: activeMultiple('distribution_activity'), distribution_payment: activeMultiple('distribution_payment'),
  } });
}

const rowBase = z.object({ id: z.string().uuid(), label: z.string(), amount: z.string() });
export const analysisDetailResponseSchema = z.object({
  metric: z.enum(metrics), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  value: z.string().nullable(), unit: z.enum(['money', 'count', 'percent']), components: z.record(z.string()),
  records: z.array(z.discriminatedUnion('kind', [
    rowBase.extend({ kind: z.literal('project'), project_id: z.string().uuid(), title: z.string(), client_name: z.string(), status: z.string(),
      project_value: z.string(), paid: z.string(), withheld: z.string(), balance: z.string(), profit_mode: z.enum(['value', 'manual']), base: z.string(), expenses: z.string(), budget: z.string() }),
    rowBase.extend({ kind: z.literal('expense'), project_id: z.string().uuid(), title: z.string(), client_name: z.string(), date: z.string(), category: z.string(), note: z.string() }),
    rowBase.extend({ kind: z.literal('quote'), quote_id: z.string().uuid(), title: z.string(), client_name: z.string(), status: z.string(), date: z.string(), valid_until: z.string(), quote_value: z.string() }),
    rowBase.extend({ kind: z.literal('distribution'), mode: z.enum(['percent', 'fixed']), rule_value: z.string(), is_paid: z.boolean(), is_active: z.boolean(), date: z.string().nullable(), paid_amount: z.string() }),
  ])),
});
export type AnalysisDetail = z.infer<typeof analysisDetailResponseSchema>;
export type AnalysisDetailRow = AnalysisDetail['records'][number];
