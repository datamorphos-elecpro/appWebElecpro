-- Apply after 20261103100000_pending_project_status.sql has committed.
begin;

alter table public.project_payments
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id),
  add column delete_reason text,
  add column last_mutation_id uuid unique,
  add column last_mutation_payload jsonb,
  add constraint project_payments_deletion_check check (
    (deleted_at is null and deleted_by is null and delete_reason is null)
    or (deleted_at is not null and deleted_by is not null and delete_reason is not null and length(btrim(delete_reason)) between 1 and 1000)
  );
create trigger project_payments_audit after insert or update on public.project_payments for each row execute function public.audit_row();
create index project_payments_active_date_idx on public.project_payments(project_id,payment_date desc,id) where deleted_at is null;

-- Deleted records remain available to infrastructure audit, not ordinary API reads.
drop policy project_payments_member on public.project_payments;
revoke all on public.project_payments from anon,authenticated;
grant select on public.project_payments to authenticated;
create policy project_payments_read on public.project_payments for select to authenticated
  using ((select private.is_active_member()) and deleted_at is null);

create view public.active_project_payments with (security_invoker=true) as
  select * from public.project_payments where deleted_at is null;
create view public.financial_projects with (security_invoker=true) as
  select * from public.projects where status <> 'pending_approval';
revoke all on public.active_project_payments,public.financial_projects from public,anon,authenticated;
grant select on public.active_project_payments,public.financial_projects to authenticated;

