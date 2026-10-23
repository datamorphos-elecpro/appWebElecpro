-- Base de pruebas con 20261023100000 aplicada. Ejecutar con ON_ERROR_STOP. Todo se revierte.
begin;
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('ca100000-0000-4000-8000-000000000001','current-alerts@example.test','{}');
insert into public.clients(id,name) values ('ca200000-0000-4000-8000-000000000001','Cliente alertas vigentes');
insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date,profit_mode,initial_profit,created_at)
select ('ca300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ALERTA-TEST-'||n,
 'ca200000-0000-4000-8000-000000000001','Instalación verificable '||n,1000,'approved','Ana','Bogotá',
 (now() at time zone 'America/Bogota')::date-30,
 (now() at time zone 'America/Bogota')::date + case n when 1 then -1 when 2 then 0 when 3 then 15 else 16 end,
 'value',0,now()+interval '1 day'
from generate_series(1,24) n;
insert into public.project_budgets(project_id,category,amount) values ('ca300000-0000-4000-8000-000000000001','Prueba',100);
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method) values
 ('ca300000-0000-4000-8000-000000000001',current_date,'Prueba',101,'Transferencia');
insert into public.project_payments(project_id,payment_date,amount,payment_method) values
 ('ca300000-0000-4000-8000-000000000001',current_date,600,'Transferencia');
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$
declare p uuid := 'ca300000-0000-4000-8000-000000000001'; w public.project_withholdings; a jsonb; d jsonb;
begin
  perform pg_temp.check_true(exists(select 1 from public.project_active_alerts where project_id=p and kind='retraso'),'ayer retrasado');
  perform pg_temp.check_true((select count(*)=2 from public.project_active_alerts where project_id in ('ca300000-0000-4000-8000-000000000002','ca300000-0000-4000-8000-000000000003') and kind='finalizacion_proxima'),'hoy y 15 días incluidos');
  perform pg_temp.check_true(not exists(select 1 from public.project_active_alerts where project_id='ca300000-0000-4000-8000-000000000004' and kind='finalizacion_proxima'),'16 días excluidos');
  a := public.alerts_page_v2('ALERTA-TEST-1','cartera',1,100);
  perform pg_temp.check_true((a->'records'->0->>'balance')::numeric=400,'pago parcial');
  perform pg_temp.check_true((public.alerts_page_v2('Cliente alertas vigentes','cartera',99,20)->>'page')::int=2,'página efectiva fuera de rango');
  perform pg_temp.check_true((public.alerts_page_v2('Instalación verificable','cartera',1,20)->>'total')::int=24,'búsqueda por título');
  perform pg_temp.check_true((public.alerts_page_v2('Cliente alertas vigentes','cartera',1,20)->>'total')::int=24,'búsqueda por cliente');
  perform pg_temp.check_true((select count(*)=24 from public.alerts_page('Cliente alertas vigentes','cartera',0,100)),'compatibilidad anterior');
  w := public.register_project_withholding(jsonb_build_object('project_id',p,'request_id',gen_random_uuid(),'withholding_date',current_date,'kind','income','amount','400'));
  perform pg_temp.check_true(not exists(select 1 from public.project_active_alerts where project_id=p and kind='cartera'),'anticipos más retención cubren valor');
  perform public.void_project_withholding(w.id,'Verificar cartera restaurada');
  perform pg_temp.check_true((select balance::numeric=400 from public.project_active_alerts where project_id=p and kind='cartera'),'anulación restaura saldo');
  select value into a from jsonb_array_elements(public.dashboard_snapshot()->'priority_alerts') where value->>'project_id'=p::text and value->>'kind'='cartera';
  -- El panel solo expone tres prioritarias: comparar cada una con la vista y v2.
  for a in select value from jsonb_array_elements(public.dashboard_snapshot()->'priority_alerts') loop
    select to_jsonb(v) into d from public.project_active_alerts v where v.id=(a->>'id')::uuid;
    perform pg_temp.check_true(a=d,'panel y vista comparten cifras e identificación');
    perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(public.alerts_page_v2(a->>'quote_number',a->>'kind',1,100)->'records') x where x=a),'panel y listado idénticos');
  end loop;
  update public.projects set status='finished' where id=p;
  perform pg_temp.check_true((select array_agg(kind)=array['cartera'] from public.project_active_alerts where project_id=p),'finalizado solo cartera');
  update public.projects set status='cancelled' where id=p;
  perform pg_temp.check_true(not exists(select 1 from public.project_active_alerts where project_id=p),'cancelado sin alertas');
  update public.projects set status='cancelled' where client_id='ca200000-0000-4000-8000-000000000001' and id::text>'ca300000-0000-4000-8000-000000000020';
  perform pg_temp.check_true((public.alerts_page_v2('Cliente alertas vigentes','cartera',2,20)->>'page')::int=1,'última página desaparecida vuelve a primera');
  insert into public.project_payments(project_id,payment_date,amount,payment_method) values ('ca300000-0000-4000-8000-000000000002',current_date,1000,'Transferencia');
  perform pg_temp.check_true(not exists(select 1 from public.project_active_alerts where project_id='ca300000-0000-4000-8000-000000000002' and kind='cartera'),'pago completo saldo cero');
end $$;

reset role;
update public.profiles set is_active=false where id='ca100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.project_active_alerts),'RLS inactivo');
select pg_temp.check_true(public.alerts_page_v2()->'records'='[]'::jsonb,'v2 inactivo');
select pg_temp.check_true(not exists(select 1 from public.alerts_page()),'anterior inactivo');
select pg_temp.check_true(public.dashboard_snapshot()->'priority_alerts'='[]'::jsonb,'panel inactivo');
reset role;
select pg_temp.check_true(not has_table_privilege('anon','public.project_active_alerts','SELECT'),'anon sin vista');
select pg_temp.check_true(not has_function_privilege('anon','public.alerts_page_v2(text,text,integer,integer)','EXECUTE'),'anon sin v2');
select pg_temp.check_true(not has_function_privilege('anon','public.alerts_page(text,text,integer,integer)','EXECUTE'),'anon sin anterior');
select pg_temp.check_true(not has_function_privilege('anon','public.dashboard_snapshot()','EXECUTE'),'anon sin panel');
rollback;
