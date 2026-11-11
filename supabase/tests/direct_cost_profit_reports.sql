-- Ejecutar en una base de pruebas con todas las migraciones. Se revierte todo.
begin;
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','reporting@example.test','{}');
insert into public.clients(id,name) values ('e2000000-0000-4000-8000-000000000001','Cliente reporting');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare q public.quotes; p public.projects; r record; kind text; aiu boolean;
begin
 foreach kind in array array['percent','fixed'] loop
  foreach aiu in array array[true,false] loop
   q:=public.save_quote(jsonb_build_object('client_id','e2000000-0000-4000-8000-000000000001',
    'title','Reporting','issued_on',current_date,'valid_until',current_date+30,'status','approved',
    'administration_pct',8,'contingency_pct',3,'utility_pct',10,'vat_utility_pct',19,
    'show_aiu',aiu,'apply_direct_vat',true,'vat_direct_pct',19,
    'apply_direct_discount',true,'direct_discount_type',kind,'direct_discount_pct',10,'direct_discount_fixed_amount',100000,
    'items',jsonb_build_array(jsonb_build_object('code','MO-R','description','Servicio','category','labor','unit','UND','quantity',1,'base_unit_price',1000000))));
   p:=public.convert_quote_to_project(q.id);
   select * into strict r from public.project_reporting_details(array[p.id]);
   perform pg_temp.check_true(r.direct_cost::numeric=900000 and r.total_aiu::numeric=206100,'neto y AIU con IVA, visible u oculto');
   perform pg_temp.check_true(r.invoices='[]'::jsonb,'sin facturas');
   perform pg_temp.check_true((select real_profit=900000 and projected_profit=900000-budget from public.project_financial_summary where id=p.id),'ganancia y proyecci?n excluyen AIU e IVA directo');
   perform pg_temp.check_true((public.analytics_management_report('management.expenses',jsonb_build_object('management_project',jsonb_build_array(p.id)))->'projects'->0->>'direct_cost')::numeric=900000,'resumen incluye proyecto sin gastos');
   update public.projects set project_value=9999999 where id=p.id;
   select * into strict r from public.project_reporting_details(array[p.id]);
   perform pg_temp.check_true(r.direct_cost::numeric=900000 and r.total_aiu::numeric=206100,'histórico tras editar valor');
  end loop;
 end loop;
end $$;

reset role;
insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date,profit_mode,initial_profit)
values ('e3000000-0000-4000-8000-000000000002','PRY-PROFIT','e2000000-0000-4000-8000-000000000001','Ganancia',10000000,'approved','Ana','Bogot?',current_date,current_date+30,'manual',123);
set local role authenticated;
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method,note) values ('e3000000-0000-4000-8000-000000000002',current_date,'Materiales',7000000,'Transferencia','Prueba');
insert into public.project_shares(id,project_id,participant,mode,value,basis,execution_date) values ('e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','Ana','fixed',1000000,'real_profit',current_date);
select public.settle_project_shares('e3000000-0000-4000-8000-000000000002',array['e4000000-0000-4000-8000-000000000002'::uuid],current_date,false);
select pg_temp.check_true((select real_profit=2000000 and paid_distributions=1000000 from public.project_financial_summary where id='e3000000-0000-4000-8000-000000000002'),'ejemplo 10 - 7 - 1 = 2; manual ignorado');
do $$
declare report jsonb; metric text;
begin
 foreach metric in array array['management.projectValue','management.balance','management.expenses','management.profit','management.projectedProfit'] loop
 report:=public.analytics_management_report(metric,jsonb_build_object('management_project',jsonb_build_array('e3000000-0000-4000-8000-000000000002')));
 perform pg_temp.check_true((report->'projects'->0->>'real_profit')::numeric=2000000,'ganancia com?n');
 if metric='management.expenses' then
 perform pg_temp.check_true(jsonb_array_length(report->'projects'->0->'expenses_detail')=1 and jsonb_array_length(report->'projects'->0->'distributions')=1,'detalle de gastos y pagos completo');
 end if;
 end loop;
end $$;
select public.settle_project_shares('e3000000-0000-4000-8000-000000000002',array['e4000000-0000-4000-8000-000000000002'::uuid],null,true);
select pg_temp.check_true((select real_profit=3000000 from public.project_financial_summary where id='e3000000-0000-4000-8000-000000000002'),'reapertura restaura ganancia');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','private.project_direct_cost(uuid)','EXECUTE'),'anon bloqueado');
rollback;