create function public.edit_project_payment(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.project_payments%rowtype; v_id uuid:=(payload->>'id')::uuid;
  v_project uuid:=(payload->>'project_id')::uuid; v_request uuid:=(payload->>'request_id')::uuid;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if v_request is null then raise exception 'Falta el identificador de solicitud'; end if;
  perform 1 from public.projects where id=v_project for update;
  select * into p from public.project_payments where id=v_id and project_id=v_project for update;
  if not found or p.deleted_at is not null then raise exception 'Anticipo no disponible'; end if;
  if p.last_mutation_id=v_request then
    if p.last_mutation_payload is distinct from payload then raise exception 'Solicitud incompatible'; end if;
    return p.id;
  end if;
  if p.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then
    raise exception 'El anticipo cambió. Actualice el proyecto antes de editarlo';
  end if;
  if payload->>'amount' is null or payload->>'amount' !~ '^\d{1,12}(\.\d{1,2})?$'
    or (payload->>'amount')::numeric<=0 or coalesce(length(btrim(payload->>'payment_method')),0)=0
    or payload->>'payment_date' is null then raise exception 'Datos del anticipo no válidos'; end if;
  update public.project_payments set payment_date=(payload->>'payment_date')::date,
    amount=(payload->>'amount')::numeric,payment_method=btrim(payload->>'payment_method'),note=coalesce(payload->>'note',''),
    updated_by=auth.uid(),updated_at=clock_timestamp(),last_mutation_id=v_request,last_mutation_payload=payload
    where id=p.id;
  return p.id;
end $$;

create function public.delete_project_payment(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.project_payments%rowtype; v_project uuid:=(payload->>'project_id')::uuid;
  v_request uuid:=(payload->>'request_id')::uuid; v_reason text:=btrim(payload->>'reason');
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if v_request is null then raise exception 'Falta el identificador de solicitud'; end if;
  if v_reason is null or length(v_reason) not between 1 and 1000 then raise exception 'Indique el motivo de eliminación (máximo 1000 caracteres)'; end if;
  perform 1 from public.projects where id=v_project for update;
  select * into p from public.project_payments where id=(payload->>'id')::uuid and project_id=v_project for update;
  if not found then raise exception 'Anticipo no disponible'; end if;
  if p.last_mutation_id=v_request then
    if p.last_mutation_payload is distinct from payload then raise exception 'Solicitud incompatible'; end if;
    return p.id;
  end if;
  if p.deleted_at is not null then raise exception 'Anticipo no disponible'; end if;
  if p.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'El anticipo cambió. Actualice el proyecto antes de eliminarlo'; end if;
  update public.project_payments set deleted_at=clock_timestamp(),deleted_by=auth.uid(),delete_reason=v_reason,
    updated_at=clock_timestamp(),updated_by=auth.uid(),last_mutation_id=v_request,last_mutation_payload=payload where id=p.id;
  -- Its ready receipt stays in Storage and is never marked for automatic cleanup.
  return p.id;
end $$;
revoke all on function public.edit_project_payment(jsonb),public.delete_project_payment(jsonb) from public,anon;
grant execute on function public.edit_project_payment(jsonb),public.delete_project_payment(jsonb) to authenticated;

create function private.project_file_payment_active(p_payment_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_payment_id is null or exists(select 1 from public.project_payments where id=p_payment_id and deleted_at is null);
$$;
revoke all on function private.project_file_payment_active(uuid) from public,anon;
grant execute on function private.project_file_payment_active(uuid) to authenticated;
drop policy project_files_read on public.project_files;
create policy project_files_read on public.project_files for select to authenticated
using ((select private.is_active_member()) and private.project_file_payment_active(payment_id)
  and (status='ready' or created_by=(select auth.uid()) or status='deleted'));

-- Replace the receipt-only constraint without relying on its generated name.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.project_files'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%mime_type%' loop
    execute format('alter table public.project_files drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.project_files add constraint project_files_receipt_format_check
  check(kind<>'receipt' or (mime_type in ('application/pdf','image/jpeg','image/png') and size_bytes<=10485760 and attachment_type_id is null));

-- Preserve a monotonic revision, including updates within a single transaction.
create function private.payment_revision() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  return new;
end $$;
revoke all on function private.payment_revision() from public,anon,authenticated;
create trigger zz_project_payments_revision before update on public.project_payments for each row execute function private.payment_revision();

-- Financial views and RPC definitions follow. Individual project summaries retain
-- pending projects; only their portfolio contributions are excluded.


create or replace view public.project_financial_summary with (security_invoker = true) as
select p.id, p.project_value,
  coalesce(pay.paid, 0)::numeric(18,6) as paid,
  greatest(0, p.project_value - coalesce(pay.paid, 0) - coalesce(w.withheld, 0))::numeric(18,6) as balance,
  coalesce(exp.expenses, 0)::numeric(18,6) as expenses,
  coalesce(bud.budget, 0)::numeric(18,6) as budget,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(exp.expenses, 0) - coalesce(ds.total,0))::numeric(18,6) as real_profit,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(bud.budget, 0))::numeric(18,6) as projected_profit,
  coalesce(w.withheld, 0)::numeric(18,6) as withheld, coalesce(ds.total,0)::numeric(18,6) as paid_distributions
from public.projects p
left join lateral (select sum(amount) paid from public.active_project_payments where project_id = p.id) pay on true
left join lateral (select sum(amount) expenses from public.project_expenses where project_id = p.id) exp on true
left join lateral (select sum(amount) budget from public.project_budgets where project_id = p.id) bud on true
left join lateral (select sum(amount) withheld from public.project_withholdings where project_id = p.id and voided_at is null) w on true
left join lateral (select sum(paid_amount) total from public.project_shares where project_id=p.id and is_paid) ds on true;

create or replace view public.portfolio_financial_summary with (security_invoker = true) as
select coalesce(sum(f.project_value), 0)::numeric(18,6) as contracted,
  coalesce(sum(paid), 0)::numeric(18,6) as paid,
  coalesce(sum(balance), 0)::numeric(18,6) as balance,
  coalesce(sum(expenses), 0)::numeric(18,6) as expenses,
  coalesce(sum(budget), 0)::numeric(18,6) as budget,
  coalesce(sum(real_profit), 0)::numeric(18,6) as real_profit,
  coalesce(sum(projected_profit), 0)::numeric(18,6) as projected_profit,
  coalesce(sum(withheld), 0)::numeric(18,6) as withheld, coalesce(sum(paid_distributions),0)::numeric(18,6) as paid_distributions
from public.project_financial_summary f join public.financial_projects p on p.id=f.id;
revoke all on public.project_financial_summary, public.portfolio_financial_summary from public, anon;
grant select on public.project_financial_summary, public.portfolio_financial_summary to authenticated;




create or replace function public.analytics_management_snapshot(
  p_client uuid default null,
  p_project uuid default null,
  p_status text default null,
  p_month text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.*, f.paid, f.balance, f.expenses, f.budget, f.real_profit, f.projected_profit
    from public.financial_projects p
    join public.project_financial_summary f on f.id = p.id
    where (select private.is_active_member())
      and (p_client is null or p.client_id = p_client)
      and (p_project is null or p.id = p_project)
      and (p_status is null or p.status::text = p_status)
  ), movements as (
    select p.id as project_id, p.quote_number, p.title,
      x.payment_date as movement_date, x.amount as amount, 'payment'::text as kind
    from projects p
    join public.active_project_payments x on x.project_id = p.id
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

create or replace function public.analytics_management_page(p_client uuid default null,p_project uuid default null,p_status text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,budget text,expenses text,real_profit text,projected_profit text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,count(*) over()
  from public.financial_projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member()) and (p_client is null or p.client_id=p_client) and (p_project is null or p.id=p_project) and (p_status is null or p.status::text=p_status)
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_management_snapshot_multi(
  p_clients uuid[] default null,
  p_projects uuid[] default null,
  p_statuses text[] default null,
  p_month text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.*, f.paid, f.balance, f.expenses, f.budget, f.real_profit, f.projected_profit
    from public.financial_projects p
    join public.project_financial_summary f on f.id = p.id
    where (select private.is_active_member())
      and (coalesce(cardinality(p_clients), 0) = 0 or p.client_id = any(p_clients))
      and (coalesce(cardinality(p_projects), 0) = 0 or p.id = any(p_projects))
      and (coalesce(cardinality(p_statuses), 0) = 0 or p.status::text = any(p_statuses))
  ), movements as (
    select p.id as project_id, p.quote_number, p.title,
      x.payment_date as movement_date, x.amount as amount, 'payment'::text as kind
    from projects p
    join public.active_project_payments x on x.project_id = p.id
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
        
      ) x
    ), '[]'::jsonb),
    'budgetExecution', coalesce((
      select jsonb_agg(jsonb_build_object('key', id, 'label', label, 'value', value::text, 'expenses', expenses::text, 'budget', budget::text, 'overBudget', value > 100, 'unit', 'percent') order by value desc, id)
      from (select * from execution order by value desc, id ) x
    ), '[]'::jsonb),
    'profitMargins', coalesce((
      select jsonb_agg(jsonb_build_object('key', id, 'label', label, 'current', current::text, 'projected', projected::text, 'unit', 'percent') order by projected, id)
      from (select * from margins order by projected, id ) x
    ), '[]'::jsonb),
    'excluded', jsonb_build_object(
      'budgetExecution', (select count(*) from projects where budget = 0),
      'profitMargins', (select count(*) from projects where project_value = 0)
    )
  )
  from projects;
