import { decimal } from './calculations';
import { bogotaDate } from './money';
import { quoteDisplayStatus } from './presentation';
import type { AnalyticsExpense, AnalyticsPayment, ProjectWithFinancialSummary, ProjectRecord, QuoteRecord } from './data';

export type AnalyticsData = {
  projects: ProjectWithFinancialSummary<ProjectRecord>[];
  quotes: QuoteRecord[];
  payments: AnalyticsPayment[];
  expenses: AnalyticsExpense[];
};
export type AnalyticsFilters = Record<string, string>;
export type ChartDatum = { key: string; label: string; value: string; count?: number };

export const projectStates = ['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'];
export const quoteStates = ['draft', 'sent', 'approved', 'rejected', 'expired'];
export const activeProjectStates = new Set(['approved', 'in_progress', 'paused']);

const matches = (value: string, filter?: string) => !filter || value === filter;
const clientName = (record: { clients: { name: string } | null }) => record.clients?.name ?? 'Sin cliente';
const monthOf = (date: string) => date.slice(0, 7);

export function filterManagementProjects(data: AnalyticsData, filters: AnalyticsFilters) {
  return data.projects.filter((project) => matches(project.client_id, filters.client) && matches(project.id, filters.project) && matches(project.status, filters.status));
}

export function filterOperationProjects(data: AnalyticsData, filters: AnalyticsFilters) {
  return data.projects.filter((project) => matches(project.client_id, filters.client) && matches(project.responsible, filters.responsible) && matches(project.status, filters.status) && matches(project.priority, filters.priority));
}

export function visibleQuoteStatus(quote: QuoteRecord, today = bogotaDate()) {
  return quoteDisplayStatus(quote, today);
}

export function filterCommercialQuotes(data: AnalyticsData, filters: AnalyticsFilters, today = bogotaDate()) {
  return data.quotes.filter((quote) => matches(quote.client_id, filters.client) && matches(visibleQuoteStatus(quote, today), filters.status) && matches(monthOf(quote.issued_on), filters.month));
}

function grouped<T>(records: T[], key: (record: T) => { key: string; label: string }, value: (record: T) => string) {
  const values = new Map<string, { label: string; value: ReturnType<typeof decimal>; count: number }>();
  for (const record of records) {
    const group = key(record);
    const current = values.get(group.key) ?? { label: group.label, value: decimal(0), count: 0 };
    current.value = current.value.plus(decimal(value(record)));
    current.count += 1;
    values.set(group.key, current);
  }
  return [...values.entries()].map(([key, value]) => ({ key, label: value.label, value: value.value.toString(), count: value.count }));
}

export function managementAnalysis(data: AnalyticsData, filters: AnalyticsFilters) {
  const projects = filterManagementProjects(data, filters);
  const ids = new Set(projects.map((project) => project.id));
  const movements = [
    ...data.payments.filter((payment) => ids.has(payment.project_id)).map((payment) => ({ project_id: payment.project_id, date: payment.payment_date, amount: payment.amount, kind: 'payment' as const })),
    ...data.expenses.filter((expense) => ids.has(expense.project_id)).map((expense) => ({ project_id: expense.project_id, date: expense.expense_date, amount: expense.amount, kind: 'expense' as const })),
  ].filter((movement) => matches(monthOf(movement.date), filters.month));
  const monthly = grouped(movements, (movement) => ({ key: monthOf(movement.date), label: monthOf(movement.date) }), (movement) => movement.kind === 'payment' ? movement.amount : decimal(movement.amount).negated().toString()).sort((a, b) => a.key.localeCompare(b.key));
  const expenses = projects.map((project) => ({ key: project.id, label: project.quote_number || project.title, value: project.financialSummary.expenses, count: 1 }));
  const balances = grouped(projects, (project) => ({ key: project.client_id, label: clientName(project) }), (project) => project.financialSummary.balance).sort((a, b) => decimal(b.value).comparedTo(decimal(a.value)));
  const balance = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.balance)), decimal(0)).toString();
  const profit = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.real_profit)), decimal(0)).toString();
  return { projects, movements, monthly, expenses, balances, balance, profit };
}

export function operationAnalysis(data: AnalyticsData, filters: AnalyticsFilters) {
  const projects = filterOperationProjects(data, filters);
  const byStatus = grouped(projects, (project) => ({ key: project.status, label: project.status }), () => '0');
  const byResponsible = grouped(projects.filter((project) => activeProjectStates.has(project.status)), (project) => ({ key: project.responsible, label: project.responsible || 'Sin responsable' }), () => '0');
  return { projects, byStatus, byResponsible };
}

export function delayDays(project: Pick<ProjectRecord, 'status' | 'expected_end_date' | 'actual_end_date'>, today = bogotaDate()) {
  const reference = project.status === 'finished' && project.actual_end_date ? project.actual_end_date : today;
  if (reference <= project.expected_end_date) return 0;
  const expected = new Date(`${project.expected_end_date}T12:00:00-05:00`).getTime();
  const actual = new Date(`${reference}T12:00:00-05:00`).getTime();
  return Math.round((actual - expected) / 86400000);
}

export function commercialAnalysis(data: AnalyticsData, filters: AnalyticsFilters, today = bogotaDate()) {
  const quotes = filterCommercialQuotes(data, filters, today);
  const byStatus = grouped(quotes, (quote) => ({ key: visibleQuoteStatus(quote, today), label: visibleQuoteStatus(quote, today) }), () => '0');
  const byMonth = grouped(quotes, (quote) => ({ key: monthOf(quote.issued_on), label: monthOf(quote.issued_on) }), (quote) => quote.total_amount).sort((a, b) => a.key.localeCompare(b.key));
  const byClient = grouped(quotes, (quote) => ({ key: quote.client_id, label: clientName(quote) }), (quote) => quote.total_amount).sort((a, b) => decimal(b.value).comparedTo(decimal(a.value)));
  const approved = quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'approved');
  const rejected = quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'rejected');
  const approvedValue = approved.reduce((total, quote) => total.plus(decimal(quote.total_amount)), decimal(0)).toString();
  const decisions = approved.length + rejected.length;
  return { quotes, byStatus, byMonth, byClient, approvedValue, validSent: quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'sent').length, expired: quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'expired').length, approval: decisions ? `${decimal(approved.length).div(decisions).times(100).toFixed(1)}%` : 'No calculable' };
}
