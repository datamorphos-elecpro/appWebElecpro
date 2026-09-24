-- Nuevos identificadores y filtros multiselección. Aplicar antes de desplegar la interfaz.
begin;



alter table public.projects add column if not exists source_quote_number text;
update public.projects p set source_quote_number = q.number from public.quotes q where p.quote_id = q.id and p.source_quote_number is null;
insert into public.document_counters(key, last_value)
select 'document', greatest(
  coalesce((select max(last_value) from public.document_counters where key in ('quote', 'project')), 0),
  coalesce((select max(right(number, 6)::bigint) from public.quotes where number ~ '^COT-[0-9]{14}$'), 0),
  coalesce((select max(right(number, 6)::bigint) from public.quotes where number ~ '^[0-9]{14}$'), 0),
  coalesce((select max(right(quote_number, 6)::bigint) from public.projects where quote_number ~ '^PRY-[0-9]{14}$'), 0)
)
on conflict (key) do update set last_value = greatest(public.document_counters.last_value, excluded.last_value);
create unique index if not exists projects_new_number_key on public.projects(quote_number) where quote_number ~ '^PRY-[0-9]{14}$';
create or replace function public.next_project_number() returns text
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  update public.document_counters set last_value = last_value + 1 where key = 'document' returning last_value into v;
  if v > 999999 then raise exception 'Se agotó el consecutivo de seis dígitos'; end if;
  return 'PRY-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDD') || lpad(v::text, 6, '0');
end $$;
revoke all on function public.next_project_number() from public, anon;
grant execute on function public.next_project_number() to authenticated;


create or replace function public.next_quote_number(p_year integer default extract(year from current_date)::integer)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  update public.document_counters set last_value = last_value + 1 where key = 'document' returning last_value into v;
  if not found then raise exception 'Contador de cotizaciones no configurado'; end if;
  if v > 999999 then raise exception 'Se agotó el consecutivo de seis dígitos'; end if;
  return 'COT-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDD') || lpad(v::text, 6, '0');
end $$;

create or replace function public.create_manual_project(payload jsonb) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare p jsonb := coalesce(payload, '{}'::jsonb); result public.projects%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  insert into public.projects(quote_number,client_id,title,project_value,status,responsible,location,address,city,priority,start_date,expected_end_date,actual_end_date,observations,profit_mode,initial_profit,created_by,updated_by)
  values(public.next_project_number(),(p->>'client_id')::uuid,p->>'title',(p->>'project_value')::numeric,(p->>'status')::public.project_status,p->>'responsible',coalesce(p->>'address',''),coalesce(p->>'address',''),coalesce(p->>'city',''),(p->>'priority')::public.project_priority,(p->>'start_date')::date,(p->>'expected_end_date')::date,nullif(p->>'actual_end_date','')::date,coalesce(p->>'observations',''),(p->>'profit_mode')::public.profit_mode,(p->>'initial_profit')::numeric,auth.uid(),auth.uid()) returning * into result;
  return result;
end $$;

create or replace function public.convert_quote_to_project(p_quote_id uuid) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; p public.projects%rowtype; v_manager text; v_number text; v_today date := (now() at time zone 'America/Bogota')::date;
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
  v_number := case when q.number ~ '^COT-[0-9]{14}$' then 'PRY-' || substring(q.number from 5) when q.number ~ '^[0-9]{14}$' then 'PRY-' || q.number else public.next_project_number() end;
  if exists(select 1 from public.projects where quote_number = v_number) then v_number := public.next_project_number(); end if;
  insert into public.projects(quote_id,quote_number,source_quote_number,client_id,title,project_value,status,responsible,location,address,city,start_date,expected_end_date,observations,profit_mode,created_by,updated_by)
  values(q.id,v_number,q.number,q.client_id,q.title,q.total_amount,'approved',v_manager,q.address,q.address,q.city,v_today,v_today+30,q.project_description,'value',auth.uid(),auth.uid()) returning * into p;
  insert into public.project_budgets(project_id,source,position,category,note,quantity,base_unit_price,final_unit_price,base_total,final_total,amount,created_by,updated_by)
  select p.id,'quote_snapshot',position,category::text,description,quantity,base_unit_price,final_unit_price,base_total,final_total,base_total,auth.uid(),auth.uid() from public.quote_items where quote_id=q.id order by position;
  update public.quotes set project_id=p.id,updated_by=auth.uid(),updated_at=now() where id=q.id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,after_data,request_id) values(auth.uid(),'quote',q.id,'convert_quote',jsonb_build_object('project_id',p.id),q.request_id);
  return p;