$$;

create or replace function public.analytics_management_page_multi(p_clients uuid[] default null,p_projects uuid[] default null,p_statuses text[] default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,budget text,expenses text,real_profit text,projected_profit text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,count(*) over()
  from public.financial_projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients)) and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects)) and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_management_detail_page(
  p_clients uuid[] default null, p_projects uuid[] default null, p_statuses text[] default null,
  p_offset integer default 0, p_limit integer default 20
) returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,
  budget text,expenses text,real_profit text,projected_profit text,withheld text,total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,
    f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,f.withheld::text,count(*) over()
  from public.financial_projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member())
    and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects))
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_management_financial_page(
  p_clients uuid[] default null, p_projects uuid[] default null, p_statuses text[] default null,
  p_offset integer default 0, p_limit integer default 20
) returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,
  budget text,expenses text,real_profit text,projected_profit text,withheld text,paid_distributions text,total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,
    f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,f.withheld::text,f.paid_distributions::text,count(*) over()
  from public.financial_projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member())
    and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects))
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_metric_detail(
  p_metric text, p_filters jsonb default '{}'::jsonb, p_page integer default 1, p_page_size integer default 20
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if p_metric is null or p_metric not in ('management.projectValue','management.balance','management.expenses',
    'management.profit','management.projectedProfit','commercial.approvedValue','commercial.validSent',
    'commercial.expired','commercial.approval','distribution.result','distribution.paid',
    'distribution.pending','distribution.assigned','distribution.available') then raise exception 'Métrica no válida'; end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not in (20,50,100) then
    raise exception 'Paginación no válida';
  end if;
  with all_projects as (
    select p.id, p.title, p.quote_number, p.status::text, p.profit_mode::text, p.initial_profit,
      p.project_value, c.name client_name, f.paid, f.withheld, f.balance, f.expenses, f.budget,
      f.real_profit, f.projected_profit, f.paid_distributions, p.client_id
    from public.financial_projects p join public.clients c on c.id = p.client_id
    join public.project_financial_summary f on f.id = p.id
  ), management as (
    select * from all_projects p
    where (coalesce(jsonb_array_length(p_filters->'management_client'),0)=0
      or p.client_id in (select value::uuid from jsonb_array_elements_text(p_filters->'management_client')))
      and (coalesce(jsonb_array_length(p_filters->'management_project'),0)=0
        or p.id in (select value::uuid from jsonb_array_elements_text(p_filters->'management_project')))
      and (coalesce(jsonb_array_length(p_filters->'management_status'),0)=0
        or p.status in (select value from jsonb_array_elements_text(p_filters->'management_status')))
    -- El mes solo afecta caja en Gerencia; estas tarjetas son acumuladas.
  ), quote_scope as (
    select q.*, c.name client_name,
      case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date
        then 'expired' else q.status::text end visible_status
    from public.quotes q join public.clients c on c.id=q.client_id
    where (coalesce(jsonb_array_length(p_filters->'commercial_client'),0)=0
      or q.client_id in (select value::uuid from jsonb_array_elements_text(p_filters->'commercial_client')))
      and (nullif(p_filters->>'commercial_month','') is null
        or to_char(q.issued_on,'YYYY-MM') = p_filters->>'commercial_month')
  ), commercial as (
    select * from quote_scope q where coalesce(jsonb_array_length(p_filters->'commercial_status'),0)=0
      or q.visible_status in (select value from jsonb_array_elements_text(p_filters->'commercial_status'))
  ), portfolio as (
    select coalesce(sum(real_profit),0) result from all_projects
  ), distribution as (
    select s.*, case when s.is_paid then coalesce(s.paid_amount,0)
      when s.is_active then case when s.mode='percent' then p.result*s.value/100 else s.value end else 0 end contribution
    from public.portfolio_shares s cross join portfolio p
    where (nullif(p_filters->>'distribution_q','') is null
      or public.normalize_text(s.participant) like '%' || public.normalize_text(p_filters->>'distribution_q') || '%')
      and (coalesce(jsonb_array_length(p_filters->'distribution_activity'),0)=0
        or (s.is_active and (p_filters->'distribution_activity') ? 'active')
        or (not s.is_active and (p_filters->'distribution_activity') ? 'inactive'))
      and (coalesce(jsonb_array_length(p_filters->'distribution_payment'),0)=0
        or (s.is_paid and (p_filters->'distribution_payment') ? 'paid')
        or (not s.is_paid and (p_filters->'distribution_payment') ? 'pending'))
  ), project_rows as (
    select p.* from management p where p_metric like 'management.%' and p_metric<>'management.expenses'
    union all
    select p.* from all_projects p where p_metric in ('distribution.result','distribution.available')
  ), entries as (
    select p.id::text id, coalesce(nullif(p.quote_number,''),p.title) label, null::date sort_date,
      case p_metric when 'management.projectValue' then p.project_value when 'management.balance' then p.balance
        when 'management.projectedProfit' then p.projected_profit else p.real_profit end amount,
      jsonb_build_object('kind','project','id',p.id,'project_id',p.id,'label',coalesce(nullif(p.quote_number,''),p.title),
        'title',p.title,'client_name',p.client_name,'status',p.status,'project_value',p.project_value::text,
        'paid',p.paid::text,'withheld',p.withheld::text,'balance',p.balance::text,'profit_mode',p.profit_mode,
        'base',case when p.profit_mode='manual' then p.initial_profit else p.project_value end::text,
        'paid_distributions',p.paid_distributions::text,'expenses',p.expenses::text,'budget',p.budget::text) data
    from project_rows p where p_metric<>'management.balance' or p.balance>0
    union all
    select e.id::text, p.quote_number, e.expense_date, e.amount,
      jsonb_build_object('kind','expense','id',e.id,'project_id',p.id,'label',coalesce(nullif(p.quote_number,''),p.title),
        'title',p.title,'client_name',p.client_name,'date',e.expense_date,'category',e.category,'note',e.note)
    from public.project_expenses e join management p on p.id=e.project_id where p_metric='management.expenses'
    union all
    select q.id::text, q.number, q.issued_on,
      case when p_metric='commercial.approvedValue' then q.total_amount
        when p_metric='commercial.approval' then case when q.visible_status='approved' then 1 else 0 end else 1 end,
      jsonb_build_object('kind','quote','id',q.id,'quote_id',q.id,'label',q.number,'title',q.title,
        'client_name',q.client_name,'status',q.visible_status,'date',q.issued_on,'valid_until',q.valid_until,
        'quote_value',q.total_amount::text)
    from commercial q where (p_metric='commercial.approvedValue' and q.visible_status='approved')
      or (p_metric='commercial.validSent' and q.visible_status='sent')
      or (p_metric='commercial.expired' and q.visible_status='expired')
      or (p_metric='commercial.approval' and q.visible_status in ('approved','rejected'))
    union all
    select d.id::text, d.participant, d.paid_on,
      case when p_metric='distribution.available' then -d.contribution else d.contribution end,
      jsonb_build_object('kind','distribution','id',d.id,'label',d.participant,'mode',d.mode,
        'rule_value',d.value::text,'is_paid',d.is_paid,'is_active',d.is_active,'date',d.paid_on,
        'paid_amount',coalesce(d.paid_amount,0)::text)
    from distribution d where (p_metric='distribution.paid' and d.is_paid)
      or (p_metric='distribution.pending' and d.is_active and not d.is_paid)
      or (p_metric in ('distribution.assigned','distribution.available') and (d.is_paid or d.is_active))
  ), summary as (
    select count(*) total_count, coalesce(sum(amount),0) total_amount from entries
  ), paging as (
    select *, least(p_page::bigint, greatest(1,(total_count+p_page_size-1)/p_page_size)) page from summary
  ), ranked as (
    select e.*, row_number() over(order by sort_date desc nulls last,label,id) ordinal from entries e
  ), page_rows as (
    select r.* from ranked r cross join paging p
    where r.ordinal > (p.page-1)*p_page_size and r.ordinal <= p.page*p_page_size
  )
  select jsonb_build_object('metric',p_metric,'total',p.total_count,'page',p.page,'pageSize',p_page_size,
    'unit',case when p_metric='commercial.approval' then 'percent'
      when p_metric in ('commercial.validSent','commercial.expired') then 'count' else 'money' end,
    'value',case when p_metric='commercial.approval' then
      case when p.total_count=0 then null else round(100*p.total_amount/p.total_count,1)::text end
      else p.total_amount::text end,
    'components',case when p_metric='commercial.approval' then
      jsonb_build_object('approved',p.total_amount::text,'decisions',p.total_count::text)
      when p_metric like 'distribution.%' then jsonb_build_object('result',(select result::text from portfolio),
        'paid',(select coalesce(sum(contribution) filter(where is_paid),0)::text from distribution),
        'pending',(select coalesce(sum(contribution) filter(where is_active and not is_paid),0)::text from distribution),
        'assigned',(select coalesce(sum(contribution),0)::text from distribution)) else '{}'::jsonb end,
    'records',coalesce((select jsonb_agg(r.data || jsonb_build_object('amount',r.amount::text) order by r.ordinal)
      from page_rows r),'[]'::jsonb)) into v_result from paging p;
  return v_result;
end $$;

create or replace function public.quote_project_dashboard_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  with quote_rows as (
    select q.*, case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date
      then 'expired' else q.status::text end as visible_status
    from public.quotes q where (select private.is_active_member())
  ), quote_status as (
    select visible_status as status, count(*) as quantity, coalesce(sum(total_amount), 0) as total,
      coalesce(avg(total_amount), 0) as average
    from quote_rows group by visible_status
  ), project_rows as (
    select p.*, f.real_profit from public.projects p
    join public.project_financial_summary f on f.id = p.id
    where (select private.is_active_member())
  ), project_status as (
    select status::text as status, count(*) as quantity, coalesce(sum(project_value) filter(where status<>'pending_approval'), 0) as total,
      coalesce(avg(project_value) filter(where status<>'pending_approval'), 0) as average
    from project_rows group by status
  )
  select jsonb_build_object(
    'quotes', jsonb_build_object(
      'metrics', jsonb_build_object(
        'count', (select count(*) from quote_rows),
        'quoted_value', (select coalesce(sum(total_amount),0)::text from quote_rows),
        'approved_value', (select coalesce(sum(total_amount) filter(where visible_status='approved'),0)::text from quote_rows),
        'valid_proposals', (select count(*) from quote_rows where visible_status in ('draft','sent')),
        'approval_rate', (select case when count(*) filter(where visible_status in ('approved','rejected')) = 0 then null else round(100 * count(*) filter(where visible_status='approved')::numeric / count(*) filter(where visible_status in ('approved','rejected')), 2)::text end from quote_rows)
      ),
      'by_status', coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',quantity,'total',total::text,'average',average::text,'share',case when (select count(*) from quote_rows)=0 then '0' else round(100 * quantity::numeric / (select count(*) from quote_rows),2)::text end) order by status) from quote_status), '[]'::jsonb)
    ),
    'projects', jsonb_build_object(
      'metrics', jsonb_build_object(
        'count', (select count(*) from project_rows),
        'contracted_value', (select coalesce(sum(project_value) filter(where status<>'pending_approval'),0)::text from project_rows),
        'active_count', (select count(*) from project_rows where status in ('approved','in_progress','paused')),
        'active_value', (select coalesce(sum(project_value) filter(where status in ('approved','in_progress','paused')),0)::text from project_rows),
        'consolidated_profit', (select coalesce(sum(real_profit) filter(where status<>'pending_approval'),0)::text from project_rows)
      ),
      'by_status', coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',quantity,'total',total::text,'average',average::text,'share',case when (select count(*) from project_rows)=0 then '0' else round(100 * quantity::numeric / (select count(*) from project_rows),2)::text end) order by status) from project_status), '[]'::jsonb)
    )
  );
$$;

create or replace function public.projects_list_page(
  p_q text default null, p_status text default null, p_sort text default 'created_at',
  p_direction text default 'desc', p_offset integer default 0, p_limit integer default 20,
  p_segment text default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as (
    select p.*, jsonb_build_object('name',c.name,'contact_name',c.contact_name,'address',c.address) as clients,
      jsonb_build_object('id',f.id,'project_value',f.project_value::text,'paid',f.paid::text,
        'withheld',f.withheld::text,'balance',f.balance::text,'expenses',f.expenses::text,'budget',f.budget::text,
        'paid_distributions',f.paid_distributions::text,'real_profit',f.real_profit::text,'projected_profit',f.projected_profit::text) as "financialSummary"
    from public.projects p join public.clients c on c.id=p.client_id
    join public.project_financial_summary f on f.id=p.id
    where (select private.is_active_member())
      and (p_q is null or public.normalize_text(p.title || ' ' || p.quote_number || ' ' || c.name)
        like '%' || public.normalize_text(p_q) || '%')
      and (p_status is null or p.status::text=p_status)
      and (p_segment is null
        or p_segment='active' and p.status in ('approved','in_progress','paused')
        or p_segment='paid' and p.status<>'pending_approval' and f.paid>0
        or p_segment='receivable' and p.status<>'pending_approval' and f.balance>0
        or p_segment='expenses' and p.status<>'pending_approval' and f.expenses>0
        or p_segment='delayed' and p.status<>'pending_approval' and p.status not in ('draft','quoted','cancelled')
          and coalesce(p.actual_end_date,(now() at time zone 'America/Bogota')::date)>p.expected_end_date
        or p_segment='ending_soon' and p.status in ('approved','in_progress','paused')
          and p.expected_end_date between (now() at time zone 'America/Bogota')::date
            and (now() at time zone 'America/Bogota')::date+15)
  ), counted as (select count(*) as total from filtered), paging as (
    select total, least(greatest(p_limit,1),100) as size,
      least(greatest(p_offset,0)/least(greatest(p_limit,1),100), greatest(total-1,0)/least(greatest(p_limit,1),100)) as page_index
    from counted
  ), ranked as (
    select f.*, row_number() over (order by
      case when p_sort='title' and p_direction='asc' then f.title end asc,
      case when p_sort='title' and p_direction<>'asc' then f.title end desc,
      case when p_sort='status' and p_direction='asc' then f.status end asc,
      case when p_sort='status' and p_direction<>'asc' then f.status end desc,
      case when p_sort='expected_end_date' and p_direction='asc' then f.expected_end_date end asc,
      case when p_sort='expected_end_date' and p_direction<>'asc' then f.expected_end_date end desc,
      case when p_sort='project_value' and p_direction='asc' then f.project_value end asc,
      case when p_sort='project_value' and p_direction<>'asc' then f.project_value end desc,
      case when p_sort not in ('title','status','expected_end_date','project_value') and p_direction='asc' then f.created_at end asc,
      case when p_sort not in ('title','status','expected_end_date','project_value') and p_direction<>'asc' then f.created_at end desc,
      f.id asc) as ordinal
    from filtered f
  ), page_rows as (
    select r.* from ranked r cross join paging p
    where r.ordinal>p.page_index*p.size and r.ordinal<=(p.page_index+1)*p.size
  )
  select jsonb_build_object('total',p.total,'page',p.page_index+1,
    'records',coalesce((select jsonb_agg((to_jsonb(r)-'ordinal') || jsonb_build_object(
      'project_value',r.project_value::text,'initial_profit',r.initial_profit::text) order by r.ordinal) from page_rows r),'[]'::jsonb))
  from paging p;
$$;

-- Preserve the deployed column contract (including numeric typmods), ACLs and dependents.
-- pg_get_viewdef includes a trailing semicolon, which cannot appear inside a subquery.
do $$
declare existing_definition text;
begin
 select pg_catalog.pg_get_viewdef('public.project_active_alerts'::regclass, false)
 into existing_definition;
 execute format(
  'create or replace view public.project_active_alerts with (security_invoker = true) as
   select existing_alerts.* from (%s) as existing_alerts
   where exists (
    select 1 from public.projects p
    where p.id = existing_alerts.project_id and p.status <> ''pending_approval''
   )',
  regexp_replace(existing_definition, ';\s*$', '')
 );
end $$;

create or replace function public.prepare_project_file(p_id uuid,p_project_id uuid,p_kind text,p_name text,p_mime text,p_size bigint,p_payment_id uuid default null,p_replaces_id uuid default null,p_expected_updated_at timestamptz default null)
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
 if p_id is null or p_kind not in ('receipt','attachment') or p_kind is null or p_name is null or length(p_name) not between 1 and 240 or p_name ~ '[/\\[:cntrl:]]' or expected_mime is null or p_mime is distinct from expected_mime or p_size is null or p_size<=0 or p_size>52428800 or (p_kind='receipt' and (extension not in ('pdf','jpg','jpeg','png') or p_size>10485760)) then raise exception 'Formato, nombre o tamaño de archivo no permitido'; end if;
 if p_kind='attachment' and p_payment_id is not null then raise exception 'Un documento general no se asocia a un anticipo'; end if;
 if p_payment_id is not null and not exists(select 1 from public.project_payments where id=p_payment_id and project_id=p.id and deleted_at is null) then raise exception 'Anticipo no encontrado en este proyecto'; end if;
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

create or replace function public.finish_project_file(p_id uuid,p_type_name text default null) returns public.project_files language plpgsql security definer set search_path='' as $$
declare f public.project_files%rowtype; old_file public.project_files%rowtype; type_id uuid; type_name text;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 perform 1 from public.projects where id=(select project_id from public.project_files where id=p_id) for update;
 select * into f from public.project_files where id=p_id;
 if not private.project_file_payment_active(f.payment_id) then raise exception 'Anticipo no disponible'; end if;
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

create or replace function public.change_project_file(p_id uuid,p_expected_updated_at timestamptz,p_delete boolean default false,p_type_name text default null) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files%rowtype; type_id uuid; type_name text;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 perform 1 from public.projects where id=(select project_id from public.project_files where id=p_id) for update;
 select * into f from public.project_files where id=p_id for update;
 if not private.project_file_payment_active(f.payment_id) then raise exception 'Anticipo no disponible'; end if;
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

create or replace function public.save_project_payment_with_file(payload jsonb,p_file_id uuid default null) returns public.project_payments language plpgsql security definer set search_path='' as $$
declare payment public.project_payments%rowtype; f public.project_files%rowtype; v_project_id uuid:=(payload->>'project_id')::uuid; v_request_id uuid:=(payload->>'request_id')::uuid;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 if v_request_id is null then raise exception 'Falta el identificador de solicitud'; end if;
 perform 1 from public.projects where id=v_project_id for update;
 if not found then raise exception 'Proyecto no encontrado'; end if;
 select * into payment from public.project_payments p where p.request_id=v_request_id;
 if found then
  if payment.deleted_at is not null then raise exception 'Anticipo no disponible'; end if;
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

create or replace function private.project_storage_allowed(p_path text,p_operation text) returns boolean language sql stable security definer set search_path='' as $$
 select (select private.is_active_member()) and exists(
  select 1 from public.project_files f join public.projects p on p.id=f.project_id
  where (f.status='deleted' or private.project_file_payment_active(f.payment_id)) and f.object_path=p_path and split_part(p_path,'/',1)=p.quote_number
   and split_part(p_path,'/',2)=case f.kind when 'receipt' then 'soportes-de-pago' else 'archivos-adjuntos' end
   and array_length(string_to_array(p_path,'/'),1)=3
   and case p_operation when 'read' then f.status='ready' or (f.status='pending' and f.created_by=auth.uid()) or (f.status='deleted' and not f.cleanup_complete and storage.allow_any_operation(array['object.delete','object.delete_many']))
    when 'upload' then f.status='pending' and f.created_by=auth.uid() and f.created_at>=now()-interval '24 hours'
    when 'delete' then f.status='deleted' and not f.cleanup_complete else false end
 );
$$;

notify pgrst, 'reload schema';
commit;
