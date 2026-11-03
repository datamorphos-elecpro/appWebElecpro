-- Run after both 20261103 migrations in an isolated database. Everything rolls back.
begin;
create function pg_temp.check_true(ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed'; end if; end $$;
create function pg_temp.reject(query text, expected text) returns void language plpgsql as $$begin
  begin execute query; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'Unexpected failure: %',sqlerrm; end if; return; end;
  raise exception 'Operation was not rejected: %',query;
end $$;
create temp table finance_test_state(key text primary key, value jsonb);
grant select,insert,update on finance_test_state to authenticated;
insert into finance_test_state values ('baseline',(select to_jsonb(p) from public.portfolio_financial_summary p));
insert into auth.users(id,email) values
 ('ca000000-0000-4000-8000-000000000001','payment-management@test.invalid'),
 ('ca000000-0000-4000-8000-000000000002','payment-admin@test.invalid'),
 ('ca000000-0000-4000-8000-000000000003','payment-inactive@test.invalid');
update public.profiles set role='administrator' where id='ca000000-0000-4000-8000-000000000002';
update public.profiles set is_active=false where id='ca000000-0000-4000-8000-000000000003';
insert into public.clients(id,name) values ('ca000000-0000-4000-8000-000000000010','Cliente aprobación');
insert into public.projects(id,client_id,quote_number,title,status,project_value,start_date,expected_end_date) values
 ('ca000000-0000-4000-8000-000000000011','ca000000-0000-4000-8000-000000000010','PRY-MANAGE-1','Aprobado','approved',10000,current_date-20,current_date-1),
 ('ca000000-0000-4000-8000-000000000012','ca000000-0000-4000-8000-000000000010','PRY-MANAGE-2','Pendiente','pending_approval',20000,current_date-20,current_date-1);
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method) values
 ('ca000000-0000-4000-8000-000000000011',current_date,'Materiales',400,'Transferencia'),
 ('ca000000-0000-4000-8000-000000000012',current_date,'Materiales',300,'Transferencia');
insert into public.project_budgets(project_id,category,amount) values
 ('ca000000-0000-4000-8000-000000000011','Materiales',100),('ca000000-0000-4000-8000-000000000012','Materiales',100);
insert into public.project_shares(id,project_id,participant,mode,value,basis,execution_date) values
 ('ca000000-0000-4000-8000-000000000051','ca000000-0000-4000-8000-000000000011','Ana','fixed',100,'real_profit',current_date);
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.settle_project_shares('ca000000-0000-4000-8000-000000000011',array['ca000000-0000-4000-8000-000000000051']::uuid[],current_date,false);

-- Format validation and real image metadata through the existing transactional API.
select pg_temp.reject($q$select public.prepare_project_file('ca000000-0000-4000-8000-000000000021','ca000000-0000-4000-8000-000000000011','receipt','pago.webp','image/webp',100)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('ca000000-0000-4000-8000-000000000021','ca000000-0000-4000-8000-000000000011','receipt','pago.png','image/png',10485761)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('ca000000-0000-4000-8000-000000000021','ca000000-0000-4000-8000-000000000011','receipt','pago.png','image/png',0)$q$,'Formato');
select public.prepare_project_file('ca000000-0000-4000-8000-000000000021','ca000000-0000-4000-8000-000000000011','receipt','pago.PNG','image/png',100);
insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{"size":100,"mimetype":"image/png"}'::jsonb from public.project_files where id='ca000000-0000-4000-8000-000000000021';
select public.save_project_payment_with_file('{"project_id":"ca000000-0000-4000-8000-000000000011","request_id":"ca000000-0000-4000-8000-000000000031","payment_date":"2026-10-01","amount":"1000","payment_method":"Transferencia"}','ca000000-0000-4000-8000-000000000021');
select public.save_project_payment_with_file('{"project_id":"ca000000-0000-4000-8000-000000000012","request_id":"ca000000-0000-4000-8000-000000000032","payment_date":"2026-10-01","amount":"2000","payment_method":"Transferencia"}');

