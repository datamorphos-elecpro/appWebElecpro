import { quotePayloadSchema } from '../../lib/validators/quote';
import { calculateQuote } from '../../lib/calculations';

export const fixtureQuoteKey = 'elecpro:test:saved-quote';
export async function saveQuote(input: unknown) {
  const payload = quotePayloadSchema.parse(input);
  const totals = calculateQuote(payload.items.map((item) => ({ category: item.category, quantity: item.quantity, baseUnitPrice: item.base_unit_price, vatPct: item.vat_pct })), {
    materialIncreasePct: payload.material_increase_pct, administrationPct: payload.administration_pct, contingencyPct: payload.contingency_pct,
    utilityPct: payload.utility_pct, vatUtilityPct: payload.vat_utility_pct,
  });
  const data = { ...payload, id: '33333333-3333-4333-8333-333333333333', number: 'COT-20261013000099', updated_at: '2026-10-13T12:00:00Z', total_amount: totals.totalAmount.toString(), quote_items: payload.items.map((item, index) => ({ ...item, position: index + 1 })) };
  localStorage.setItem(fixtureQuoteKey, JSON.stringify(data));
  return { ok: true as const, data };
}
export async function approveAndConvertQuote(input: unknown) {
  const saved = await saveQuote(input);
  const data = { ...saved.data, status: 'approved', project_id: '44444444-4444-4444-8444-444444444444' };
  localStorage.setItem(fixtureQuoteKey, JSON.stringify(data));
  return { ok: true as const, data: { id: data.project_id, quote_id: data.id, source_quote_number: data.number } };
}
export async function saveCompanySettings() {}
