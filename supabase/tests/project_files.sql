-- Run after 20261029100000_project_files.sql in an isolated, migrated database.
-- Storage objects here represent API metadata, not physical uploads. All fixtures roll back.
begin;
create function pg_temp.check_true(ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed'; end if; end $$;
create function pg_temp.reject(query text, expected text) returns void language plpgsql as $$begin
 begin execute query; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'Unexpected failure: %',sqlerrm; end if; return; end;
 raise exception 'Operation was not rejected: %',query;
end $$;
insert into auth.users(id,email) values ('fa000000-0000-4000-8000-000000000001','files-management@test.invalid'),('fa000000-0000-4000-8000-000000000002','files-admin@test.invalid');
update public.profiles set full_name='Ana' where id='fa000000-0000-4000-8000-000000000001';
update public.profiles set role='administrator',full_name='Admin' where id='fa000000-0000-4000-8000-000000000002';
insert into public.clients(id,name) values ('fa000000-0000-4000-8000-000000000003','Cliente archivos');
insert into public.projects(id,quote_number,client_id,title,project_value,start_date,expected_end_date,responsible,location) values
 ('fa000000-0000-4000-8000-000000000004','PRY-FILES-TEST','fa000000-0000-4000-8000-000000000003','Archivos',10000,current_date,current_date,'Ana','Bogotá'),
 ('fa000000-0000-4000-8000-000000000005','PRY-FILES-OTHER','fa000000-0000-4000-8000-000000000003','Otro',10000,current_date,current_date,'Ana','Bogotá'),
 ('fa000000-0000-4000-8000-000000000006','CODIGO/INVALIDO','fa000000-0000-4000-8000-000000000003','Código inválido',10000,current_date,current_date,'Ana','Bogotá'),
 ('fa000000-0000-4000-8000-000000000007','CODIGO-DUPLICADO','fa000000-0000-4000-8000-000000000003','Duplicado uno',10000,current_date,current_date,'Ana','Bogotá'),
 ('fa000000-0000-4000-8000-000000000008','CODIGO-DUPLICADO','fa000000-0000-4000-8000-000000000003','Duplicado dos',10000,current_date,current_date,'Ana','Bogotá');
select pg_temp.check_true((select not public and file_size_limit=52428800 from storage.buckets where id='project-files'));
select pg_temp.check_true((select count(*)=14 from public.project_attachment_types));
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000006','receipt','pago.pdf','application/pdf',100)$q$,'código');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000007','receipt','pago.pdf','application/pdf',100)$q$,'código');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','receipt','pago.png','image/png',100)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','receipt','pago.pdf','application/pdf',10485761)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','attachment','pago.pdf','application/pdf',52428801)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','attachment','pago.pdf','application/pdf',0)$q$,'Formato');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','attachment','../pago.pdf','application/pdf',100)$q$,'Formato');
select pg_temp.reject($q$insert into public.project_attachment_types(name) values('No autorizado')$q$,'permission denied');

select public.prepare_project_file('fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000004','receipt','pago.pdf','application/pdf',100);
select pg_temp.check_true((select object_path='PRY-FILES-TEST/soportes-de-pago/fa000000-0000-4000-8000-000000000011-pago.pdf' from public.project_files where id='fa000000-0000-4000-8000-000000000011'));
select pg_temp.reject($q$select public.save_project_payment_with_file('{"project_id":"fa000000-0000-4000-8000-000000000004","request_id":"fa000000-0000-4000-8000-000000000021","payment_date":"2026-10-29","amount":"1000","payment_method":"Transferencia"}','fa000000-0000-4000-8000-000000000011')$q$,'terminó');
select pg_temp.check_true((select count(*)=0 from public.project_payments where project_id='fa000000-0000-4000-8000-000000000004'));
select pg_temp.reject($q$insert into storage.objects(bucket_id,name,metadata) values('project-files','PRY-FILES-OTHER/soportes-de-pago/no.pdf','{}')$q$,'row-level security');
insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{"size":100,"mimetype":"application/pdf"}'::jsonb from public.project_files where id='fa000000-0000-4000-8000-000000000011';
select public.save_project_payment_with_file('{"project_id":"fa000000-0000-4000-8000-000000000004","request_id":"fa000000-0000-4000-8000-000000000021","payment_date":"2026-10-29","amount":"1000","payment_method":"Transferencia"}','fa000000-0000-4000-8000-000000000011');
select public.save_project_payment_with_file('{"project_id":"fa000000-0000-4000-8000-000000000004","request_id":"fa000000-0000-4000-8000-000000000021","payment_date":"2026-10-29","amount":"1000","payment_method":"Transferencia"}','fa000000-0000-4000-8000-000000000011');
select pg_temp.check_true((select count(*)=1 and sum(amount)=1000 from public.project_payments where project_id='fa000000-0000-4000-8000-000000000004'));
select public.save_project_payment_with_file('{"project_id":"fa000000-0000-4000-8000-000000000005","request_id":"fa000000-0000-4000-8000-000000000022","payment_date":"2026-10-29","amount":"500","payment_method":"Efectivo"}');
select pg_temp.check_true((select count(*)=1 and sum(amount)=500 from public.project_payments where project_id='fa000000-0000-4000-8000-000000000005'));
select pg_temp.check_true((select paid=1000 and balance=9000 from public.project_financial_summary where id='fa000000-0000-4000-8000-000000000004'));
select pg_temp.reject($q$update public.projects set quote_number='OTRO' where id='fa000000-0000-4000-8000-000000000004'$q$,'código');
select pg_temp.reject($q$select public.prepare_project_file('fa000000-0000-4000-8000-000000000012','fa000000-0000-4000-8000-000000000005','receipt','pago.pdf','application/pdf',100,(select payment_id from public.project_files where id='fa000000-0000-4000-8000-000000000011'))$q$,'Anticipo');

