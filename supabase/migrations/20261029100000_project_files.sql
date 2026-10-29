-- Apply after 20261023100000_current_alerts.sql. Storage must be installed.
begin;

do $$ begin
 if to_regprocedure('storage.allow_any_operation(text[])') is null then
  raise exception 'Actualice Supabase Storage: se requiere storage.allow_any_operation(text[]) para retirar archivos sin habilitar su descarga';
 end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-files','project-files',false,52428800,array[
 'application/pdf','image/jpeg','image/png','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/acad','application/dxf','application/zip']);

create table public.project_attachment_types (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100 and name=btrim(regexp_replace(name,'\s+',' ','g'))),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
create unique index project_attachment_types_name_key on public.project_attachment_types(public.normalize_text(name));
insert into public.project_attachment_types(name) values
 ('Factura Electrónica'),('Planos'),('Informe'),('Contrato'),('Orden de compra'),('Acta de inicio'),
 ('Acta de avance'),('Acta de entrega'),('Acta de recibo a satisfacción'),('Certificado'),
 ('Memoria de cálculo'),('Registro fotográfico'),('Póliza'),('Garantía');

alter table public.project_payments add column request_id uuid unique;
alter table public.project_payments add constraint project_payments_id_project_key unique(id,project_id);
create table public.project_files (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete restrict,
 kind text not null check(kind in ('receipt','attachment')),
 payment_id uuid, attachment_type_id uuid references public.project_attachment_types(id),
 object_path text not null unique, original_name text not null check(length(original_name) between 1 and 240),
 mime_type text not null, size_bytes bigint not null check(size_bytes>0 and size_bytes<=52428800),
 status text not null default 'pending' check(status in ('pending','ready','deleted')),
 replaces_id uuid references public.project_files(id), expected_updated_at timestamptz,
 cleanup_complete boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 uploader_name text not null,
 foreign key(payment_id,project_id) references public.project_payments(id,project_id) on delete restrict,
 check(kind<>'receipt' or (mime_type='application/pdf' and size_bytes<=10485760 and attachment_type_id is null)),
 check(kind<>'attachment' or payment_id is null),
 check(status<>'ready' or (kind='receipt' and payment_id is not null) or (kind='attachment' and attachment_type_id is not null))
);
create index project_files_project_status_created_idx on public.project_files(project_id,status,created_at desc,id);
create index project_files_payment_idx on public.project_files(payment_id);
create index project_files_type_idx on public.project_files(attachment_type_id);
create unique index project_files_one_receipt_key on public.project_files(payment_id) where kind='receipt' and status='ready';

alter table public.project_attachment_types enable row level security;
alter table public.project_files enable row level security;
revoke all on public.project_attachment_types,public.project_files from anon,authenticated;
grant select on public.project_attachment_types,public.project_files to authenticated;
create policy attachment_types_read on public.project_attachment_types for select to authenticated using((select private.is_active_member()));
create policy project_files_read on public.project_files for select to authenticated using((select private.is_active_member()) and (status='ready' or created_by=(select auth.uid()) or status='deleted'));
create trigger project_attachment_types_audit after insert or update on public.project_attachment_types for each row execute function public.audit_row();
create trigger project_files_audit after insert or update on public.project_files for each row execute function public.audit_row();

create function private.protect_project_file_code() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.quote_number is distinct from old.quote_number and exists(select 1 from public.project_files where project_id=old.id) then
  raise exception 'No puede cambiar el código de un proyecto con archivos asociados';
 end if;
 if exists(select 1 from public.projects p join public.project_files f on f.project_id=p.id where p.quote_number=new.quote_number and p.id<>new.id) then
  raise exception 'El código ya corresponde a un proyecto con archivos asociados';
 end if;
 return new;
end $$;
create trigger projects_protect_file_code before insert or update of quote_number on public.projects for each row execute function private.protect_project_file_code();
revoke all on function private.protect_project_file_code() from public,anon,authenticated;

