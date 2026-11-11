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
   update public.projects set project_value=9999999 where id=p.id;
   select * into strict r from public.project_reporting_details(array[p.id]);
   perform pg_temp.check_true(r.direct_cost::numeric=900000 and r.total_aiu::numeric=206100,'histórico tras editar valor');
  end loop;
 end loop;
end $$;
reset role;
insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date)
values ('e3000000-0000-4000-8000-000000000001','PRY-REPORT','e2000000-0000-4000-8000-000000000001','Manual',123456.78,'approved','Ana','Bogotá',current_date,current_date+30);
insert into public.project_files(id,project_id,kind,attachment_type_id,object_path,original_name,mime_type,size_bytes,status,created_by,updated_by,uploader_name,created_at)
select ('e4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'e3000000-0000-4000-8000-000000000001','attachment',t.id,
 'PRY-REPORT/archivos-adjuntos/'||n||'.pdf',n||'.pdf','application/pdf',10,
 case n when 3 then 'deleted' when 4 then 'pending' else 'ready' end,
 'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Ana',now()+n*interval '1 second'
from generate_series(1,4) n cross join public.project_attachment_types t where public.normalize_text(t.name)=public.normalize_text('FACTURA ELECTRONICA');
set local role authenticated;
select pg_temp.check_true((select direct_cost::numeric=123456.78 and total_aiu::numeric=0 and jsonb_array_length(invoices)=2 and invoices->0->>'original_name'='2.pdf' from public.project_reporting_details(array['e3000000-0000-4000-8000-000000000001'::uuid])),'manual, vigentes y orden');
reset role;
update public.profiles set role='administrator' where id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.project_reporting_details(array['e3000000-0000-4000-8000-000000000001'::uuid])),'administrador activo');
reset role;
update public.profiles set is_active=false where id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.project_reporting_details(array['e3000000-0000-4000-8000-000000000001'::uuid])),'inactivo sin acceso');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.project_reporting_details(uuid[])','EXECUTE'),'anon sin ejecución');
rollback;
