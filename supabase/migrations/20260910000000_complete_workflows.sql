-- Extensiones de fidelidad, conversión atómica y manifiestos de demostración.
-- Aplicar después de las migraciones 20260909000000 y 20260909100000.

create table private.demo_batches (
  id uuid primary key,
  created_at timestamptz not null default now(),
  label text not null
);
create table private.demo_manifest (
  batch_id uuid not null references private.demo_batches(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  primary key (batch_id, entity_type, entity_id)
);
revoke all on private.demo_batches, private.demo_manifest from public, anon, authenticated;

create or replace function public.convert_quote_to_project(p_quote_id uuid) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  p public.projects%rowtype;
  location_value text;
  manager_value text;
  bogota_today date := (now() at time zone 'America/Bogota')::date;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if q.project_id is not null then
    select * into p from public.projects where id = q.project_id;
    return p;
  end if;
  if q.status <> 'approved' then raise exception 'Solo se pueden convertir cotizaciones aprobadas'; end if;
  select coalesce(address, '') into location_value from public.clients where id = q.client_id and is_active;
  if location_value is null then raise exception 'Cliente inactivo o no disponible'; end if;
  select manager_name into manager_value from public.company_settings where id = true;
  if manager_value is null then raise exception 'Configuración de empresa no disponible'; end if;
  insert into public.projects(quote_id, quote_number, client_id, title, project_value, status, responsible, location, start_date, expected_end_date, observations, profit_mode, created_by, updated_by)
  values(q.id, q.number, q.client_id, q.title, q.total_amount, 'approved', manager_value, location_value, bogota_today, bogota_today + 30, q.project_description, 'value', (select auth.uid()), (select auth.uid()))
  returning * into p;
  insert into public.project_budgets(project_id, source, position, category, note, quantity, base_unit_price, final_unit_price, base_total, final_total, amount, created_by, updated_by)
  select p.id, 'quote_snapshot', position, category::text, description, quantity, base_unit_price, final_unit_price, base_total, final_total, base_total, (select auth.uid()), (select auth.uid())
  from public.quote_items where quote_id = q.id order by position;
  update public.quotes set project_id = p.id where id = q.id;
  insert into public.audit_log(actor_id, entity_type, entity_id, action, after_data)
  values ((select auth.uid()), 'quote', q.id, 'convert_quote', jsonb_build_object('project_id', p.id));
  return p;
end $$;

create or replace function public.approve_and_convert_quote(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare
  saved_quote public.quotes;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  payload := jsonb_set(coalesce(payload, '{}'::jsonb), '{status}', '"approved"'::jsonb, true);
  select * into saved_quote from public.save_quote(payload);
  return public.convert_quote_to_project(saved_quote.id);
end $$;

create or replace function public.set_profile_access(p_profile_id uuid, p_role public.app_role, p_is_active boolean) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  current_row public.profiles%rowtype;
  result public.profiles%rowtype;
begin
  if not (select private.is_administrator()) then raise exception 'No autorizado'; end if;
  select * into current_row from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if current_row.role = 'administrator' and current_row.is_active and (p_role <> 'administrator' or not p_is_active)
     and (select count(*) from public.profiles where role = 'administrator' and is_active) <= 1 then
    raise exception 'No se puede modificar el último administrador activo';
  end if;
  update public.profiles set role = p_role, is_active = p_is_active, updated_at = now() where id = p_profile_id returning * into result;
  insert into public.audit_log(actor_id, entity_type, entity_id, action, before_data, after_data)
  values ((select auth.uid()), 'profile', p_profile_id,
    case when not p_is_active then 'disable_user'::public.audit_action when p_role <> current_row.role then 'change_role'::public.audit_action else 'update'::public.audit_action end,
    to_jsonb(current_row), to_jsonb(result));
  return result;
end $$;

revoke all on function public.approve_and_convert_quote(jsonb), public.set_profile_access(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.approve_and_convert_quote(jsonb), public.set_profile_access(uuid, public.app_role, boolean) to authenticated;
