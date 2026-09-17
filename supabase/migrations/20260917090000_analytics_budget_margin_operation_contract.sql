-- Mejora aditiva de Análisis. Conserva las firmas públicas existentes.
begin;

create or replace function public.analytics_filter_options_v2(p_view text)
returns table(kind text, id text, label text, parent_id text)
language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.id, p.client_id, p.quote_number, p.title, p.responsible
    from public.projects p
    where (select private.is_active_member())
  ), quotes as (
    select q.client_id from public.quotes q
    where (select private.is_active_member())
  )
  select kind, id, label, parent_id
  from (
    select 'client'::text, c.id::text, c.name, null::text
    from public.clients c
    where p_view in ('management', 'operation')
      and exists (select 1 from projects p where p.client_id = c.id)
    union all
    select 'client', c.id::text, c.name, null::text
    from public.clients c
    where p_view = 'commercial'
      and exists (select 1 from quotes q where q.client_id = c.id)
    union all
    select 'project', p.id::text, concat_ws(' — ', nullif(p.quote_number, ''), p.title), p.client_id::text
    from projects p
    where p_view = 'management'
    union all
    select 'responsible',
      coalesce(nullif(p.responsible, ''), '__unassigned__'),
      coalesce(nullif(p.responsible, ''), 'Sin responsable'),
      null::text
    from projects p
    where p_view = 'operation'
    group by coalesce(nullif(p.responsible, ''), '__unassigned__'),
      coalesce(nullif(p.responsible, ''), 'Sin responsable')
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
    select p.id as project_id, p.quote_number, p.title,
      x.payment_date as movement_date, x.amount as amount, 'payment'::text as kind
    from projects p
    join public.project_payments x on x.project_id = p.id
    union all
    select p.id, p.quote_number, p.title,
      x.expense_date as movement_date, x.amount as amount, 'expense'::text as kind
    from projects p
    join public.project_expenses x on x.project_id = p.id
  ), period_movements as (
    select * from movements
    where p_month is null or to_char(movement_date, 'YYYY-MM') = p_month
  ), monthly as (
    select to_char(movement_date, 'YYYY-MM') as month_key,
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expenses
    from period_movements
    group by 1
  ), project_cash as (
    select project_id, max(quote_number) as quote_number, max(title) as title,
      coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expenses
    from period_movements
    group by project_id
  ), execution as (
    select id, concat_ws(' — ', nullif(quote_number, ''), title) as label,
      expenses, budget, (expenses / budget * 100) as value
    from projects
    where budget <> 0
  ), margins as (
    select id, concat_ws(' — ', nullif(quote_number, ''), title) as label,
      (real_profit / project_value * 100) as current,
      (projected_profit / project_value * 100) as projected
    from projects
    where project_value <> 0
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
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('key', month_key, 'label', month_key, 'paid', paid::text, 'expenses', expenses::text, 'difference', (paid - expenses)::text) order by month_key)
      from monthly
    ), '[]'::jsonb),
    'balances', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.client_id, 'label', x.name, 'value', x.balance::text, 'unit', 'money') order by x.balance desc, x.client_id)
      from (
        select p.client_id, c.name, sum(p.balance) as balance
        from projects p join public.clients c on c.id = p.client_id
        group by p.client_id, c.name
      ) x
    ), '[]'::jsonb),
    'cashByProject', coalesce((
      select jsonb_agg(jsonb_build_object('key', project_id, 'label', concat_ws(' — ', nullif(quote_number, ''), title), 'paid', paid::text, 'expenses', expenses::text, 'difference', (paid - expenses)::text) order by paid + expenses desc, project_id)
      from (
        select * from project_cash
        where paid + expenses > 0
        order by paid + expenses desc, project_id
        limit 10
      ) x
    ), '[]'::jsonb),
    'budgetExecution', coalesce((
      select jsonb_agg(jsonb_build_object('key', id, 'label', label, 'value', value::text, 'expenses', expenses::text, 'budget', budget::text, 'overBudget', value > 100, 'unit', 'percent') order by value desc, id)
      from (select * from execution order by value desc, id limit 10) x
    ), '[]'::jsonb),
    'profitMargins', coalesce((
      select jsonb_agg(jsonb_build_object('key', id, 'label', label, 'current', current::text, 'projected', projected::text, 'unit', 'percent') order by projected, id)
      from (select * from margins order by projected, id limit 10) x
    ), '[]'::jsonb),
    'excluded', jsonb_build_object(
      'budgetExecution', (select count(*) from projects where budget = 0),
      'profitMargins', (select count(*) from projects where project_value = 0)
    )
  )
  from projects;
$$;

create or replace function public.analytics_operation_snapshot(
  p_client uuid default null,
  p_responsible text default null,
  p_status text default null,
  p_priority text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select * from public.projects p
    where (select private.is_active_member())
      and (p_client is null or p.client_id = p_client)
      and (
        p_responsible is null
        or (p_responsible = '__unassigned__' and nullif(p.responsible, '') is null)
        or (p_responsible <> '__unassigned__' and p.responsible = p_responsible)
      )
      and (p_status is null or p.status::text = p_status)
      and (p_priority is null or p.priority::text = p_priority)
  )
  select jsonb_build_object(
    'total', (select count(*) from projects),
    'byStatus', coalesce((
      select jsonb_agg(jsonb_build_object('key', status::text, 'label', status::text, 'value', count::text, 'unit', 'count') order by status)
      from (select status, count(*) as count from projects group by status) x
    ), '[]'::jsonb),
    'byResponsible', coalesce((
      select jsonb_agg(jsonb_build_object('key', responsible_key, 'label', responsible_label, 'value', count::text, 'unit', 'count') order by responsible_label)
      from (
        select coalesce(nullif(responsible, ''), '__unassigned__') as responsible_key,
          coalesce(nullif(responsible, ''), 'Sin responsable') as responsible_label,
          count(*) as count
        from projects
        where status in ('approved', 'in_progress', 'paused')
        group by 1, 2
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function public.analytics_operation_page(
  p_client uuid default null,
  p_responsible text default null,
  p_status text default null,
  p_priority text default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table(id uuid, title text, quote_number text, responsible text, start_date date, expected_end_date date, actual_end_date date, status text, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.quote_number, p.responsible, p.start_date, p.expected_end_date,
    p.actual_end_date, p.status::text, count(*) over()
  from public.projects p
  where (select private.is_active_member())
    and (p_client is null or p.client_id = p_client)
    and (
      p_responsible is null
      or (p_responsible = '__unassigned__' and nullif(p.responsible, '') is null)
      or (p_responsible <> '__unassigned__' and p.responsible = p_responsible)
    )
    and (p_status is null or p.status::text = p_status)
    and (p_priority is null or p.priority::text = p_priority)
  order by p.expected_end_date, p.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.analytics_filter_options_v2(text), public.analytics_management_snapshot(uuid, uuid, text, text), public.analytics_operation_snapshot(uuid, text, text, text), public.analytics_operation_page(uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.analytics_filter_options_v2(text), public.analytics_management_snapshot(uuid, uuid, text, text), public.analytics_operation_snapshot(uuid, text, text, text), public.analytics_operation_page(uuid, text, text, text, integer, integer) to authenticated;
commit;