create function public.prepare_project_file(p_id uuid,p_project_id uuid,p_kind text,p_name text,p_mime text,p_size bigint,p_payment_id uuid default null,p_replaces_id uuid default null,p_expected_updated_at timestamptz default null)
returns public.project_files language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; f public.project_files%rowtype; old_file public.project_files%rowtype; expected_mime text; extension text; safe_name text;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Proyecto no encontrado'; end if;
 if p.quote_number is null or p.quote_number !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' or exists(select 1 from public.projects where quote_number=p.quote_number and id<>p.id) then
  raise exception 'El código del proyecto está vacío, duplicado o no es válido para una carpeta. Corríjalo antes de cargar archivos';
 end if;
 extension:=lower(substring(p_name from '\.([^.]+)$'));
 expected_mime:=case extension when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'doc' then 'application/msword' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' when 'xls' then 'application/vnd.ms-excel' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' when 'dwg' then 'application/acad' when 'dxf' then 'application/dxf' when 'zip' then 'application/zip' end;
 if p_id is null or p_kind not in ('receipt','attachment') or p_kind is null or p_name is null or length(p_name) not between 1 and 240 or p_name ~ '[/\\[:cntrl:]]' or expected_mime is null or p_mime is distinct from expected_mime or p_size is null or p_size<=0 or p_size>52428800 or (p_kind='receipt' and (extension<>'pdf' or p_size>10485760)) then raise exception 'Formato, nombre o tamaño de archivo no permitido'; end if;
 if p_kind='attachment' and p_payment_id is not null then raise exception 'Un documento general no se asocia a un anticipo'; end if;
 if p_payment_id is not null and not exists(select 1 from public.project_payments where id=p_payment_id and project_id=p.id) then raise exception 'Anticipo no encontrado en este proyecto'; end if;
 if p_replaces_id is not null then
  select * into old_file from public.project_files where id=p_replaces_id;
  if not found or old_file.project_id<>p.id or old_file.kind<>p_kind or old_file.status<>'ready' or old_file.updated_at is distinct from p_expected_updated_at or old_file.payment_id is distinct from p_payment_id then raise exception 'El archivo cambió. Actualice el proyecto'; end if;
 end if;
 select * into f from public.project_files where id=p_id;
 if found then
  if f.created_by<>auth.uid() or f.status<>'pending' or f.project_id<>p.id or f.kind<>p_kind or f.original_name<>p_name or f.mime_type<>p_mime or f.size_bytes<>p_size or f.payment_id is distinct from p_payment_id or f.replaces_id is distinct from p_replaces_id then raise exception 'Solicitud de carga incompatible'; end if;
  return f;
 end if;
 safe_name:=regexp_replace(public.normalize_text(p_name),'[^a-zA-Z0-9._-]+','-','g');
 insert into public.project_files(id,project_id,kind,payment_id,object_path,original_name,mime_type,size_bytes,replaces_id,expected_updated_at,created_by,updated_by,uploader_name)
 values(p_id,p.id,p_kind,p_payment_id,p.quote_number||'/'||case p_kind when 'receipt' then 'soportes-de-pago' else 'archivos-adjuntos' end||'/'||p_id::text||'-'||safe_name,p_name,p_mime,p_size,p_replaces_id,p_expected_updated_at,auth.uid(),auth.uid(),(select full_name from public.profiles where id=auth.uid())) returning * into f;
 return f;
end $$;

-- Invoked only inside business RPCs; Storage metadata is read, never modified with SQL.
create function private.checked_project_file(p_id uuid) returns public.project_files language plpgsql security definer set search_path='' as $$
declare f public.project_files%rowtype; m jsonb;
begin
 select * into f from public.project_files where id=p_id for update;
 if not found or f.status<>'pending' or f.created_by<>auth.uid() then raise exception 'Carga no disponible'; end if;
 select metadata into m from storage.objects where bucket_id='project-files' and name=f.object_path;
 if m is null or (m->>'size')::bigint is distinct from f.size_bytes or m->>'mimetype' is distinct from f.mime_type then raise exception 'El archivo no terminó de cargar o sus datos no coinciden. Reintente'; end if;
 return f;
end $$;
revoke all on function private.checked_project_file(uuid) from public,anon,authenticated;

