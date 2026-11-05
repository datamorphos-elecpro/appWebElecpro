import { bogotaDate } from './money';
import { decimal } from './calculations';

export const scheduleOptions = [
  { value: 'overdue', label: 'Atrasados' },
  { value: 'upcoming', label: 'Próximos a finalizar' },
  { value: 'later', label: 'Con fecha posterior' },
] as const;
export type OperationSchedule = '' | typeof scheduleOptions[number]['value'];
export function projectSchedule(project: { status: string; expected_end_date: string }, today = bogotaDate()): OperationSchedule {
  if (!['approved', 'in_progress', 'paused'].includes(project.status)) return '';
  if (project.expected_end_date < today) return 'overdue';
  const limit = new Date(`${today}T12:00:00-05:00`); limit.setUTCDate(limit.getUTCDate() + 15);
  return project.expected_end_date <= limit.toISOString().slice(0, 10) ? 'upcoming' : 'later';
}
const statusOrder = ['draft', 'quoted', 'pending_approval', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'];
export function sortProjectStatuses<T extends { key: string; value: string | number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => decimal(b.value).comparedTo(a.value) || statusOrder.indexOf(a.key) - statusOrder.indexOf(b.key));
}
