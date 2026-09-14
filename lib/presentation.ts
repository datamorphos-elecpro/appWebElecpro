import { decimal } from './calculations';
import { bogotaDate, money } from './money';

export const projectStatusLabel: Record<string, string> = { draft: 'Borrador', quoted: 'Cotizado', approved: 'Aprobado', in_progress: 'En proceso', paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado' };
export const quoteStatusLabel: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', approved: 'Aprobada', rejected: 'Rechazada', expired: 'Vencida' };
export const priorityLabel: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };

export function projectStatusText(status: string) { return projectStatusLabel[status] ?? status; }
export function quoteStatusText(status: string) { return quoteStatusLabel[status] ?? status; }
export function priorityText(priority: string) { return priorityLabel[priority] ?? priority; }
export function quoteDisplayStatus(quote: { status: string; valid_until?: string | null }, today = bogotaDate()) {
  return ['draft', 'sent'].includes(quote.status) && quote.valid_until && quote.valid_until < today ? 'expired' : quote.status;
}
export function statusLabel(status: string) { return projectStatusText(status); }
export function presentationLabel(value: string, domain: 'project' | 'quote' | 'priority') {
  return domain === 'project' ? projectStatusText(value) : domain === 'quote' ? quoteStatusText(value) : priorityText(value);
}
export function bogotaDateText(value?: string | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', ...options }).format(new Date(`${value}T12:00:00-05:00`));
}
export function compactMoney(value: Parameters<typeof money>[0]) {
  const amount = decimal(value); const absolute = amount.abs();
  if (absolute.lessThan(1_000_000)) return money(amount);
  const billion = absolute.greaterThanOrEqualTo(1_000_000_000);
  const compact = absolute.div(billion ? 1_000_000_000 : 1_000_000).toDecimalPlaces(1).toFixed(1).replace('.', ',').replace(/,0$/, '');
  return `${amount.isNegative() ? '−' : ''}$ ${compact} ${billion ? 'mil M' : 'M'}`;
}
export { bogotaDate, money };
