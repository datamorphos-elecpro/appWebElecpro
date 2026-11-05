-- Ejecutar en una base de pruebas migrada; las fixtures se revierten al terminar.
begin;
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.reject(query text, expected text) returns void language plpgsql as $$
begin
  begin execute query; exception when others then
    if sqlerrm not like '%'||expected||'%' then raise exception 'Unexpected failure: %',sqlerrm; end if; return;
  end;
  raise exception 'Operation was not rejected: %',query;
end $$;
insert into auth.users(id,email) values
 ('ab040000-0000-4000-8000-000000000001','reports-manager@test.invalid'),
 ('ab040000-0000-4000-8000-000000000002','reports-admin@test.invalid'),
 ('ab040000-0000-4000-8000-000000000003','reports-inactive@test.invalid');
update public.profiles set role='administrator' where id='ab040000-0000-4000-8000-000000000002';
update public.profiles set is_active=false where id='ab040000-0000-4000-8000-000000000003';
insert into public.clients(id,name) values
 ('ab040000-0000-4000-8000-000000000010','Cliente homónimo'),
 ('ab040000-0000-4000-8000-000000000020','Cliente homónimo');
insert into public.projects(id,client_id,quote_number,title,status,project_value,profit_mode,initial_profit,start_date,expected_end_date) values
 ('ab040000-0000-4000-8000-000000000011','ab040000-0000-4000-8000-000000000010','REPORT-A','Proyecto negativo','approved',1000,'value',0,current_date-20,(now() at time zone 'America/Bogota')::date-1),
 ('ab040000-0000-4000-8000-000000000012','ab040000-0000-4000-8000-000000000020','REPORT-B','Ganancia manual','in_progress',2000,'manual',100,current_date-20,(now() at time zone 'America/Bogota')::date),
 ('ab040000-0000-4000-8000-000000000013','ab040000-0000-4000-8000-000000000010','REPORT-C','Límite 15 días','paused',100,'value',0,current_date-20,(now() at time zone 'America/Bogota')::date+15),
 ('ab040000-0000-4000-8000-000000000014','ab040000-0000-4000-8000-000000000010','REPORT-D','Límite 16 días','approved',100,'value',0,current_date-20,(now() at time zone 'America/Bogota')::date+16),
 ('ab040000-0000-4000-8000-000000000015','ab040000-0000-4000-8000-000000000010','REPORT-E','Pendiente','pending_approval',99999,'value',0,current_date-20,current_date),
 ('ab040000-0000-4000-8000-000000000016','ab040000-0000-4000-8000-000000000010','REPORT-F','Finalizado','finished',100,'value',0,current_date-20,current_date-1);
insert into public.projects(client_id,quote_number,title,status,project_value,start_date,expected_end_date)
select 'ab040000-0000-4000-8000-000000000010','REPORT-PAGE-'||n,'Paginación '||n,'draft',1,current_date,current_date from generate_series(1,120) n;
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method) values
 ('ab040000-0000-4000-8000-000000000011',current_date,'Materiales',1250,'Transferencia'),
 ('ab040000-0000-4000-8000-000000000012',current_date,'Materiales',200,'Transferencia');
insert into public.project_budgets(project_id,category,amount) values
 ('ab040000-0000-4000-8000-000000000011','Materiales',1200),
 ('ab040000-0000-4000-8000-000000000012','Materiales',300);
insert into public.quotes(id,number,client_id,title,status,issued_on,valid_until,total_amount) values
 ('ab040000-0000-4000-8000-000000000031','REPORT-Q1','ab040000-0000-4000-8000-000000000010','Enviada antigua','sent',current_date-30,(now() at time zone 'America/Bogota')::date-1,10),
 ('ab040000-0000-4000-8000-000000000032','REPORT-Q2','ab040000-0000-4000-8000-000000000010','Enviada hoy','sent',current_date-30,(now() at time zone 'America/Bogota')::date,20.25),
 ('ab040000-0000-4000-8000-000000000033','REPORT-Q3','ab040000-0000-4000-8000-000000000020','Enviada futura','sent',current_date-30,(now() at time zone 'America/Bogota')::date+1,30.75),
 ('ab040000-0000-4000-8000-000000000034','REPORT-Q4','ab040000-0000-4000-8000-000000000010','Borrador antiguo','draft',current_date-30,current_date-1,0),
 ('ab040000-0000-4000-8000-000000000035','REPORT-Q5','ab040000-0000-4000-8000-000000000010','Aprobada','approved',current_date-30,current_date-1,100);
