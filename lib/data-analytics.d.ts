import './data';

declare module './data' {
  export type AnalyticsPayment = { project_id: string; payment_date: string; amount: string };
  export type AnalyticsExpense = { project_id: string; expense_date: string; amount: string };
}
