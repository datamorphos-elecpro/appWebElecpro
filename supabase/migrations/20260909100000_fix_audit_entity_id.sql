-- Corrige la auditoría de company_settings: su PK es boolean, no UUID.
-- Aplicar después de 20260909000000_initial_elecpro.sql si esta alcanzó a crear las tablas.
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity_id uuid;
begin
  -- Las filas sin id UUID (company_settings) conservan la instantánea en JSONB
  -- y usan NULL en la columna UUID de auditoría.
  v_entity_id := case
    when (to_jsonb(new)->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (to_jsonb(new)->>'id')::uuid
    else null
  end;

  if tg_op = 'INSERT' then
    insert into public.audit_log(actor_id, entity_type, entity_id, action, after_data)
    values ((select auth.uid()), tg_table_name, v_entity_id, 'insert', to_jsonb(new));
    return new;
  end if;

  insert into public.audit_log(actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    (select auth.uid()), tg_table_name, v_entity_id,
    case when to_jsonb(old)->>'is_active' = 'true' and to_jsonb(new)->>'is_active' = 'false'
      then 'deactivate'::public.audit_action else 'update'::public.audit_action end,
    to_jsonb(old), to_jsonb(new)
  );
  return new;
end $$;
