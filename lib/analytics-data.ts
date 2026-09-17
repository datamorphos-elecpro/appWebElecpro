import { decimal } from './calculations';
import { bogotaDate } from './money';
import { projectStatusText, quoteDisplayStatus, quoteStatusText } from './presentation';
import type { AnalyticsExpense, AnalyticsPayment, ProjectRecord, ProjectWithFinancialSummary, QuoteRecord } from './data';
import type { ChartDatum, ChartUnit } from './chart-data';

export type AnalyticsData = {
  projects: ProjectWithFinancialSummary<ProjectRecord>[];
  quotes: QuoteRecord[];
  payments: AnalyticsPayment[];
  expenses: AnalyticsExpense[];
  shares: PortfolioShare[];
  portfolioSummary: PortfolioFinancialSummary;
};
export type PortfolioShare = { id: string; participant: string; mode: 'percent' | 'fixed'; value: string; is_paid: boolean; paid_on: string | null };
export type PortfolioFinancialSummary = { contracted: string; paid: string; balance: string; expenses: string; budget: string; real_profit: string; projected_profit: string };
export type AnalyticsFilters = Record<string, string>;
export type { ChartDatum, ChartUnit } from './chart-data';
export type ProjectCashDatum = { key: string; label: string; paid: string; expenses: string; difference: string };

export const projectStates = ['draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'];
export const quoteStates = ['draft', 'sent', 'approved', 'rejected', 'expired'];
export const activeProjectStates = new Set(['approved', 'in_progress', 'paused']);

const matches = (value: string, filter?: string) => !filter || value === filter;
const clientName = (record: { clients: { name: string } | null }) => record.clients?.name ?? 'Sin cliente';
const monthOf = (date: string) => date.slice(0, 7);
const countValue = () => '1';

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

function grouped<T>(records: T[], key: (record: T) => { key: string; label: string }, value: (record: T) => string, unit: ChartUnit = 'money') {
  const values = new Map<string, { label: string; value: ReturnType<typeof decimal> }>();
  for (const record of records) {
    const group = key(record);
    const current = values.get(group.key) ?? { label: group.label, value: decimal(0) };
    current.value = current.value.plus(decimal(value(record)));
    values.set(group.key, current);
  }
  return [...values.entries()].map(([key, value]) => ({ key, label: value.label, value: value.value.toString(), unit }));
}

function monthlyCash(payments: AnalyticsPayment[], expenses: AnalyticsExpense[], monthFilter?: string): ChartDatum[] {
  const months = new Map<string, { payments: ReturnType<typeof decimal>; expenses: ReturnType<typeof decimal> }>();
  for (const payment of payments) {
    const month = monthOf(payment.payment_date);
    if (!matches(month, monthFilter)) continue;
    const row = months.get(month) ?? { payments: decimal(0), expenses: decimal(0) };
    row.payments = row.payments.plus(payment.amount);
    months.set(month, row);
  }
  for (const expense of expenses) {
    const month = monthOf(expense.expense_date);
    if (!matches(month, monthFilter)) continue;
    const row = months.get(month) ?? { payments: decimal(0), expenses: decimal(0) };
    row.expenses = row.expenses.plus(expense.amount);
    months.set(month, row);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([month, row]) => [
    { key: `${month}:payments`, label: `${month} · Cobros`, value: row.payments.toString(), unit: 'money' as const, series: 'Cobros' },
    { key: `${month}:expenses`, label: `${month} · Gastos`, value: row.expenses.negated().toString(), unit: 'money' as const, series: 'Gastos' },
    { key: `${month}:difference`, label: `${month} · Diferencia`, value: row.payments.minus(row.expenses).toString(), unit: 'money' as const, series: 'Diferencia' },
  ]);
}

/** Mirrors the management RPC: cash movement only, top ten, stable by project ID. */
export function cashByProject(data: AnalyticsData, filters: AnalyticsFilters): ProjectCashDatum[] {
  const projects = filterManagementProjects(data, filters);
  const allowed = new Map(projects.map((project) => [project.id, project]));
  const totals = new Map<string, { paid: ReturnType<typeof decimal>; expenses: ReturnType<typeof decimal> }>();
  for (const payment of data.payments) {
    if (!allowed.has(payment.project_id) || !matches(monthOf(payment.payment_date), filters.month)) continue;
    const total = totals.get(payment.project_id) ?? { paid: decimal(0), expenses: decimal(0) };
    total.paid = total.paid.plus(payment.amount); totals.set(payment.project_id, total);
  }
  for (const expense of data.expenses) {
    if (!allowed.has(expense.project_id) || !matches(monthOf(expense.expense_date), filters.month)) continue;
    const total = totals.get(expense.project_id) ?? { paid: decimal(0), expenses: decimal(0) };
    total.expenses = total.expenses.plus(expense.amount); totals.set(expense.project_id, total);
  }
  return [...totals.entries()].map(([key, total]) => {
    const project = allowed.get(key)!;
    return { key, label: [project.quote_number, project.title].filter(Boolean).join(' — '), paid: total.paid.toString(), expenses: total.expenses.toString(), difference: total.paid.minus(total.expenses).toString() };
  }).sort((a, b) => decimal(b.paid).plus(b.expenses).comparedTo(decimal(a.paid).plus(a.expenses)) || a.key.localeCompare(b.key)).slice(0, 10);
}

