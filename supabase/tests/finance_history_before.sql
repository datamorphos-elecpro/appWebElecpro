-- Base desechable migrada hasta 20261013101000. Ejecutar ANTES de la nueva migración.
begin;
insert into auth.users(id,email,raw_user_meta_data) values ('b1000000-0000-4000-8000-000000000001','history@example.test','{}');
insert into public.clients(id,name) values ('b2000000-0000-4000-8000-000000000001','Cliente histórico de pruebas');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
do $$
declare q public.quotes;
begin
  q := public.save_quote('{"client_id":"b2000000-0000-4000-8000-000000000001","title":"Instantánea histórica","status":"approved","issued_on":"2026-10-13","valid_until":"2026-10-28","material_increase_pct":"12.25","administration_pct":"8","contingency_pct":"3","utility_pct":"10","vat_utility_pct":"19","items":[{"category":"material","code":"MAT-HISTORY","description":"Material histórico","unit":"UND","quantity":"1.25","base_unit_price":"1234.56","vat_pct":"19.25"}]}'::jsonb);
  perform public.convert_quote_to_project(q.id);
  perform public.save_quote('{"client_id":"b2000000-0000-4000-8000-000000000001","title":"Borrador histórico","status":"draft","issued_on":"2026-10-13","valid_until":"2026-10-28","administration_pct":"8","contingency_pct":"3","utility_pct":"10","vat_utility_pct":"19","items":[{"category":"labor","code":"MO-HISTORY","description":"Servicio histórico","unit":"UND","quantity":"1.25","base_unit_price":"1234.56","vat_pct":"0"}]}'::jsonb);
end $$;
create table private.finance_history_snapshot(entity text not null,id uuid not null,data jsonb not null);
insert into private.finance_history_snapshot
select 'quotes',id,to_jsonb(q) from public.quotes q
union all select 'quote_items',id,to_jsonb(q) from public.quote_items q
union all select 'projects',id,to_jsonb(p) from public.projects p
union all select 'project_budgets',id,to_jsonb(b) from public.project_budgets b
union all select 'summary',id,to_jsonb(s) from public.project_financial_summary s;
commit;
