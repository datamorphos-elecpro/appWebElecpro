-- Distribuciones generales: importes congelados y operaciones transaccionales.
begin;

alter table public.portfolio_shares
  add column if not exists is_active boolean not null default true,
  add column if not exists paid_amount numeric(14,2);

-- Backfill must happen before validating the paid snapshot check. Existing
-- historical payments may legitimately have no known paid_on date.
update public.portfolio_shares share
set paid_amount = case when share.mode = 'percent'
  then round(summary.real_profit * share.value / 100, 2)
  else share.value end
from public.portfolio_financial_summary summary
where share.is_paid and share.paid_amount is null;

alter table public.portfolio_shares
  drop constraint if exists portfolio_shares_percent_range,
  add constraint portfolio_shares_percent_range check (mode <> 'percent' or value between 0 and 100),
  drop constraint if exists portfolio_shares_paid_snapshot,
  add constraint portfolio_shares_paid_snapshot check (
    (not is_paid and paid_on is null and paid_amount is null)
    or (is_paid and paid_amount is not null and paid_amount >= 0)
  );

-- Las filas pagadas que existían no tienen una instantánea fiable. Se inicializan
-- para su revisión; las liquidaciones posteriores siempre calculan bajo bloqueo.
update public.portfolio_shares share
set paid_amount = case when share.mode = 'percent'
  then round(summary.real_profit * share.value / 100, 2)
  else share.value end
from public.portfolio_financial_summary summary
where share.is_paid and share.paid_amount is null;

create index if not exists idx_portfolio_shares_active_paid_created
  on public.portfolio_shares(is_active, is_paid, created_at desc);
create index if not exists idx_portfolio_shares_participant
  on public.portfolio_shares(public.normalize_text(participant));

create or replace function public.save_portfolio_share(p_payload jsonb) returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype; v_id uuid;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  if coalesce(p_payload->>'participant', '') = '' then raise exception 'El participante es obligatorio'; end if;
  if (p_payload->>'mode') not in ('percent', 'fixed') then raise exception 'Modalidad inválida'; end if;
  if coalesce((p_payload->>'value')::numeric, -1) < 0 then raise exception 'El valor no puede ser negativo'; end if;
  if p_payload->>'mode' = 'percent' and (p_payload->>'value')::numeric > 100 then raise exception 'El porcentaje no puede superar 100'; end if;
  if v_id is not null then
    select * into v_row from public.portfolio_shares where id = v_id for update;
    if not found then raise exception 'Distribución no encontrada'; end if;
    if v_row.is_paid and (v_row.participant, v_row.mode, v_row.value) is distinct from
      (p_payload->>'participant', (p_payload->>'mode')::public.share_mode, (p_payload->>'value')::numeric) then
      raise exception 'Reabra el pago antes de cambiar su regla económica';
    end if;
    update public.portfolio_shares set participant = p_payload->>'participant', mode = (p_payload->>'mode')::public.share_mode,
      value = (p_payload->>'value')::numeric, basis = 'portfolio_profit', updated_by = auth.uid(), updated_at = now()
      where id = v_id returning * into v_row;
  else
    insert into public.portfolio_shares(participant, mode, value, basis, created_by, updated_by)
      values (p_payload->>'participant', (p_payload->>'mode')::public.share_mode, (p_payload->>'value')::numeric, 'portfolio_profit', auth.uid(), auth.uid()) returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function public.settle_portfolio_share(p_id uuid, p_paid_on date default (now() at time zone 'America/Bogota')::date) returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype; v_profit numeric(14,2);
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into v_row from public.portfolio_shares where id = p_id for update;
  if not found then raise exception 'Distribución no encontrada'; end if;
  if v_row.is_paid then return v_row; end if;
  select real_profit into v_profit from public.portfolio_financial_summary;
  update public.portfolio_shares set is_paid = true, paid_on = p_paid_on,
    paid_amount = case when v_row.mode = 'percent' then round(coalesce(v_profit, 0) * v_row.value / 100, 2) else v_row.value end,
    updated_by = auth.uid(), updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.reopen_portfolio_share(p_id uuid) returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into v_row from public.portfolio_shares where id = p_id for update;
  if not found then raise exception 'Distribución no encontrada'; end if;
  update public.portfolio_shares set is_paid = false, paid_on = null, paid_amount = null, updated_by = auth.uid(), updated_at = now()
    where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.set_portfolio_share_active(p_id uuid, p_is_active boolean) returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare v_row public.portfolio_shares%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  update public.portfolio_shares set is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
    where id = p_id returning * into v_row;
  if not found then raise exception 'Distribución no encontrada'; end if;
  return v_row;
end $$;

revoke all on function public.save_portfolio_share(jsonb), public.settle_portfolio_share(uuid, date), public.reopen_portfolio_share(uuid), public.set_portfolio_share_active(uuid, boolean) from public, anon;
grant execute on function public.save_portfolio_share(jsonb), public.settle_portfolio_share(uuid, date), public.reopen_portfolio_share(uuid), public.set_portfolio_share_active(uuid, boolean) to authenticated;
commit;
