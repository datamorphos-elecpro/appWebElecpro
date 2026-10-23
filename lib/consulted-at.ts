/** Preserve the server timestamp only when it represents an actual instant. */
export function normalizeConsultedAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isFinite(new Date(value).getTime()) ? value : null;
}