-- Replacing the receipt leaves the original ready until finalization succeeds.
select public.prepare_project_file('fa000000-0000-4000-8000-000000000012','fa000000-0000-4000-8000-000000000004','receipt','pago.pdf','application/pdf',100,payment_id,id,updated_at) from public.project_files where id='fa000000-0000-4000-8000-000000000011';
select pg_temp.reject($q$select public.finish_project_file('fa000000-0000-4000-8000-000000000012')$q$,'terminó');
select pg_temp.check_true((select status='ready' from public.project_files where id='fa000000-0000-4000-8000-000000000011'));
insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{"size":100,"mimetype":"application/pdf"}'::jsonb from public.project_files where id='fa000000-0000-4000-8000-000000000012';
select public.finish_project_file('fa000000-0000-4000-8000-000000000012');
select public.finish_project_file('fa000000-0000-4000-8000-000000000012');
select pg_temp.check_true((select count(*)=1 from public.project_files where project_id='fa000000-0000-4000-8000-000000000004' and status='ready' and kind='receipt'));

-- Global type creation, normalization and document-only folder.
select public.prepare_project_file('fa000000-0000-4000-8000-000000000013','fa000000-0000-4000-8000-000000000004','attachment','plano.dwg','application/acad',100);
insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{"size":100,"mimetype":"application/acad"}'::jsonb from public.project_files where id='fa000000-0000-4000-8000-000000000013';
select public.finish_project_file('fa000000-0000-4000-8000-000000000013','  Certificación   técnica  ');
select pg_temp.check_true((select object_path like 'PRY-FILES-TEST/archivos-adjuntos/%' from public.project_files where id='fa000000-0000-4000-8000-000000000013'));
select public.change_project_file(id,updated_at,false,'CERTIFICACION TECNICA') from public.project_files where id='fa000000-0000-4000-8000-000000000013';
select pg_temp.check_true((select count(*)=1 from public.project_attachment_types where public.normalize_text(name)='certificacion tecnica'));
select pg_temp.reject($q$select public.change_project_file('fa000000-0000-4000-8000-000000000013','2020-01-01Z',true)$q$,'cambió');
select public.change_project_file(id,updated_at,true) from public.project_files where id='fa000000-0000-4000-8000-000000000013';
select pg_temp.check_true((select paid=1000 and balance=9000 from public.project_financial_summary where id='fa000000-0000-4000-8000-000000000004'));
select public.project_file_cleanup('fa000000-0000-4000-8000-000000000004',array['fa000000-0000-4000-8000-000000000013'::uuid]);
select pg_temp.check_true((select not cleanup_complete from public.project_files where id='fa000000-0000-4000-8000-000000000013'));
select pg_temp.check_true((select count(*)=0 from storage.objects where bucket_id='project-files' and name in (select object_path from public.project_files where status='deleted')));
-- Storage API sets this operation before its delete query; the local schema stub mimics it.
select set_config('storage.operation','storage.object.delete_many',true);
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='project-files' and name in (select object_path from public.project_files where status='deleted' and project_id='fa000000-0000-4000-8000-000000000004');
select set_config('storage.operation','',true);
select public.project_file_cleanup('fa000000-0000-4000-8000-000000000004',array['fa000000-0000-4000-8000-000000000011'::uuid,'fa000000-0000-4000-8000-000000000013'::uuid]);
select pg_temp.check_true((select cleanup_complete from public.project_files where id='fa000000-0000-4000-8000-000000000013'));

-- Wrong Storage metadata cannot be activated; pending uploads remain private.
select public.prepare_project_file('fa000000-0000-4000-8000-000000000014','fa000000-0000-4000-8000-000000000004','attachment','pendiente.pdf','application/pdf',100);
insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{"size":99,"mimetype":"application/pdf"}'::jsonb from public.project_files where id='fa000000-0000-4000-8000-000000000014';
select pg_temp.reject($q$select public.finish_project_file('fa000000-0000-4000-8000-000000000014','Informe')$q$,'coinciden');

-- Same business privileges for administrators; pending uploads are private to their creator.
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.project_files where status='ready' and project_id='fa000000-0000-4000-8000-000000000004'));
select pg_temp.check_true((select count(*)=0 from public.project_files where id='fa000000-0000-4000-8000-000000000014'));
select pg_temp.reject($q$select public.finish_project_file('fa000000-0000-4000-8000-000000000014','Informe')$q$,'Carga no disponible');
select public.change_project_file(id,updated_at,true) from public.project_files where id='fa000000-0000-4000-8000-000000000012';
reset role;
update public.profiles set is_active=false where id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.project_files));
select pg_temp.check_true((select count(*)=0 from public.project_attachment_types));
select pg_temp.check_true((select count(*)=0 from storage.objects where bucket_id='project-files'));
select pg_temp.reject($q$select public.project_file_cleanup('fa000000-0000-4000-8000-000000000004')$q$,'No autorizado');
reset role;
set local role anon;
select pg_temp.reject('select * from public.project_files','permission denied');
select pg_temp.reject('select * from public.project_attachment_types','permission denied');
select pg_temp.reject($q$select public.project_file_cleanup('fa000000-0000-4000-8000-000000000004')$q$,'permission denied');
reset role;
select pg_temp.check_true((select count(*)>0 from public.audit_log where entity_type='project_files'));
rollback;
