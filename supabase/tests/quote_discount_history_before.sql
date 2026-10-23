-- Base desechable migrada hasta 20261022100000. Ejecutar antes del descuento.
begin;
insert into auth.users(id,email,raw_user_meta_data) values ('c9000000-0000-4000-8000-000000000001','discount-history@example.test','{}');
insert into public.clients(id,name) values ('c9000000-0000-4000-8000-000000000002','Historial descuento');
select set_config('request.jwt.claim.sub','c9000000-0000-4000-8000-000000000001',true);
do $$
declare payload jsonb; q public.quotes;
begin
  payload := '{"client_id":"c9000000-0000-4000-8000-000000000002","title":"Histórico con IVA","status":"approved","issued_on":"2026-10-22","valid_until":"2026-11-01","show_aiu":false,"apply_direct_vat":true,"vat_direct_pct":"19.25","administration_pct":"8","contingency_pct":"3","utility_pct":"10","vat_utility_pct":"19","material_increase_pct":"12.25","items":[{"category":"material","unit":"UND","quantity":"1.25","base_unit_price":"1234.56","vat_pct":"19.25"}]}';
  q := public.save_quote(payload); perform public.convert_quote_to_project(q.id);
  perform public.save_quote(payload || '{"status":"draft","show_aiu":true,"apply_direct_vat":false}');
end $$;
create table private.quote_discount_history_snapshot(entity text,id uuid,data jsonb);
insert into private.quote_discount_history_snapshot
select 'quotes',id,to_jsonb(q) from public.quotes q
union all select 'quote_items',id,to_jsonb(i) from public.quote_items i
union all select 'projects',id,to_jsonb(p) from public.projects p
union all select 'project_budgets',id,to_jsonb(b) from public.project_budgets b
union all select 'summary',id,to_jsonb(s) from public.project_financial_summary s;
commit;
