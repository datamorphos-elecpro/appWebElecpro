-- Fase 1: contrato final para operaciones sensibles.
-- Es deliberadamente aditiva: las migraciones 20260916100000..102000 pueden
-- haber sido aplicadas de forma parcial en instalaciones existentes.
begin;

alter table public.portfolio_shares
  add column if not exists is_active boolean not null default true,
  add column if not exists paid_amount numeric(18,6),
  add column if not exists request_id uuid;

-- Una liquidación histórica no inventa una fecha. Su importe se reconstruye
-- con la utilidad disponible al aplicar esta corrección y queda identificable
-- mediante la consulta de revisión al final de esta migración.
update public.portfolio_shares as share
set paid_amount = case
  when share.mode = 'percent' then round(coalesce(summary.real_profit, 0) * share.value / 100, 2)
  else share.value
end
from public.portfolio_financial_summary as summary
where share.is_paid and share.paid_amount is null;

alter table public.portfolio_shares
  drop constraint if exists portfolio_shares_percent_range,
  add constraint portfolio_shares_percent_range check (mode <> 'percent' or value between 0 and 100),
  drop constraint if exists portfolio_shares_paid_snapshot,
  add constraint portfolio_shares_paid_snapshot check (
    (not is_paid and paid_on is null and paid_amount is null)
    or (is_paid and paid_amount is not null and paid_amount >= 0)
  );

create unique index if not exists portfolio_shares_request_id_key
  on public.portfolio_shares(request_id) where request_id is not null;

alter table public.quotes add column if not exists request_id uuid;
create unique index if not exists quotes_request_id_key
  on public.quotes(request_id) where request_id is not null;

create index if not exists idx_portfolio_shares_active_paid_created
  on public.portfolio_shares(is_active, is_paid, created_at desc, id desc);
create index if not exists idx_portfolio_shares_participant
  on public.portfolio_shares(public.normalize_text(participant));

-- La tabla solo es legible por miembros; cualquier escritura debe pasar por
-- los RPC que bloquean la fila y conservan la instantánea de pago.
revoke insert, update, delete on public.portfolio_shares from authenticated;
drop policy if exists portfolio_shares_member on public.portfolio_shares;
create policy portfolio_shares_member on public.portfolio_shares
  for select to authenticated using ((select private.is_active_member()));

