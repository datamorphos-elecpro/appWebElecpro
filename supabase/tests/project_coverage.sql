-- Ejecutar en una base de pruebas con 20261022120000 aplicada. Todo se revierte.
begin;
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000001','coverage@example.test','{}');
insert into public.clients(id,name) values ('b2000000-0000-4000-8000-000000000001','Cliente cobertura');
insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date,profit_mode,initial_profit,created_at)
values ('b3000000-0000-4000-8000-000000000001','PRY-COVERAGE','b2000000-0000-4000-8000-000000000001','Cobertura',100000,'approved','Ana','Bogotá',current_date,current_date+30,'value',0,now()+interval '1 day');
insert into public.project_payments(project_id,payment_date,amount,payment_method)
values ('b3000000-0000-4000-8000-000000000001',current_date,90000,'Transferencia');
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method)
values ('b3000000-0000-4000-8000-000000000001',current_date,'Categoría libre',1000,'Transferencia');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$
declare
  p uuid := 'b3000000-0000-4000-8000-000000000001';
  w public.project_withholdings; row_data jsonb; kind text; result_before jsonb;
begin
  result_before := public.distribution_snapshot_multi(null,null,null)->'metrics';
  foreach kind in array array['income','vat','ica','other'] loop
    w := public.register_project_withholding(jsonb_build_object('project_id',p,'request_id',gen_random_uuid(),
      'withholding_date',current_date,'kind',kind,'amount','10000','note','Prueba de cobertura'));
    select value into row_data from jsonb_array_elements(public.dashboard_snapshot()->'recent_projects') where value->>'id'=p::text;
    perform pg_temp.check_true((row_data->>'withheld')::numeric=10000 and (row_data->>'paid')::numeric=90000,'dashboard separa retenciones y anticipos: '||kind);
    perform pg_temp.check_true((row_data->>'paid')::numeric+(row_data->>'withheld')::numeric=100000,'cobertura completa');
    perform pg_temp.check_true((select balance=0 and expenses=1000 and real_profit=99000 from public.project_financial_summary where id=p),'saldo y resultado');
    perform pg_temp.check_true(not exists(select 1 from public.alerts_page() a where a.project_id=p and a.kind='cartera'),'sin alerta de cartera');
    perform pg_temp.check_true(public.distribution_snapshot_multi(null,null,null)->'metrics'=result_before,'distribuciones sin cambios');
    perform public.void_project_withholding(w.id,'Anulación de prueba');
    select value into row_data from jsonb_array_elements(public.dashboard_snapshot()->'recent_projects') where value->>'id'=p::text;
    perform pg_temp.check_true((row_data->>'withheld')::numeric=0 and (row_data->>'paid')::numeric=90000,'dashboard excluye anuladas');
    perform pg_temp.check_true((select balance=10000 from public.project_financial_summary where id=p),'cartera restaurada');
    perform pg_temp.check_true(exists(select 1 from public.alerts_page() a where a.project_id=p and a.kind='cartera'),'alerta restaurada');
  end loop;
  foreach kind in array array['income','vat','ica','other'] loop
    perform public.register_project_withholding(jsonb_build_object('project_id',p,'request_id',gen_random_uuid(),
      'withholding_date',current_date,'kind',kind,'amount','2500','note','Retención combinada'));
  end loop;
  perform pg_temp.check_true((select paid=90000 and withheld=10000 and balance=0 from public.project_financial_summary where id=p),'suma tipos combinados sin duplicar anuladas');
end $$;

reset role;
update public.profiles set role='administrator' where id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true(jsonb_array_length(public.dashboard_snapshot()->'recent_projects')>0,'administrador puede consultar');
reset role;
update public.profiles set is_active=false where id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true(public.dashboard_snapshot()->'recent_projects'='[]'::jsonb,'inactivo no recibe datos');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.dashboard_snapshot()','EXECUTE'),'anon sin acceso');
rollback;