select pg_temp.check_true((select paid=2000 and balance=18000 and real_profit=19700 from public.project_financial_summary where id='ca000000-0000-4000-8000-000000000012'));
select pg_temp.check_true(not exists(select 1 from public.project_active_alerts where project_id='ca000000-0000-4000-8000-000000000012'));
insert into finance_test_state values ('snapshot',public.analytics_management_snapshot_multi(array['ca000000-0000-4000-8000-000000000010']::uuid[]));
select pg_temp.check_true((select (value#>>'{metrics,projectValue}')::numeric=10000 and (value#>>'{metrics,profit}')::numeric=9500 and (value#>>'{metrics,balance}')::numeric=9000 and (value#>>'{period,paid}')::numeric=1000 from finance_test_state where key='snapshot'));
select pg_temp.check_true((select contracted=(b.value->>'contracted')::numeric+10000 and real_profit=(b.value->>'real_profit')::numeric+9500 from public.portfolio_financial_summary cross join finance_test_state b where b.key='baseline'));
select pg_temp.check_true((select count(*)=1 from public.analytics_management_financial_page(array['ca000000-0000-4000-8000-000000000010']::uuid[])));
select pg_temp.check_true((public.analytics_metric_detail('management.balance','{"management_client":["ca000000-0000-4000-8000-000000000010"]}') ->> 'value')::numeric=9000);
select pg_temp.check_true((public.projects_list_page(p_status=>'pending_approval')->>'total')::integer>=1);
select pg_temp.check_true((public.projects_list_page(p_status=>'pending_approval',p_segment=>'receivable')->>'total')::integer=0);
select pg_temp.check_true((public.analytics_operation_snapshot_multi(p_clients=>array['ca000000-0000-4000-8000-000000000010']::uuid[])->>'total')::integer=2);

-- Both directions of status change preserve original dates and movements.
update public.projects set status='approved' where id='ca000000-0000-4000-8000-000000000012';
select pg_temp.check_true((public.analytics_management_snapshot_multi(array['ca000000-0000-4000-8000-000000000010']::uuid[])#>>'{period,paid}')::numeric=3000);
update public.projects set status='pending_approval' where id='ca000000-0000-4000-8000-000000000012';

-- Optimistic edit, immediate replay and stale revision rejection.
insert into finance_test_state select 'edit',jsonb_build_object('id',id,'project_id',project_id,'expected_updated_at',updated_at,'request_id','ca000000-0000-4000-8000-000000000041','payment_date','2026-10-02','amount','2500','payment_method','Efectivo','note','Corregido') from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031';
select public.edit_project_payment(value) from finance_test_state where key='edit';
insert into finance_test_state select 'revision',to_jsonb(updated_at) from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031';
select public.edit_project_payment(value) from finance_test_state where key='edit';
select pg_temp.check_true((select to_jsonb(updated_at)=(select value from finance_test_state where key='revision') from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031'));
select pg_temp.reject(format('select public.edit_project_payment(%L::jsonb)',value||'{"request_id":"ca000000-0000-4000-8000-000000000042"}'),'cambió') from finance_test_state where key='edit';
select pg_temp.check_true((select paid=2500 and balance=7500 and expenses=400 and real_profit=9500 from public.project_financial_summary where id='ca000000-0000-4000-8000-000000000011'));

-- Prepare a replacement before deleting, then attempt to finish it after deletion.
select public.prepare_project_file('ca000000-0000-4000-8000-000000000022',project_id,'receipt','nuevo.jpg','image/jpeg',100,payment_id,id,updated_at) from public.project_files where id='ca000000-0000-4000-8000-000000000021';
insert into finance_test_state select 'delete',jsonb_build_object('id',id,'project_id',project_id,'expected_updated_at',updated_at,'request_id','ca000000-0000-4000-8000-000000000043','reason','Registro duplicado') from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031';
select pg_temp.reject(format('select public.delete_project_payment(%L::jsonb)',value||'{"reason":""}'),'motivo') from finance_test_state where key='delete';
select public.delete_project_payment(value) from finance_test_state where key='delete';
select public.delete_project_payment(value) from finance_test_state where key='delete';
select pg_temp.check_true(not exists(select 1 from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031'));
select pg_temp.check_true(not exists(select 1 from public.project_files where id='ca000000-0000-4000-8000-000000000021'));
select pg_temp.check_true(not exists(select 1 from storage.objects where name like 'PRY-MANAGE-1/%'));
select pg_temp.reject($q$select public.finish_project_file('ca000000-0000-4000-8000-000000000022')$q$,'Anticipo');
select pg_temp.reject($q$select public.finish_project_file('ca000000-0000-4000-8000-000000000021')$q$,'Anticipo');
select pg_temp.reject($q$select public.change_project_file('ca000000-0000-4000-8000-000000000021',now(),true)$q$,'Anticipo');
select pg_temp.reject(format('select public.edit_project_payment(%L::jsonb)',value),'Anticipo') from finance_test_state where key='edit';
select pg_temp.check_true((select paid=0 and balance=10000 and expenses=400 and real_profit=9500 from public.project_financial_summary where id='ca000000-0000-4000-8000-000000000011'));
select pg_temp.check_true((public.analytics_management_snapshot_multi(array['ca000000-0000-4000-8000-000000000010']::uuid[])#>>'{period,paid}')::numeric=0);
select pg_temp.check_true(not exists(select 1 from public.project_file_cleanup('ca000000-0000-4000-8000-000000000011') where id='ca000000-0000-4000-8000-000000000021'));
select pg_temp.reject($q$update public.project_payments set amount=1$q$,'permission denied');
select pg_temp.reject($q$delete from public.project_payments$q$,'permission denied');

-- The balance is the complete filtered aggregate, independent of page and cash period.
insert into public.projects(client_id,quote_number,title,status,project_value,start_date,expected_end_date)
select 'ca000000-0000-4000-8000-000000000010','PRY-MANAGE-PAGE-'||n,'Paginación '||n,'approved',1,current_date,current_date from generate_series(1,25) n;
select pg_temp.check_true((select count(*)=20 and min(total_count)=26 from public.analytics_management_financial_page(array['ca000000-0000-4000-8000-000000000010']::uuid[],null,null,0,20)));
select pg_temp.check_true((select count(*)=6 and min(total_count)=26 from public.analytics_management_financial_page(array['ca000000-0000-4000-8000-000000000010']::uuid[],null,null,20,20)));
select pg_temp.check_true((public.analytics_management_snapshot_multi(array['ca000000-0000-4000-8000-000000000010']::uuid[],null,null,'1900-01')#>>'{metrics,balance}')::numeric=10025);
select pg_temp.check_true((public.analytics_management_snapshot_multi(array['ca000000-0000-4000-8000-000000000010']::uuid[],null,array['pending_approval'])#>>'{metrics,balance}')::numeric=0);
update public.projects set profit_mode='manual',initial_profit=500 where id='ca000000-0000-4000-8000-000000000011';
select pg_temp.check_true((select real_profit=0 and real_profit-balance=-10000 from public.project_financial_summary where id='ca000000-0000-4000-8000-000000000011'));
update public.projects set initial_profit=200 where id='ca000000-0000-4000-8000-000000000011';
select pg_temp.check_true((select real_profit=-300 from public.project_financial_summary where id='ca000000-0000-4000-8000-000000000011'));

-- Administrator has the same business permissions; inactive and anonymous cannot mutate.
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000002',true);
select public.edit_project_payment(jsonb_build_object('id',id,'project_id',project_id,'expected_updated_at',updated_at,'request_id','ca000000-0000-4000-8000-000000000044','payment_date','2026-10-01','amount','2100','payment_method','Efectivo')) from public.project_payments where request_id='ca000000-0000-4000-8000-000000000032';
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(not exists(select 1 from public.project_payments));
select pg_temp.reject($q$select public.edit_project_payment('{}')$q$,'No autorizado');
select pg_temp.reject($q$select public.delete_project_payment('{}')$q$,'No autorizado');
set local role anon;
select pg_temp.reject($q$select * from public.active_project_payments$q$,'permission denied');
select pg_temp.reject($q$select public.delete_project_payment('{}')$q$,'permission denied');
reset role;
select pg_temp.check_true((select deleted_by='ca000000-0000-4000-8000-000000000001' and delete_reason='Registro duplicado' and deleted_at is not null from public.project_payments where request_id='ca000000-0000-4000-8000-000000000031'));
select pg_temp.check_true((select status='ready' and not cleanup_complete from public.project_files where id='ca000000-0000-4000-8000-000000000021'));
select pg_temp.check_true(exists(select 1 from storage.objects where name like 'PRY-MANAGE-1/%'));
select pg_temp.check_true(exists(select 1 from public.audit_log where entity_type='project_payments' and after_data->>'delete_reason'='Registro duplicado'));
rollback;