export function managementAnalysis(data: AnalyticsData, filters: AnalyticsFilters) {
  const projects = filterManagementProjects(data, filters);
  const ids = new Set(projects.map((project) => project.id));
  const payments = data.payments.filter((payment) => ids.has(payment.project_id));
  const expensesData = data.expenses.filter((expense) => ids.has(expense.project_id));
  const movements = [
    ...payments.map((payment) => ({ project_id: payment.project_id, date: payment.payment_date, amount: payment.amount, kind: 'payment' as const })),
    ...expensesData.map((expense) => ({ project_id: expense.project_id, date: expense.expense_date, amount: expense.amount, kind: 'expense' as const })),
  ].filter((movement) => matches(monthOf(movement.date), filters.month));
  const monthly = monthlyCash(payments, expensesData, filters.month);
  const expenses = projects.map((project) => ({ key: project.id, label: project.quote_number || project.title, value: project.financialSummary.expenses, unit: 'money' as const }));
  const balances = grouped(projects, (project) => ({ key: project.client_id, label: clientName(project) }), (project) => project.financialSummary.balance).sort((a, b) => decimal(b.value).comparedTo(decimal(a.value)));
  const profitability = projects.flatMap((project) => [
    { key: `${project.id}:real`, label: `${project.quote_number || project.title} · actual`, value: project.financialSummary.real_profit, unit: 'money' as const, series: 'Actual' },
    { key: `${project.id}:projected`, label: `${project.quote_number || project.title} · proyectado`, value: project.financialSummary.projected_profit, unit: 'money' as const, series: 'Proyectado' },
  ]);
  const costs = projects.flatMap((project) => [
    { key: `${project.id}:budget`, label: `${project.quote_number || project.title} · presupuesto`, value: project.financialSummary.budget, unit: 'money' as const, series: 'Presupuesto' },
    { key: `${project.id}:expenses`, label: `${project.quote_number || project.title} · gastos`, value: project.financialSummary.expenses, unit: 'money' as const, series: 'Gastos' },
  ]);
  const projectValue = projects.reduce((total, project) => total.plus(decimal(project.project_value)), decimal(0)).toString();
  const paid = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.paid)), decimal(0)).toString();
  const balance = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.balance)), decimal(0)).toString();
  const expensesTotal = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.expenses)), decimal(0)).toString();
  const budget = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.budget)), decimal(0)).toString();
  const profit = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.real_profit)), decimal(0)).toString();
  const projectedProfit = projects.reduce((total, project) => total.plus(decimal(project.financialSummary.projected_profit)), decimal(0)).toString();
  const periodPaid = movements.filter((movement) => movement.kind === 'payment').reduce((total, movement) => total.plus(decimal(movement.amount)), decimal(0)).toString();
  const periodExpenses = movements.filter((movement) => movement.kind === 'expense').reduce((total, movement) => total.plus(decimal(movement.amount)), decimal(0)).toString();
  const periodDifference = decimal(periodPaid).minus(periodExpenses).toString();
  return { projects, movements, monthly, expenses, balances, profitability, costs, projectValue, paid, balance, expensesTotal, budget, profit, projectedProfit, periodPaid, periodExpenses, periodDifference };
}

export const unassignedResponsibleKey = '__unassigned__';

export function operationAnalysis(data: AnalyticsData, filters: AnalyticsFilters) {
  const projects = filterOperationProjects(data, filters);
  const byStatus = grouped(projects, (project) => ({ key: project.status, label: projectStatusText(project.status) }), countValue, 'count');
  const byResponsible = grouped(projects.filter((project) => activeProjectStates.has(project.status)), (project) => ({ key: project.responsible || unassignedResponsibleKey, label: project.responsible || 'Sin responsable' }), countValue, 'count');
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
  const byStatus = grouped(quotes, (quote) => ({ key: visibleQuoteStatus(quote, today), label: quoteStatusText(visibleQuoteStatus(quote, today)) }), countValue, 'count');
  const byMonth = grouped(quotes, (quote) => ({ key: monthOf(quote.issued_on), label: monthOf(quote.issued_on) }), (quote) => quote.total_amount).sort((a, b) => a.key.localeCompare(b.key));
  const byClient = grouped(quotes, (quote) => ({ key: quote.client_id, label: clientName(quote) }), (quote) => quote.total_amount).sort((a, b) => decimal(b.value).comparedTo(decimal(a.value)));
  const approved = quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'approved');
  const rejected = quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'rejected');
  const approvedValue = approved.reduce((total, quote) => total.plus(decimal(quote.total_amount)), decimal(0)).toString();
  const decisions = approved.length + rejected.length;
  return { quotes, byStatus, byMonth, byClient, approvedValue, validSent: quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'sent').length, expired: quotes.filter((quote) => visibleQuoteStatus(quote, today) === 'expired').length, approval: decisions ? `${decimal(approved.length).div(decisions).times(100).toFixed(1)}%` : 'No calculable' };
}
