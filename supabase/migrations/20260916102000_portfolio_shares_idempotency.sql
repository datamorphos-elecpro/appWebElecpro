-- Complements the corrective migration with retry-safe mutations.
begin;

alter table public.portfolio_shares add column if not exists request_id uuid;
create unique index if not exists portfolio_shares_request_id_key
  on public.portfolio_shares(request_id) where request_id is not null;

create or replace function public.distribution_metrics(
  p_q text default null, p_activity text default null, p_payment text default null
) returns table(result numeric, paid numeric, pending numeric, assigned numeric, available numeric)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  return query
  with filtered as (
    select share.* from public.portfolio_shares share
    where (p_q is null or public.normalize_text(share.participant) like '%' || public.normalize_text(p_q) || '%')
      and (p_activity is null or (p_activity = 'active' and share.is_active) or (p_activity = 'inactive' and not share.is_active))
      and (p_payment is null or (p_payment = 'paid' and share.is_paid) or (p_payment = 'pending' and not share.is_paid))
  ), totals as (
    select financial.real_profit::numeric as result,
      coalesce(sum(share.paid_amount) filter (where share.is_paid), 0)::numeric as paid,
      coalesce(sum(case when share.is_active and not share.is_paid then
        case when share.mode = 'percent' then financial.real_profit * share.value / 100 else share.value end
      else 0 end), 0)::numeric as pending
    from public.portfolio_financial_summary financial left join filtered share on true
    group by financial.real_profit
  ) select totals.result, totals.paid, totals.pending, totals.paid + totals.pending,
    totals.result - totals.paid - totals.pending from totals;
end $$;

create or replace function public.save_portfolio_share(p_payload jsonb)
returns public.portfolio_shares
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.portfolio_shares%rowtype;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_request_id uuid := nullif(p_payload->>'request_id', '')::uuid;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_payload->>'participant'), '') = '' then raise exception 'El participante es obligatorio'; end if;
  if (p_payload->>'mode') not in ('percent', 'fixed') then raise exception 'Modalidad inválida'; end if;
  if coalesce((p_payload->>'value')::numeric, -1) < 0 then raise exception 'El valor no puede ser negativo'; end if;
  if p_payload->>'mode' = 'percent' and (p_payload->>'value')::numeric > 100 then raise exception 'El porcentaje no puede superar 100'; end if;

  if v_id is null and v_request_id is not null then
    select * into v_row from public.portfolio_shares where request_id = v_request_id for update;
    if found then return v_row; end if;
  end if;
  if v_id is not null then
    select * into v_row from public.portfolio_shares where id = v_id for update;
    if not found then raise exception 'Distribución no encontrada'; end if;
    if v_row.is_paid and (v_row.mode, v_row.value) is distinct from
      ((p_payload->>'mode')::public.share_mode, (p_payload->>'value')::numeric) then
      raise exception 'Reabra el pago antes de cambiar modalidad o valor';
    end if;
    update public.portfolio_shares set participant = trim(p_payload->>'participant'),
      mode = (p_payload->>'mode')::public.share_mode, value = (p_payload->>'value')::numeric,
      basis = 'portfolio_profit', updated_by = auth.uid(), updated_at = now()
    where id = v_id returning * into v_row;
  else
    insert into public.portfolio_shares(participant, mode, value, basis, request_id, created_by, updated_by)
    values (trim(p_payload->>'participant'), (p_payload->>'mode')::public.share_mode,
      (p_payload->>'value')::numeric, 'portfolio_profit', v_request_id, auth.uid(), auth.uid())
    on conflict (request_id) where request_id is not null do update set request_id = excluded.request_id
    returning * into v_row;
  end if;
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

revoke insert, update, delete on public.portfolio_shares from authenticated;
revoke all on function public.save_portfolio_share(jsonb), public.set_portfolio_share_active(uuid, boolean), public.reopen_portfolio_share(uuid), public.distribution_metrics(text, text, text) from public, anon;
grant execute on function public.save_portfolio_share(jsonb), public.set_portfolio_share_active(uuid, boolean), public.reopen_portfolio_share(uuid), public.distribution_metrics(text, text, text) to authenticated;
commit;
