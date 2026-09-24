-- Nuevas ubicaciones y liquidación de jornadas. Las filas históricas no se reinterpretan.
alter table public.quotes add column address text not null default '', add column city text not null default '';
alter table public.projects add column address text not null default '', add column city text not null default '';
update public.projects set address = location where address = '' and location <> '';
alter table public.project_shares add column execution_date date, add column paid_amount numeric(14,2) check (paid_amount >= 0);
create function private.validate_new_project_share() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.execution_date is null then raise exception 'Indique la fecha de ejecución'; end if;
  if new.is_paid or new.paid_on is not null or new.paid_amount is not null then raise exception 'Registre el pago con la acción de liquidación'; end if;
  return new;
end $$;
create trigger project_share_new_execution before insert on public.project_shares for each row execute function private.validate_new_project_share();
revoke all on function private.validate_new_project_share() from public, anon, authenticated;
revoke update, delete on public.project_shares from authenticated;
insert into public.document_counters(key) values ('project') on conflict do nothing;
-- El contador anterior incluía proyectos manuales; desde aquí refleja solo cotizaciones emitidas.
update public.document_counters set last_value = (select count(*) from public.quotes) where key = 'quote';

create or replace function public.next_quote_number(p_year integer default extract(year from current_date)::integer)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  update public.document_counters set last_value = last_value + 1 where key = 'quote' returning last_value into v;
  if not found then raise exception 'Contador de cotizaciones no configurado'; end if;
  return to_char(now() at time zone 'America/Bogota', 'YYYYMMDD') || lpad(v::text, 6, '0');
end $$;

create or replace function public.save_quote(payload jsonb) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare v_request_id uuid := nullif(payload->>'request_id', '')::uuid; v_quote public.quotes%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if nullif(payload->>'id', '') is null and v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
    select * into v_quote from public.quotes where request_id = v_request_id for update;
    if found then return v_quote; end if;
  end if;
  select * into v_quote from public.save_quote_calculated(payload);
  update public.quotes set address = coalesce(payload->>'address', ''), city = coalesce(payload->>'city', ''),
    request_id = coalesce(request_id, v_request_id) where id = v_quote.id returning * into v_quote;
  return v_quote;
end $$;

create or replace function public.create_manual_project(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare p jsonb := coalesce(payload, '{}'::jsonb); result public.projects%rowtype; v bigint;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  update public.document_counters set last_value = last_value + 1 where key = 'project' returning last_value into v;
  if not found then raise exception 'Contador de proyectos no configurado'; end if;
  insert into public.projects(quote_number,client_id,title,project_value,status,responsible,location,address,city,priority,start_date,expected_end_date,actual_end_date,observations,profit_mode,initial_profit,created_by,updated_by)
  values('PRY-' || to_char(now() at time zone 'America/Bogota','YYYY') || '-' || lpad(v::text,6,'0'),(p->>'client_id')::uuid,p->>'title',(p->>'project_value')::numeric,(p->>'status')::public.project_status,p->>'responsible',coalesce(p->>'address',''),coalesce(p->>'address',''),coalesce(p->>'city',''),(p->>'priority')::public.project_priority,(p->>'start_date')::date,(p->>'expected_end_date')::date,nullif(p->>'actual_end_date','')::date,coalesce(p->>'observations',''),(p->>'profit_mode')::public.profit_mode,(p->>'initial_profit')::numeric,auth.uid(),auth.uid()) returning * into result;
  return result;
end $$;

create or replace function public.convert_quote_to_project(p_quote_id uuid) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; p public.projects%rowtype; v_manager text; v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if q.project_id is not null then select * into p from public.projects where id=q.project_id; return p; end if;
  if q.status <> 'approved' then raise exception 'Solo se pueden convertir cotizaciones aprobadas'; end if;
  perform 1 from public.clients where id=q.client_id and is_active;
  if not found then raise exception 'Cliente inactivo o no disponible'; end if;
  select manager_name into v_manager from public.company_settings where id=true;
  if v_manager is null then raise exception 'Configuración de empresa no disponible'; end if;
  insert into public.projects(quote_id,quote_number,client_id,title,project_value,status,responsible,location,address,city,start_date,expected_end_date,observations,profit_mode,created_by,updated_by)
  values(q.id,q.number,q.client_id,q.title,q.total_amount,'approved',v_manager,q.address,q.address,q.city,v_today,v_today+30,q.project_description,'value',auth.uid(),auth.uid()) returning * into p;
  insert into public.project_budgets(project_id,source,position,category,note,quantity,base_unit_price,final_unit_price,base_total,final_total,amount,created_by,updated_by)
  select p.id,'quote_snapshot',position,category::text,description,quantity,base_unit_price,final_unit_price,base_total,final_total,base_total,auth.uid(),auth.uid() from public.quote_items where quote_id=q.id order by position;
  update public.quotes set project_id=p.id,updated_by=auth.uid(),updated_at=now() where id=q.id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,after_data,request_id) values(auth.uid(),'quote',q.id,'convert_quote',jsonb_build_object('project_id',p.id),q.request_id);
  return p;
end $$;

create function public.settle_project_shares(p_project_id uuid, p_ids uuid[], p_paid_on date, p_reopen boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_total integer; v_project_value numeric; v_profit numeric;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if p_paid_on is null and not p_reopen then raise exception 'Indique la fecha de pago'; end if;
  select count(distinct x) into v_total from unnest(p_ids) as x;
  if v_total is null or v_total=0 or v_total<>cardinality(p_ids) then raise exception 'Seleccione participaciones únicas'; end if;
  perform 1 from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proyecto no encontrado'; end if;
  select project_value into v_project_value from public.projects where id=p_project_id;
  select real_profit into v_profit from public.project_financial_summary where id=p_project_id;
  select count(*) into v_count from public.project_shares where id=any(p_ids) and project_id=p_project_id and is_paid=p_reopen;
  if v_count<>v_total then raise exception 'El lote contiene participaciones inexistentes o con estado de pago incompatible'; end if;
  perform 1 from public.project_shares where id=any(p_ids) and project_id=p_project_id for update;
  if p_reopen then
    update public.project_shares set is_paid=false,paid_on=null,paid_amount=null,updated_by=auth.uid(),updated_at=now() where id=any(p_ids) and project_id=p_project_id;
  else
    update public.project_shares set is_paid=true,paid_on=p_paid_on,
      paid_amount=greatest(0,round(case when mode='fixed' then value when basis='project_value' then v_project_value*value/100 else v_profit*value/100 end,2)),
      updated_by=auth.uid(),updated_at=now() where id=any(p_ids) and project_id=p_project_id;
  end if;
  return v_count;
end $$;
revoke all on function public.settle_project_shares(uuid,uuid[],date,boolean) from public,anon;
grant execute on function public.settle_project_shares(uuid,uuid[],date,boolean) to authenticated;