create temp table reports_state(key text primary key,value jsonb);
grant all on reports_state to authenticated;
select set_config('request.jwt.claim.sub','ab040000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into reports_state values ('filters','{"management_client":["ab040000-0000-4000-8000-000000000010","ab040000-0000-4000-8000-000000000020"],"management_month":"1900-01"}');
insert into reports_state select m,public.analytics_management_report(m,(select value from reports_state where key='filters'))
from unnest(array['management.projectValue','management.balance','management.expenses','management.profit','management.projectedProfit']) m;
select pg_temp.check_true((value->>'total')::integer=jsonb_array_length(value->'records'),'informe completo') from reports_state where key like 'management.%';
select pg_temp.check_true((value->>'value')::numeric=(select coalesce(sum((r->>'amount')::numeric),0) from jsonb_array_elements(value->'records') r),'total consistente') from reports_state where key like 'management.%';
select pg_temp.check_true((value->>'value')=public.analytics_metric_detail(key,(select value from reports_state where key='filters'))->>'value','modal e informe coinciden') from reports_state where key like 'management.%';
select pg_temp.check_true((value->>'total')::integer=125,'más de 100 registros, excluye pendiente') from reports_state where key='management.projectValue';
select pg_temp.check_true(jsonb_array_length(public.analytics_metric_detail('management.projectValue',(select value from reports_state where key='filters'),2,100)->'records')=25,'segunda página');
select pg_temp.check_true((select count(distinct r->>'client_id')=2 from reports_state,jsonb_array_elements(value->'records') r where key='management.projectValue'),'homónimos separados');
select pg_temp.check_true((select count(*)=2 from reports_state,jsonb_array_elements(value->'records') r where key='management.profit' and (r->>'amount')::numeric<0),'dos modelos con pérdida');
select pg_temp.check_true((public.analytics_management_report('management.balance','{"management_status":["pending_approval"]}')->>'total')::integer=0,'informe vacío');
select pg_temp.reject($q$select public.analytics_management_report('commercial.approval')$q$,'Métrica');

insert into reports_state values ('operation',public.analytics_operation_snapshot_v2(p_clients=>array['ab040000-0000-4000-8000-000000000010','ab040000-0000-4000-8000-000000000020']::uuid[]));
select pg_temp.check_true(value#>>'{byStatus,0,key}'='draft','orden descendente') from reports_state where key='operation';
select pg_temp.check_true(value#>>'{bySchedule,0,value}'='1' and value#>>'{bySchedule,1,value}'='2' and value#>>'{bySchedule,2,value}'='1','límites del cronograma') from reports_state where key='operation';
select pg_temp.check_true((public.analytics_operation_snapshot_v2(p_clients=>array['ab040000-0000-4000-8000-000000000010']::uuid[],p_schedule=>'upcoming')->>'total')::integer=1,'filtros combinados');
select pg_temp.check_true((select count(*)=1 from public.analytics_operation_page_v2(p_clients=>array['ab040000-0000-4000-8000-000000000010']::uuid[],p_schedule=>'overdue')),'tabla y cronograma');

insert into reports_state values ('commercial',public.analytics_commercial_snapshot_multi(p_clients=>array['ab040000-0000-4000-8000-000000000010','ab040000-0000-4000-8000-000000000020']::uuid[]));
select pg_temp.check_true((value#>>'{metrics,pendingValue}')::numeric=51 and value#>>'{metrics,validSent}'='2' and value#>>'{metrics,expired}'='0','pendientes vigentes y sin cambio automático') from reports_state where key='commercial';
select pg_temp.check_true(jsonb_array_length(value->'byClient')=2,'clientes homónimos comerciales') from reports_state where key='commercial';
select pg_temp.check_true((select (c->>'value')::numeric=(select sum((s->>'value')::numeric) from jsonb_array_elements(c->'segments') s) and (c->>'count')::integer=(select sum((s->>'count')::integer) from jsonb_array_elements(c->'segments') s) from reports_state,jsonb_array_elements(value->'byClient') c where key='commercial' order by c->>'key' limit 1),'segmentos monetarios y conteos');
select pg_temp.check_true((public.analytics_metric_detail('commercial.pendingValue','{"commercial_client":["ab040000-0000-4000-8000-000000000010","ab040000-0000-4000-8000-000000000020"]}')->>'value')::numeric=51,'detalle de pendiente');
select pg_temp.check_true((select visible_status='sent' from public.quotes_page(p_q=>'REPORT-Q1')),'listado conserva enviada');
select pg_temp.check_true((select count(*)=2 from public.quotes_page(p_q=>'REPORT-Q',p_segment=>'valid')),'segmento vigente conserva regla');
select pg_temp.check_true((select count(*)=3 from public.analytics_commercial_page_multi(p_clients=>array['ab040000-0000-4000-8000-000000000010','ab040000-0000-4000-8000-000000000020']::uuid[],p_statuses=>array['sent'])),'filtro enviado conserva antiguas');

select set_config('request.jwt.claim.sub','ab040000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((public.analytics_management_report('management.expenses',(select value from reports_state where key='filters'))->>'value')::numeric=1450,'administrador');
select set_config('request.jwt.claim.sub','ab040000-0000-4000-8000-000000000003',true);
select pg_temp.reject($q$select public.analytics_management_report('management.balance')$q$,'No autorizado');
select pg_temp.reject($q$select public.analytics_operation_snapshot_v2()$q$,'No autorizado');
set local role anon;
select pg_temp.reject($q$select public.analytics_management_report('management.balance')$q$,'permission denied');
select pg_temp.reject($q$select public.analytics_operation_page_v2()$q$,'permission denied');
reset role;
select pg_temp.check_true(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prosrc like '%then ''expired''%'),'ninguna consulta pública deriva vencida');
rollback;