create function public.finish_project_file(p_id uuid,p_type_name text default null) returns public.project_files language plpgsql security definer set search_path='' as $$
declare f public.project_files%rowtype; old_file public.project_files%rowtype; type_id uuid; type_name text;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 perform 1 from public.projects where id=(select project_id from public.project_files where id=p_id) for update;
 select * into f from public.project_files where id=p_id;
 if f.status='ready' and f.created_by=auth.uid() then return f; end if;
 f:=private.checked_project_file(p_id);
 if f.kind='receipt' and f.payment_id is null then raise exception 'Guarde el anticipo junto con el soporte'; end if;
 if f.replaces_id is not null then
  select * into old_file from public.project_files where id=f.replaces_id for update;
  if old_file.status<>'ready' or old_file.updated_at is distinct from f.expected_updated_at then raise exception 'El archivo cambió. Actualice el proyecto'; end if;
  update public.project_files set status='deleted',updated_at=clock_timestamp(),updated_by=auth.uid() where id=old_file.id;
 elsif f.kind='receipt' and exists(select 1 from public.project_files where payment_id=f.payment_id and status='ready') then raise exception 'El anticipo ya tiene soporte. Actualice el proyecto';
 end if;
 if f.kind='attachment' then
  type_name:=btrim(regexp_replace(p_type_name,'\s+',' ','g'));
  if type_name is null or length(type_name) not between 1 and 100 then raise exception 'Seleccione o cree un tipo de documento'; end if;
  insert into public.project_attachment_types(name,created_by,updated_by) values(type_name,auth.uid(),auth.uid()) on conflict(public.normalize_text(name)) do nothing;
  select id into type_id from public.project_attachment_types where public.normalize_text(name)=public.normalize_text(type_name);
 end if;
 update public.project_files set status='ready',attachment_type_id=type_id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=f.id returning * into f;
 return f;
end $$;

create function public.save_project_payment_with_file(payload jsonb,p_file_id uuid default null) returns public.project_payments language plpgsql security definer set search_path='' as $$
declare payment public.project_payments%rowtype; f public.project_files%rowtype; v_project_id uuid:=(payload->>'project_id')::uuid; v_request_id uuid:=(payload->>'request_id')::uuid;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 if v_request_id is null then raise exception 'Falta el identificador de solicitud'; end if;
 perform 1 from public.projects where id=v_project_id for update;
 if not found then raise exception 'Proyecto no encontrado'; end if;
 select * into payment from public.project_payments p where p.request_id=v_request_id;
 if found then
  if payment.project_id<>v_project_id or payment.amount<>(payload->>'amount')::numeric or payment.payment_date<>(payload->>'payment_date')::date or payment.payment_method<>payload->>'payment_method' or payment.note<>coalesce(payload->>'note','') or (p_file_id is not null and not exists(select 1 from public.project_files where id=p_file_id and payment_id=payment.id)) then raise exception 'Solicitud de anticipo incompatible'; end if;
  return payment;
 end if;
 if payload->>'amount' is null or payload->>'amount' !~ '^\d{1,12}(\.\d{1,2})?$' or (payload->>'amount')::numeric<=0 or coalesce(length(btrim(payload->>'payment_method')),0)=0 then raise exception 'Datos del anticipo no válidos'; end if;
 if p_file_id is not null then
  f:=private.checked_project_file(p_file_id);
  if f.project_id<>v_project_id or f.kind<>'receipt' or f.payment_id is not null or f.replaces_id is not null then raise exception 'Soporte incompatible con el anticipo'; end if;
 end if;
 insert into public.project_payments(project_id,payment_date,amount,payment_method,note,request_id,created_by,updated_by)
 values(v_project_id,(payload->>'payment_date')::date,(payload->>'amount')::numeric,payload->>'payment_method',coalesce(payload->>'note',''),v_request_id,auth.uid(),auth.uid()) returning * into payment;
 if p_file_id is not null then update public.project_files set status='ready',payment_id=payment.id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=f.id; end if;
 return payment;
end $$;

