-- Fase 2: operaciones consistentes, consecutivos manuales y precisión financiera.
-- Esta migración es aditiva: no modifica instantáneas de cotizaciones ya convertidas.

begin;

-- Las vistas dependen de las columnas financieras cuyo tipo se amplía abajo.
-- Se eliminan en orden inverso y se recrean antes de confirmar la transacción.
drop view if exists public.portfolio_financial_summary;
drop view if exists public.project_financial_summary;

alter table public.quotes
  alter column direct_cost type numeric(18,6),
  alter column administration_amount type numeric(18,6),
  alter column contingency_amount type numeric(18,6),
  alter column utility_amount type numeric(18,6),
  alter column vat_utility_amount type numeric(18,6),
  alter column total_amount type numeric(18,6);

alter table public.quote_items
  alter column final_unit_price type numeric(18,6),
  alter column base_total type numeric(18,6),
  alter column final_total type numeric(18,6);

alter table public.projects alter column project_value type numeric(18,6);
alter table public.project_payments alter column amount type numeric(18,6);
alter table public.project_expenses alter column amount type numeric(18,6);
alter table public.project_budgets alter column amount type numeric(18,6);

create or replace view public.project_financial_summary with (security_invoker = true) as
select p.id, p.project_value,
  coalesce(pay.paid, 0)::numeric(18,6) as paid,
  greatest(0, p.project_value - coalesce(pay.paid, 0))::numeric(18,6) as balance,
  coalesce(exp.expenses, 0)::numeric(18,6) as expenses,
  coalesce(bud.budget, 0)::numeric(18,6) as budget,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(exp.expenses, 0))::numeric(18,6) as real_profit,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(bud.budget, 0))::numeric(18,6) as projected_profit
from public.projects p
left join lateral (select sum(amount) paid from public.project_payments where project_id = p.id) pay on true
left join lateral (select sum(amount) expenses from public.project_expenses where project_id = p.id) exp on true
left join lateral (select sum(amount) budget from public.project_budgets where project_id = p.id) bud on true;

create or replace view public.portfolio_financial_summary with (security_invoker = true) as
select coalesce(sum(project_value), 0)::numeric(18,6) as contracted,
  coalesce(sum(paid), 0)::numeric(18,6) as paid,
  coalesce(sum(balance), 0)::numeric(18,6) as balance,
  coalesce(sum(expenses), 0)::numeric(18,6) as expenses,
  coalesce(sum(budget), 0)::numeric(18,6) as budget,
  coalesce(sum(real_profit), 0)::numeric(18,6) as real_profit,
  coalesce(sum(projected_profit), 0)::numeric(18,6) as projected_profit
from public.project_financial_summary;

grant select on public.project_financial_summary, public.portfolio_financial_summary to authenticated;

create or replace function public.create_manual_project(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare result public.projects%rowtype;
declare p jsonb := coalesce(payload, '{}'::jsonb);
declare number_value text;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  number_value := public.next_quote_number(extract(year from (now() at time zone 'America/Bogota'))::integer);
  insert into public.projects (
    quote_number, client_id, title, project_value, status, responsible, location,
    priority, start_date, expected_end_date, actual_end_date, observations, profit_mode,
    initial_profit, created_by, updated_by
  ) values (
    number_value, (p->>'client_id')::uuid, p->>'title', (p->>'project_value')::numeric,
    (p->>'status')::public.project_status, p->>'responsible', p->>'location',
    (p->>'priority')::public.project_priority, (p->>'start_date')::date,
    (p->>'expected_end_date')::date, nullif(p->>'actual_end_date', '')::date,
    coalesce(p->>'observations', ''), (p->>'profit_mode')::public.profit_mode,
    (p->>'initial_profit')::numeric, (select auth.uid()), (select auth.uid())
  ) returning * into result;
  return result;
end $$;

create or replace function public.approve_and_convert_quote(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare existing public.projects%rowtype;
declare quote_id uuid := nullif(payload->>'id', '')::uuid;
declare saved_quote public.quotes%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if quote_id is not null then
    select p.* into existing from public.quotes q join public.projects p on p.id = q.project_id where q.id = quote_id for update of q;
    if found then return existing; end if;
  end if;
  payload := jsonb_set(coalesce(payload, '{}'::jsonb), '{status}', '"approved"'::jsonb, true);
  select * into saved_quote from public.save_quote(payload);
  return public.convert_quote_to_project(saved_quote.id);
end $$;

revoke all on function public.create_manual_project(jsonb) from public, anon;
grant execute on function public.create_manual_project(jsonb) to authenticated;

commit;