end $$;

create or replace function public.analytics_management_snapshot_multi(
  p_clients uuid[] default null,
  p_projects uuid[] default null,
  p_statuses text[] default null,
  p_month text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.*, f.paid, f.balance, f.expenses, f.budget, f.real_profit, f.projected_profit
    from public.projects p
    join public.project_financial_summary f on f.id = p.id
    where (select private.is_active_member())
      and (coalesce(cardinality(p_clients), 0) = 0 or p.client_id = any(p_clients))
      and (coalesce(cardinality(p_projects), 0) = 0 or p.id = any(p_projects))
      and (coalesce(cardinality(p_statuses), 0) = 0 or p.status::text = any(p_statuses))
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
  from public.projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients)) and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects)) and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_operation_snapshot_multi(
  p_clients uuid[] default null,
  p_responsibles text[] default null,
  p_statuses text[] default null,
  p_priorities text[] default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select * from public.projects p
    where (select private.is_active_member())
      and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
      and (
        coalesce(cardinality(p_responsibles),0)=0
        or ('__unassigned__' = any(p_responsibles) and nullif(p.responsible, '') is null)
        or (p.responsible = any(p_responsibles))
      )
      and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
      and (coalesce(cardinality(p_priorities),0)=0 or p.priority::text=any(p_priorities))
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

create or replace function public.analytics_operation_page_multi(
  p_clients uuid[] default null,
  p_responsibles text[] default null,
  p_statuses text[] default null,
  p_priorities text[] default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table(id uuid, title text, quote_number text, responsible text, start_date date, expected_end_date date, actual_end_date date, status text, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.quote_number, p.responsible, p.start_date, p.expected_end_date,
    p.actual_end_date, p.status::text, count(*) over()
  from public.projects p
  where (select private.is_active_member())
    and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (
      coalesce(cardinality(p_responsibles),0)=0
      or ('__unassigned__' = any(p_responsibles) and nullif(p.responsible, '') is null)
      or (p.responsible = any(p_responsibles))
    )
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
    and (coalesce(cardinality(p_priorities),0)=0 or p.priority::text=any(p_priorities))
  order by p.expected_end_date, p.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.analytics_commercial_snapshot_multi(p_clients uuid[] default null,p_statuses text[] default null,p_month text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with quotes as (select q.*,case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date then 'expired' else q.status::text end visible_status from public.quotes q where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or q.client_id=any(p_clients)) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)), filtered as (select * from quotes where coalesce(cardinality(p_statuses),0)=0 or visible_status=any(p_statuses))
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'approvedValue', (select coalesce(sum(total_amount) filter(where visible_status='approved'), 0)::text from filtered),
      'validSent', (select count(*) from filtered where visible_status='sent'),
      'expired', (select count(*) from filtered where visible_status='expired'),
      'approval', (select case when count(*) filter(where visible_status in ('approved','rejected')) = 0 then null else round(100.0 * count(*) filter(where visible_status='approved') / count(*) filter(where visible_status in ('approved','rejected')), 1)::text end from filtered)
    ),
    'byStatus', coalesce((select jsonb_agg(jsonb_build_object('key', visible_status, 'label', visible_status, 'value', count::text) order by visible_status) from (select visible_status, count(*) as count from filtered group by visible_status) x), '[]'::jsonb),
    'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', month_key, 'label', month_key, 'value', amount::text) order by month_key) from (select to_char(issued_on, 'YYYY-MM') as month_key, sum(total_amount) as amount from filtered group by 1) x), '[]'::jsonb),
    'byClient', coalesce((select jsonb_agg(jsonb_build_object('key', client_id, 'label', name, 'value', amount::text) order by amount desc, client_id) from (select q.client_id, c.name, sum(q.total_amount) as amount from filtered q join public.clients c on c.id=q.client_id group by q.client_id, c.name) x), '[]'::jsonb)
  );
$$;

