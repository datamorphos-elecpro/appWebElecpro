import { decimal } from './calculations';
import { bogotaDate, money } from './money';

export const projectStatusLabel: Record<string, string> = { draft: 'Borrador', quoted: 'Cotizado', approved: 'Aprobado', in_progress: 'En proceso', paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado' };
export const quoteStatusLabel: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', approved: 'Aprobada', rejected: 'Rechazada', expired: 'Vencida' };
export const priorityLabel: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
export const categoryLabel: Record<string, string> = { material: 'Material', design: 'Diseño', technical_visit: 'Visita Técnica', labor: 'Servicio MO' };
export const roleLabel: Record<string, string> = { administrator: 'Administrador', management: 'Gerencia' };
export const profitModeLabel: Record<string, string> = { value: 'Valor del proyecto', manual: 'Ganancia manual' };
export const shareModeLabel: Record<string, string> = { percent: 'Porcentaje', fixed: 'Valor fijo' };
export const shareBasisLabel: Record<string, string> = { project_value: 'Valor del proyecto', real_profit: 'Ganancia real', portfolio_profit: 'Ganancia consolidada' };
export const categoryOptions = [
  { value: 'material', label: categoryLabel.material, prefix: 'MAT' },
  { value: 'design', label: categoryLabel.design, prefix: 'DIS' },
  { value: 'technical_visit', label: categoryLabel.technical_visit, prefix: 'VIS' },
  { value: 'labor', label: categoryLabel.labor, prefix: 'MO' },
] as const;
export type CatalogCategory = (typeof categoryOptions)[number]['value'];
export type ControlledDomain = 'project' | 'quote' | 'priority' | 'category' | 'role' | 'profitMode' | 'shareMode' | 'shareBasis';

function controlledText(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) return 'Sin clasificar';
  return labels[value] ?? 'Sin clasificar';
}

export function projectStatusText(status: string | null | undefined) { return controlledText(status, projectStatusLabel); }
export function quoteStatusText(status: string | null | undefined) { return controlledText(status, quoteStatusLabel); }
export function priorityText(priority: string | null | undefined) { return controlledText(priority, priorityLabel); }
export function categoryText(category: string | null | undefined) { return controlledText(category, categoryLabel); }
export function roleText(role: string | null | undefined) { return controlledText(role, roleLabel); }
export function profitModeText(mode: string | null | undefined) { return controlledText(mode, profitModeLabel); }
export function shareModeText(mode: string | null | undefined) { return controlledText(mode, shareModeLabel); }
export function shareBasisText(basis: string | null | undefined) { return controlledText(basis, shareBasisLabel); }
export function quoteDisplayStatus(quote: { status: string; valid_until?: string | null }, today = bogotaDate()) {
  return ['draft', 'sent'].includes(quote.status) && quote.valid_until && quote.valid_until < today ? 'expired' : quote.status;
}
export function statusLabel(status: string) { return projectStatusText(status); }
export function presentationLabel(value: string, domain: ControlledDomain) {
  const labels = {
    project: projectStatusLabel,
    quote: quoteStatusLabel,
    priority: priorityLabel,
    category: categoryLabel,
    role: roleLabel,
    profitMode: profitModeLabel,
    shareMode: shareModeLabel,
    shareBasis: shareBasisLabel,
  }[domain];
  return controlledText(value, labels);
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

