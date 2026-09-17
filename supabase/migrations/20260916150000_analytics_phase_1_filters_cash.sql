-- Fase 1 de Análisis: opciones contextuales y flujo de caja por proyecto.
-- Es aditiva: mantiene las RPC anteriores disponibles para despliegues en curso.
begin;

create or replace function public.analytics_filter_options_v2(p_view text)
returns table(kind text, id text, label text, parent_id text)
language sql stable security definer set search_path = '' as $$
  with relevant_projects as (
    select p.id, p.client_id, p.quote_number, p.title, p.responsible
    from public.projects p
    where (select private.is_active_member())
  ), relevant_quotes as (
    select q.client_id
    from public.quotes q
    where (select private.is_active_member())
  )
  select kind, id, label, parent_id
  from (
    select 'client'::text, c.id::text, c.name, null::text
    from public.clients c
    where p_view in ('management', 'operation')
      and exists (select 1 from relevant_projects p where p.client_id = c.id)
    union all
    select 'client'::text, c.id::text, c.name, null::text
    from public.clients c
    where p_view = 'commercial'
      and exists (select 1 from relevant_quotes q where q.client_id = c.id)
    union all
    select 'project'::text, p.id::text,
      concat_ws(' — ', nullif(p.quote_number, ''), p.title), p.client_id::text
    from relevant_projects p
    where p_view = 'management'
    union all
    select 'responsible'::text, p.responsible, p.responsible, null::text
    from relevant_projects p
    where p_view = 'operation' and nullif(p.responsible, '') is not null
    group by p.responsible
  ) options(kind, id, label, parent_id)
  order by kind, label, id;
$$;

create or replace function public.analytics_management_snapshot(
  p_client uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_month text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.*, f.paid, f.balance, f.expenses, f.budget, f.real_profit, f.projected_profit
    from public.projects p
    join public.project_financial_summary f on f.id = p.id
    where (select private.is_active_member())
      and (p_client is null or p.client_id = p_client)
      and (p_project is null or p.id = p_project)
      and (p_status is null or p.status::text = p_status)
  ), movements as (
    select p.id as project_id, p.quote_number, p.title, payment_date as day, amount, 'payment'::text as kind
    from projects p join public.project_payments on project_id = p.id
    union all
    select p.id, p.quote_number, p.title, expense_date, amount, 'expense'::text
    from projects p join public.project_expenses on project_id = p.id
  ), period_movements as (
    select * from movements
    where p_month is null or to_char(day, 'YYYY-MM') = p_month
  ), monthly as (
    select to_char(day, 'YYYY-MM') as month_key,
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expenses
    from period_movements group by 1
  ), project_cash as (
    select project_id, max(quote_number) as quote_number, max(title) as title,
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expenses
    from period_movements group by project_id
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'projectValue', coalesce(sum(project_value), 0)::text,
      'paid', coalesce(sum(paid), 0)::text,
      'balance', coalesce(sum(balance), 0)::text,
      'expenses', coalesce(sum(expenses), 0)::text,
      'budget', coalesce(sum(budget), 0)::text,
      'profit', coalesce(sum(real_profit), 0)::text,
      'projectedProfit', coalesce(sum(projected_profit), 0)::text
    ),
    'period', jsonb_build_object(
      'paid', (select coalesce(sum(amount) filter (where kind = 'payment'), 0)::text from period_movements),
      'expenses', (select coalesce(sum(amount) filter (where kind = 'expense'), 0)::text from period_movements),
      'movementCount', (select count(*) from period_movements)
    ),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('key', month_key, 'label', month_key, 'paid', paid::text, 'expenses', expenses::text, 'difference', (paid - expenses)::text) order by month_key) from monthly), '[]'::jsonb),
    'balances', coalesce((select jsonb_agg(jsonb_build_object('key', x.client_id, 'label', x.name, 'value', x.balance::text) order by x.balance desc, x.client_id) from (select p.client_id, c.name, sum(p.balance) balance from projects p join public.clients c on c.id = p.client_id group by p.client_id, c.name) x), '[]'::jsonb),
    'cashByProject', coalesce((select jsonb_agg(jsonb_build_object('key', project_id, 'label', concat_ws(' — ', nullif(quote_number, ''), title), 'paid', paid::text, 'expenses', expenses::text, 'difference', (paid - expenses)::text) order by paid + expenses desc, project_id) from (select * from project_cash where paid + expenses > 0 order by paid + expenses desc, project_id limit 10) x), '[]'::jsonb)
  ) from projects;
$$;

revoke all on function public.analytics_filter_options_v2(text) from public, anon;
grant execute on function public.analytics_filter_options_v2(text) to authenticated;

commit;