create or replace function public.analytics_commercial_page_multi(p_clients uuid[] default null,p_statuses text[] default null,p_month text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,number text,client_name text,issued_on date,visible_status text,total_amount text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  with rows as (select q.*,c.name client_name,case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date then 'expired' else q.status::text end visible_status from public.quotes q join public.clients c on c.id=q.client_id where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or q.client_id=any(p_clients)) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)) select id,number,client_name,issued_on,visible_status,total_amount::text,count(*) over() from rows where coalesce(cardinality(p_statuses),0)=0 or visible_status=any(p_statuses) order by issued_on desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.distribution_page_multi(p_q text default null,p_activities text[] default null,p_payments text[] default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,participant text,mode text,value text,basis text,is_active boolean,is_paid boolean,paid_on date,paid_amount text,created_at timestamptz,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select s.id,s.participant,s.mode::text,s.value::text,s.basis::text,s.is_active,s.is_paid,s.paid_on,s.paid_amount::text,s.created_at,count(*) over() from public.portfolio_shares s where (select private.is_active_member()) and (p_q is null or public.normalize_text(s.participant) like '%'||public.normalize_text(p_q)||'%') and (coalesce(cardinality(p_activities),0)=0 or (s.is_active and 'active'=any(p_activities)) or (not s.is_active and 'inactive'=any(p_activities))) and (coalesce(cardinality(p_payments),0)=0 or (s.is_paid and 'paid'=any(p_payments)) or (not s.is_paid and 'pending'=any(p_payments))) order by s.created_at desc,s.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.distribution_snapshot_multi(p_q text default null,p_activities text[] default null,p_payments text[] default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 with filtered as (select * from public.portfolio_shares s where (select private.is_active_member()) and (p_q is null or public.normalize_text(s.participant) like '%'||public.normalize_text(p_q)||'%') and (coalesce(cardinality(p_activities),0)=0 or (s.is_active and 'active'=any(p_activities)) or (not s.is_active and 'inactive'=any(p_activities))) and (coalesce(cardinality(p_payments),0)=0 or (s.is_paid and 'paid'=any(p_payments)) or (not s.is_paid and 'pending'=any(p_payments)))), totals as (select f.real_profit result,coalesce(sum(s.paid_amount) filter(where s.is_paid),0) paid,coalesce(sum(case when s.is_active and not s.is_paid then case when s.mode='percent' then f.real_profit*s.value/100 else s.value end else 0 end),0) pending from public.portfolio_financial_summary f left join filtered s on true group by f.real_profit), participant as (select s.participant,coalesce(sum(s.paid_amount) filter(where s.is_paid),0) paid,coalesce(sum(case when s.is_active and not s.is_paid then case when s.mode='percent' then t.result*s.value/100 else s.value end else 0 end),0) pending from filtered s cross join totals t group by s.participant) select jsonb_build_object('metrics',jsonb_build_object('result',(select result::text from totals),'paid',(select paid::text from totals),'pending',(select pending::text from totals),'assigned',(select (paid+pending)::text from totals),'available',(select (result-paid-pending)::text from totals)),'participants',coalesce((select jsonb_agg(jsonb_build_object('key',participant,'label',participant,'paid',paid::text,'pending',pending::text,'value',(paid+pending)::text) order by participant) from participant),'[]'::jsonb));
$$;

revoke all on function public.analytics_management_snapshot_multi(uuid[], uuid[], text[], text), public.analytics_management_page_multi(uuid[], uuid[], text[], integer, integer), public.analytics_operation_snapshot_multi(uuid[], text[], text[], text[]), public.analytics_operation_page_multi(uuid[], text[], text[], text[], integer, integer), public.analytics_commercial_snapshot_multi(uuid[], text[], text), public.analytics_commercial_page_multi(uuid[], text[], text, integer, integer), public.distribution_page_multi(text, text[], text[], integer, integer), public.distribution_snapshot_multi(text, text[], text[]) from public, anon;

grant execute on function public.analytics_management_snapshot_multi(uuid[], uuid[], text[], text), public.analytics_management_page_multi(uuid[], uuid[], text[], integer, integer), public.analytics_operation_snapshot_multi(uuid[], text[], text[], text[]), public.analytics_operation_page_multi(uuid[], text[], text[], text[], integer, integer), public.analytics_commercial_snapshot_multi(uuid[], text[], text), public.analytics_commercial_page_multi(uuid[], text[], text, integer, integer), public.distribution_page_multi(text, text[], text[], integer, integer), public.distribution_snapshot_multi(text, text[], text[]) to authenticated;

commit;