create function public.change_project_file(p_id uuid,p_expected_updated_at timestamptz,p_delete boolean default false,p_type_name text default null) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files%rowtype; type_id uuid; type_name text;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 perform 1 from public.projects where id=(select project_id from public.project_files where id=p_id) for update;
 select * into f from public.project_files where id=p_id for update;
 if not found or f.status<>'ready' or f.updated_at is distinct from p_expected_updated_at then raise exception 'El archivo cambió. Actualice el proyecto'; end if;
 if p_delete then update public.project_files set status='deleted',updated_at=clock_timestamp(),updated_by=auth.uid() where id=f.id;
 else
  if f.kind<>'attachment' then raise exception 'Los soportes no se reclasifican'; end if;
  type_name:=btrim(regexp_replace(p_type_name,'\s+',' ','g'));
  if type_name is null or length(type_name) not between 1 and 100 then raise exception 'Tipo no válido'; end if;
  insert into public.project_attachment_types(name,created_by,updated_by) values(type_name,auth.uid(),auth.uid()) on conflict(public.normalize_text(name)) do nothing;
  select id into type_id from public.project_attachment_types where public.normalize_text(name)=public.normalize_text(type_name);
  update public.project_files set attachment_type_id=type_id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=f.id;
 end if;
end $$;

create function public.project_file_cleanup(p_project_id uuid,p_completed_ids uuid[] default '{}') returns setof public.project_files language plpgsql security definer set search_path='' as $$
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 update public.project_files f set status='deleted',updated_at=clock_timestamp(),updated_by=auth.uid() where project_id=p_project_id and status='pending' and created_at<now()-interval '24 hours';
 update public.project_files f set cleanup_complete=true,updated_at=clock_timestamp(),updated_by=auth.uid() where project_id=p_project_id and status='deleted' and id=any(p_completed_ids) and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name=f.object_path);
 return query select * from public.project_files where project_id=p_project_id and status='deleted' and not cleanup_complete order by updated_at limit 100;
end $$;

create function private.project_storage_allowed(p_path text,p_operation text) returns boolean language sql stable security definer set search_path='' as $$
 select (select private.is_active_member()) and exists(
  select 1 from public.project_files f join public.projects p on p.id=f.project_id
  where f.object_path=p_path and split_part(p_path,'/',1)=p.quote_number
   and split_part(p_path,'/',2)=case f.kind when 'receipt' then 'soportes-de-pago' else 'archivos-adjuntos' end
   and array_length(string_to_array(p_path,'/'),1)=3
   and case p_operation when 'read' then f.status='ready' or (f.status='pending' and f.created_by=auth.uid()) or (f.status='deleted' and not f.cleanup_complete and storage.allow_any_operation(array['object.delete','object.delete_many']))
    when 'upload' then f.status='pending' and f.created_by=auth.uid() and f.created_at>=now()-interval '24 hours'
    when 'delete' then f.status='deleted' and not f.cleanup_complete else false end
 );
$$;
revoke all on function private.project_storage_allowed(text,text) from public,anon;
grant execute on function private.project_storage_allowed(text,text) to authenticated;
create policy project_files_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and (select private.project_storage_allowed(name,'read')));
create policy project_files_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and (select private.project_storage_allowed(name,'upload')));
create policy project_files_storage_delete on storage.objects for delete to authenticated using(bucket_id='project-files' and (select private.project_storage_allowed(name,'delete')));

revoke all on function public.prepare_project_file(uuid,uuid,text,text,text,bigint,uuid,uuid,timestamptz),public.finish_project_file(uuid,text),public.save_project_payment_with_file(jsonb,uuid),public.change_project_file(uuid,timestamptz,boolean,text),public.project_file_cleanup(uuid,uuid[]) from public,anon;
grant execute on function public.prepare_project_file(uuid,uuid,text,text,text,bigint,uuid,uuid,timestamptz),public.finish_project_file(uuid,text),public.save_project_payment_with_file(jsonb,uuid),public.change_project_file(uuid,timestamptz,boolean,text),public.project_file_cleanup(uuid,uuid[]) to authenticated;
commit;
