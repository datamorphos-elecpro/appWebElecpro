export const quoteSegments = { valid: 'Propuestas vigentes', decided: 'Cotizaciones con decisión' };
export const projectSegments = { active: 'Proyectos activos', paid: 'Proyectos con pagos', receivable: 'Proyectos con saldo pendiente', expenses: 'Proyectos con gastos', delayed: 'Proyectos retrasados', ending_soon: 'Próximas finalizaciones' };
export const quoteListOptions = {
  sort: ['created_at', 'number', 'title', 'total_amount'] as const, defaultSort: 'created_at' as const,
  filters: { status: ['', 'draft', 'sent', 'approved', 'rejected', 'expired'] as const, segment: ['', 'valid', 'decided'] as const },
};
export const projectListOptions = {
  sort: ['created_at', 'title', 'status', 'expected_end_date', 'project_value'] as const, defaultSort: 'created_at' as const,
  filters: { status: ['', 'draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled'] as const, segment: ['', 'active', 'paid', 'receivable', 'expenses', 'delayed', 'ending_soon'] as const },
};
export const metricLinks = {
  'Cotizaciones': '/cotizaciones', 'Valor aprobado': '/cotizaciones?status=approved',
  'Propuestas vigentes': '/cotizaciones?segment=valid', 'Tasa de aprobación': '/cotizaciones?segment=decided',
  'Proyectos': '/proyectos', 'Activos': '/proyectos?segment=active', 'Proyectos activos': '/proyectos?segment=active',
  'Valor contratado': '/proyectos', 'Pagos recibidos': '/proyectos?segment=paid',
  'Cartera pendiente': '/proyectos?segment=receivable', 'Gastos acumulados': '/proyectos?segment=expenses',
  'Ganancia actual': '/proyectos', 'Ganancia consolidada': '/proyectos',
  'Proyectos retrasados': '/proyectos?segment=delayed', 'Próximas finalizaciones': '/proyectos?segment=ending_soon',
} as const;
