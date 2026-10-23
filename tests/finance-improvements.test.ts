import { describe, expect, it } from 'vitest';
import { calculateQuote, projectBalance, projectProfit, alertKinds } from '../lib/calculations';
import { suggestedExpenseCategories } from '../lib/expense-categories';
import { quotePayloadSchema } from '../lib/validators/quote';
import { withholdingSchema, voidWithholdingSchema } from '../lib/validators/withholding';
import { metricLabels, parseAnalysisDetailRequest } from '../lib/analytics-detail';

const rates = { materialIncreasePct: '0', administrationPct: '8', contingencyPct: '3', utilityPct: '10', vatUtilityPct: '19', vatDirectPct: '19' };
const items = [{ category: 'labor' as const, quantity: '1', baseUnitPrice: '1000000' }];

describe('opciones económicas', () => {
  it('suma ambos IVA y conserva el subtotal AIU al ocultar su desglose', () => {
    const result = calculateQuote(items, { ...rates, applyDirectVat: true });
    expect(result.serviceSubtotal.toString()).toBe('1210000');
    expect(result.vatUtilityAmount.toString()).toBe('19000');
    expect(result.vatDirectAmount.toString()).toBe('190000');
    expect(result.totalAmount.toString()).toBe('1419000');
    expect(calculateQuote(items, rates).totalAmount.toString()).toBe('1229000');
  });
  it('usa como base el costo directo con IVA por ítem e incremento, sin modificar presupuesto', () => {
    const result = calculateQuote([{ category: 'material', quantity: '2', baseUnitPrice: '100000', vatPct: '19' }], { ...rates, materialIncreasePct: '10', applyDirectVat: true });
    expect(result.directCost.toString()).toBe('261800');
    expect(result.vatDirectAmount.toString()).toBe('49742');
    expect(result.lines[0].costTotal.toString()).toBe('238000');
    expect(calculateQuote(items, { ...rates, applyDirectVat: false, vatDirectPct: '100' }).vatDirectAmount.toString()).toBe('0');
  });
  it('aplica defaults compatibles y valida la tasa aunque el impuesto esté apagado', () => {
    const input = { client_id: '22222222-2222-4222-8222-222222222222', title: 'Prueba', status: 'draft', issued_on: '2026-10-22', valid_until: '2026-11-01',
      material_increase_pct: '0', administration_pct: '8', contingency_pct: '3', utility_pct: '10', vat_utility_pct: '19',
      items: [{ category: 'labor', quantity: '1', unit: 'UND', description: 'Servicio', code: '', base_unit_price: '1000000' }] };
    expect(quotePayloadSchema.parse(input)).toMatchObject({ show_aiu: true, apply_direct_vat: false, vat_direct_pct: '19' });
    expect(quotePayloadSchema.parse({ ...input, show_aiu: false, apply_direct_vat: true, vat_direct_pct: '19,25' }).vat_direct_pct).toBe('19.25');
    for (const vat_direct_pct of ['-1', '100.01', '19.123']) expect(quotePayloadSchema.safeParse({ ...input, vat_direct_pct }).success).toBe(false);
  });
});

describe('retenciones y categorías', () => {
  it('cierra cartera sin cambiar efectivo, gastos ni ganancia y conserva proyectos antiguos', () => {
    expect(projectBalance('10000000', '9600000', '400000').toString()).toBe('0');
    expect(projectBalance('10000000', '9600000').toString()).toBe('400000');
    expect(projectProfit('value', '10000000', '0', '3000000').toString()).toBe('7000000');
    const project = { status: 'approved', expectedEnd: '2026-12-01', expenses: '0', budget: '0', value: '10000000', paid: '9600000', withheld: '400000' };
    expect(alertKinds(project, '2026-10-22')).not.toContain('cartera');
    expect(alertKinds({ ...project, withheld: '0' }, '2026-10-22')).toContain('cartera');
  });
  it('exige valores positivos, fecha real, identificación de solicitud y motivos', () => {
    const input = { project_id: '11111111-1111-4111-8111-111111111111', request_id: '22222222-2222-4222-8222-222222222222', withholding_date: '2026-10-22', kind: 'other', amount: '100', note: 'Retención contractual' };
    expect(withholdingSchema.safeParse(input).success).toBe(true);
    for (const changes of [{ amount: '0' }, { amount: '-1' }, { amount: '1.001' }, { amount: 'no es dinero' }, { amount: 'NaN' }, { note: '  ' }, { withholding_date: '2026-02-30' }, { request_id: '' }]) expect(withholdingSchema.safeParse({ ...input, ...changes }).success).toBe(false);
    expect(voidWithholdingSchema.safeParse({ id: input.project_id, reason: ' ' }).success).toBe(false);
  });
  it('ofrece únicamente las once categorías en el orden definido', () => {
    expect(suggestedExpenseCategories).toEqual(['Materiales', 'Mano de obra', 'Transporte', 'Terceros', 'Equipos', 'Alquiler de equipos', 'Herramientas', 'Viáticos y alimentación', 'Ingeniería y diseño', 'Permisos y certificaciones', 'Varios']);
  });
});

describe('contrato de los 14 desgloses', () => {
  it.each(Object.keys(metricLabels))('acepta %s y paginación independiente de la tabla principal', (metric) => {
    const input = parseAnalysisDetailRequest(new URLSearchParams({ metric, page: '2', pageSize: '50', management_page: '7', management_month: '2026-01' }));
    expect(input.page).toBe(2); expect(input.pageSize).toBe(50);
    expect(input.filters).not.toHaveProperty('management_month');
  });
  it('rechaza métricas, IDs, estados, periodos y páginas inválidos', () => {
    const invalid: Record<string, string>[] = [{ metric: 'otro' }, { management_client: 'no-uuid' }, { management_status: 'unknown' }, { metric: 'commercial.approvedValue', commercial_month: '2026-13' }, { page: '0' }, { page: '1.5' }, { pageSize: '200' }];
    for (const values of invalid) expect(() => parseAnalysisDetailRequest(new URLSearchParams({ metric: 'management.projectValue', ...values }))).toThrow();
    expect(() => parseAnalysisDetailRequest(new URLSearchParams('metric=management.projectValue&metric=distribution.paid'))).toThrow();
  });
  it('los filtros de otras pestañas no interfieren con el detalle activo', () => {
    const input = parseAnalysisDetailRequest(new URLSearchParams('metric=management.projectValue&commercial_month=valor-invalido&distribution_payment=otro'));
    expect(input.filters.commercial_month).toBe(''); expect(input.filters.distribution_payment).toEqual([]);
  });
});