create or replace function public.portfolio_share_historical_review()
returns table (
  id uuid, participant text, mode public.share_mode, value numeric,
  paid_on date, paid_amount numeric, reconstructed_without_paid_on boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  return query
  select s.id, s.participant, s.mode, s.value, s.paid_on, s.paid_amount,
    (s.is_paid and s.paid_on is null) as reconstructed_without_paid_on
  from public.portfolio_shares as s
  where s.is_paid
  order by (s.paid_on is null) desc, s.paid_on desc nulls first, s.id;
end $$;

create or replace function public.save_portfolio_share(p_payload jsonb)
returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.portfolio_shares%rowtype;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_request_id uuid := nullif(p_payload->>'request_id', '')::uuid;
  v_participant text := trim(coalesce(p_payload->>'participant', ''));
  v_mode public.share_mode := (p_payload->>'mode')::public.share_mode;
  v_value numeric := (p_payload->>'value')::numeric;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if v_id is null and v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
    select * into v_row from public.portfolio_shares where request_id = v_request_id for update;
    if found then return v_row; end if;
  end if;
  if v_participant = '' then raise exception 'El participante es obligatorio'; end if;
  if v_mode is null then raise exception 'Modalidad inválida'; end if;
  if v_value is null or v_value < 0 then raise exception 'El valor no puede ser negativo'; end if;
  if v_mode = 'percent' and v_value > 100 then raise exception 'El porcentaje no puede superar 100'; end if;

  if v_id is not null then
    select * into v_row from public.portfolio_shares where id = v_id for update;
    if not found then raise exception 'Distribución no encontrada'; end if;
    if v_row.is_paid and (v_row.mode, v_row.value) is distinct from (v_mode, v_value) then
      raise exception 'Reabra el pago antes de cambiar modalidad o valor';
    end if;
    -- Para pagos liquidados se permite exclusivamente corregir el participante.
    update public.portfolio_shares
    set participant = v_participant,
        mode = case when v_row.is_paid then v_row.mode else v_mode end,
        value = case when v_row.is_paid then v_row.value else v_value end,
        basis = 'portfolio_profit', updated_by = auth.uid(), updated_at = now()
    where id = v_id returning * into v_row;
  else
    insert into public.portfolio_shares
      (participant, mode, value, basis, request_id, created_by, updated_by)
    values (v_participant, v_mode, v_value, 'portfolio_profit', v_request_id, auth.uid(), auth.uid())
    returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function public.settle_portfolio_share(
  p_id uuid, p_paid_on date default (now() at time zone 'America/Bogota')::date
) returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype; v_profit numeric;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into v_row from public.portfolio_shares where id = p_id for update;
  if not found then raise exception 'Distribución no encontrada'; end if;
  if v_row.is_paid then return v_row; end if;
  select real_profit into v_profit from public.portfolio_financial_summary;
  update public.portfolio_shares set
    is_paid = true, paid_on = coalesce(p_paid_on, (now() at time zone 'America/Bogota')::date),
    paid_amount = case when v_row.mode = 'percent' then round(coalesce(v_profit, 0) * v_row.value / 100, 2) else v_row.value end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.reopen_portfolio_share(p_id uuid)
returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into v_row from public.portfolio_shares where id = p_id for update;
  if not found then raise exception 'Distribución no encontrada'; end if;
  if not v_row.is_paid then return v_row; end if;
  update public.portfolio_shares set is_paid = false, paid_on = null, paid_amount = null,
    updated_by = auth.uid(), updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.set_portfolio_share_active(p_id uuid, p_is_active boolean)
returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into v_row from public.portfolio_shares where id = p_id for update;
  if not found then raise exception 'Distribución no encontrada'; end if;
  if v_row.is_active = p_is_active then return v_row; end if;
  update public.portfolio_shares set is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
  where id = p_id returning * into v_row;
  return v_row;
end $$;

-- Reemplaza el agregado previo por una versión con autorización explícita.
create or replace function public.distribution_metrics(
  p_q text default null, p_activity text default null, p_payment text default null
) returns table(result numeric, paid numeric, pending numeric, assigned numeric, available numeric)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  return query with filtered as (
    select s.* from public.portfolio_shares as s
    where (p_q is null or public.normalize_text(s.participant) like '%' || public.normalize_text(p_q) || '%')
      and (p_activity is null or (p_activity = 'active' and s.is_active) or (p_activity = 'inactive' and not s.is_active))
      and (p_payment is null or (p_payment = 'paid' and s.is_paid) or (p_payment = 'pending' and not s.is_paid))
  ), totals as (
    select f.real_profit::numeric as result,
      coalesce(sum(s.paid_amount) filter (where s.is_paid), 0)::numeric as paid,
      coalesce(sum(case when s.is_active and not s.is_paid then case when s.mode = 'percent' then f.real_profit * s.value / 100 else s.value end else 0 end), 0)::numeric as pending
    from public.portfolio_financial_summary as f left join filtered as s on true group by f.real_profit
  ) select result, paid, pending, paid + pending, result - paid - pending from totals;
end $$;

-- Se conserva la implementación probada de cálculo bajo un nombre privado a
-- la API. El envoltorio serializa cada creación por request_id y devuelve la
-- misma cotización para reintentos, sin volver a asignar consecutivo ni ítems.
alter function public.save_quote(jsonb) rename to save_quote_calculated;

create function public.save_quote(payload jsonb) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid := nullif(payload->>'request_id', '')::uuid;
  v_quote public.quotes%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if nullif(payload->>'id', '') is not null or v_request_id is null then
    return public.save_quote_calculated(payload);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select * into v_quote from public.quotes where request_id = v_request_id for update;
  if found then return v_quote; end if;

  select * into v_quote from public.save_quote_calculated(payload);
  update public.quotes set request_id = v_request_id where id = v_quote.id returning * into v_quote;
  return v_quote;
end $$;

-- Las conversiones son idempotentes por el bloqueo de la cotización. Esta
-- redefinición fija además la fecha operativa en Bogotá para proyectos nuevos.
create or replace function public.convert_quote_to_project(p_quote_id uuid) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; p public.projects%rowtype; v_location text; v_manager text;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if q.project_id is not null then
    select * into p from public.projects where id = q.project_id;
    return p;
  end if;
  if q.status <> 'approved' then raise exception 'Solo se pueden convertir cotizaciones aprobadas'; end if;
  select coalesce(address, '') into v_location from public.clients where id = q.client_id and is_active;
  if v_location is null then raise exception 'Cliente inactivo o no disponible'; end if;
  select manager_name into v_manager from public.company_settings where id = true;
  if v_manager is null then raise exception 'Configuración de empresa no disponible'; end if;
  insert into public.projects (quote_id, quote_number, client_id, title, project_value, status, responsible, location, start_date, expected_end_date, observations, profit_mode, created_by, updated_by)
  values (q.id, q.number, q.client_id, q.title, q.total_amount, 'approved', v_manager, v_location, v_today, v_today + 30, q.project_description, 'value', auth.uid(), auth.uid())
  returning * into p;
  insert into public.project_budgets (project_id, source, position, category, note, quantity, base_unit_price, final_unit_price, base_total, final_total, amount, created_by, updated_by)
  select p.id, 'quote_snapshot', position, category::text, description, quantity, base_unit_price, final_unit_price, base_total, final_total, base_total, auth.uid(), auth.uid()
  from public.quote_items where quote_id = q.id order by position;
  update public.quotes set project_id = p.id, updated_by = auth.uid(), updated_at = now() where id = q.id;
  insert into public.audit_log(actor_id, entity_type, entity_id, action, after_data, request_id)
  values (auth.uid(), 'quote', q.id, 'convert_quote', jsonb_build_object('project_id', p.id), q.request_id);
  return p;
end $$;

create or replace function public.approve_and_convert_quote(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare v_quote public.quotes%rowtype; v_project public.projects%rowtype; v_id uuid := nullif(payload->>'id', '')::uuid;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if v_id is not null then
    select q.* into v_quote from public.quotes as q where q.id = v_id for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    if v_quote.project_id is not null then
      select * into v_project from public.projects where id = v_quote.project_id;
      return v_project;
    end if;
  end if;
  payload := jsonb_set(coalesce(payload, '{}'::jsonb), '{status}', '"approved"'::jsonb, true);
  select * into v_quote from public.save_quote(payload);
  return public.convert_quote_to_project(v_quote.id);
end $$;

revoke all on function public.save_quote_calculated(jsonb) from public, anon, authenticated;
revoke all on function public.save_quote(jsonb), public.convert_quote_to_project(uuid), public.approve_and_convert_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb), public.convert_quote_to_project(uuid), public.approve_and_convert_quote(jsonb) to authenticated;

revoke all on function public.portfolio_share_historical_review(), public.save_portfolio_share(jsonb),
  public.settle_portfolio_share(uuid, date), public.reopen_portfolio_share(uuid),
  public.set_portfolio_share_active(uuid, boolean), public.distribution_metrics(text, text, text) from public, anon;
grant execute on function public.portfolio_share_historical_review(), public.save_portfolio_share(jsonb),
  public.settle_portfolio_share(uuid, date), public.reopen_portfolio_share(uuid),
  public.set_portfolio_share_active(uuid, boolean), public.distribution_metrics(text, text, text) to authenticated;

commit;
