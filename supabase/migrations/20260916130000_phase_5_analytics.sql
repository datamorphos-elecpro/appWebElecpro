-- Fase 5: Análisis se calcula íntegramente en PostgreSQL. Las funciones
-- devuelven importes como texto para que el cliente nunca pierda precisión.
begin;

create or replace function public.analytics_management_snapshot(p_client uuid default null, p_project uuid default null, p_status text default null, p_month text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (
    select p.*, f.paid, f.balance, f.expenses, f.budget, f.real_profit, f.projected_profit
    from public.projects p join public.project_financial_summary f on f.id=p.id
    where (select private.is_active_member()) and (p_client is null or p.client_id=p_client)
      and (p_project is null or p.id=p_project) and (p_status is null or p.status::text=p_status)
  ), movements as (
    select payment_date as day, amount, 'payment'::text as kind from public.project_payments where project_id in (select id from projects)
    union all select expense_date, amount, 'expense'::text from public.project_expenses where project_id in (select id from projects)
  ), monthly as (
    select to_char(day, 'YYYY-MM') as month_key,
      coalesce(sum(amount) filter(where kind='payment'), 0) as paid,
      coalesce(sum(amount) filter(where kind='expense'), 0) as expenses
    from movements where p_month is null or to_char(day,'YYYY-MM')=p_month group by 1
  ) select jsonb_build_object(
    'metrics', jsonb_build_object('projectValue',coalesce(sum(project_value),0)::text,'paid',coalesce(sum(paid),0)::text,'balance',coalesce(sum(balance),0)::text,'expenses',coalesce(sum(expenses),0)::text,'budget',coalesce(sum(budget),0)::text,'profit',coalesce(sum(real_profit),0)::text,'projectedProfit',coalesce(sum(projected_profit),0)::text),
    'period', jsonb_build_object('paid',(select coalesce(sum(amount) filter(where kind='payment'),0)::text from movements where p_month is null or to_char(day,'YYYY-MM')=p_month),'expenses',(select coalesce(sum(amount) filter(where kind='expense'),0)::text from movements where p_month is null or to_char(day,'YYYY-MM')=p_month),'movementCount',(select count(*) from movements where p_month is null or to_char(day,'YYYY-MM')=p_month)),
    'monthly',coalesce((select jsonb_agg(jsonb_build_object('key',month_key,'label',month_key,'paid',paid::text,'expenses',expenses::text,'difference',(paid-expenses)::text) order by month_key) from monthly),'[]'::jsonb),
    'balances',coalesce((select jsonb_agg(jsonb_build_object('key',x.client_id,'label',x.name,'value',x.balance::text) order by x.balance desc,x.client_id) from (select p.client_id,c.name,sum(p.balance) balance from projects p join public.clients c on c.id=p.client_id group by p.client_id,c.name)x),'[]'::jsonb)
  ) from projects;
$$;

create or replace function public.analytics_management_page(p_client uuid default null,p_project uuid default null,p_status text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,budget text,expenses text,real_profit text,projected_profit text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,count(*) over()
  from public.projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member()) and (p_client is null or p.client_id=p_client) and (p_project is null or p.id=p_project) and (p_status is null or p.status::text=p_status)
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_operation_snapshot(p_client uuid default null,p_responsible text default null,p_status text default null,p_priority text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with projects as (select * from public.projects p where (select private.is_active_member()) and (p_client is null or p.client_id=p_client) and (p_responsible is null or p.responsible=p_responsible) and (p_status is null or p.status::text=p_status) and (p_priority is null or p.priority::text=p_priority))
  select jsonb_build_object('total',(select count(*) from projects),'byStatus',coalesce((select jsonb_agg(jsonb_build_object('key',status::text,'label',status::text,'value',count::text) order by status) from (select status,count(*) count from projects group by status)x),'[]'::jsonb),'byResponsible',coalesce((select jsonb_agg(jsonb_build_object('key',responsible,'label',responsible,'value',count::text) order by responsible) from (select coalesce(nullif(responsible,''),'Sin responsable') responsible,count(*) count from projects where status in ('approved','in_progress','paused') group by 1)x),'[]'::jsonb));
$$;

create or replace function public.analytics_operation_page(p_client uuid default null,p_responsible text default null,p_status text default null,p_priority text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,title text,quote_number text,responsible text,start_date date,expected_end_date date,actual_end_date date,status text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.responsible,p.start_date,p.expected_end_date,p.actual_end_date,p.status::text,count(*) over() from public.projects p
  where (select private.is_active_member()) and (p_client is null or p.client_id=p_client) and (p_responsible is null or p.responsible=p_responsible) and (p_status is null or p.status::text=p_status) and (p_priority is null or p.priority::text=p_priority)
  order by p.expected_end_date,p.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_commercial_snapshot(p_client uuid default null,p_status text default null,p_month text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with quotes as (select q.*,case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date then 'expired' else q.status::text end visible_status from public.quotes q where (select private.is_active_member()) and (p_client is null or q.client_id=p_client) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)), filtered as (select * from quotes where p_status is null or visible_status=p_status)
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

create or replace function public.analytics_commercial_page(p_client uuid default null,p_status text default null,p_month text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,number text,client_name text,issued_on date,visible_status text,total_amount text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  with rows as (select q.*,c.name client_name,case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date then 'expired' else q.status::text end visible_status from public.quotes q join public.clients c on c.id=q.client_id where (select private.is_active_member()) and (p_client is null or q.client_id=p_client) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)) select id,number,client_name,issued_on,visible_status,total_amount::text,count(*) over() from rows where p_status is null or visible_status=p_status order by issued_on desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.analytics_filter_options(p_view text)
returns table(kind text,id text,label text) language sql stable security definer set search_path = '' as $$
  select kind,id,label from (
    select 'client'::text kind,c.id::text id,c.name label from public.clients c where (select private.is_active_member()) and p_view in ('management','operation','commercial')
    union all select 'project',p.id::text,coalesce(nullif(p.quote_number,''),p.title) from public.projects p where (select private.is_active_member()) and p_view='management'
    union all select 'responsible',p.responsible,p.responsible from public.projects p where (select private.is_active_member()) and p_view='operation' and p.responsible<>'' group by p.responsible
  ) options order by kind,label,id;
$$;

create or replace function public.distribution_page(p_q text default null,p_activity text default null,p_payment text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,participant text,mode text,value text,basis text,is_active boolean,is_paid boolean,paid_on date,paid_amount text,created_at timestamptz,total_count bigint)
language sql stable security definer set search_path = '' as $$
  select s.id,s.participant,s.mode::text,s.value::text,s.basis::text,s.is_active,s.is_paid,s.paid_on,s.paid_amount::text,s.created_at,count(*) over() from public.portfolio_shares s where (select private.is_active_member()) and (p_q is null or public.normalize_text(s.participant) like '%'||public.normalize_text(p_q)||'%') and (p_activity is null or (p_activity='active' and s.is_active) or (p_activity='inactive' and not s.is_active)) and (p_payment is null or (p_payment='paid' and s.is_paid) or (p_payment='pending' and not s.is_paid)) order by s.created_at desc,s.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.distribution_snapshot(p_q text default null,p_activity text default null,p_payment text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 with filtered as (select * from public.portfolio_shares s where (select private.is_active_member()) and (p_q is null or public.normalize_text(s.participant) like '%'||public.normalize_text(p_q)||'%') and (p_activity is null or (p_activity='active' and s.is_active) or (p_activity='inactive' and not s.is_active)) and (p_payment is null or (p_payment='paid' and s.is_paid) or (p_payment='pending' and not s.is_paid))), totals as (select f.real_profit result,coalesce(sum(s.paid_amount) filter(where s.is_paid),0) paid,coalesce(sum(case when s.is_active and not s.is_paid then case when s.mode='percent' then f.real_profit*s.value/100 else s.value end else 0 end),0) pending from public.portfolio_financial_summary f left join filtered s on true group by f.real_profit), participant as (select s.participant,coalesce(sum(s.paid_amount) filter(where s.is_paid),0) paid,coalesce(sum(case when s.is_active and not s.is_paid then case when s.mode='percent' then t.result*s.value/100 else s.value end else 0 end),0) pending from filtered s cross join totals t group by s.participant) select jsonb_build_object('metrics',jsonb_build_object('result',(select result::text from totals),'paid',(select paid::text from totals),'pending',(select pending::text from totals),'assigned',(select (paid+pending)::text from totals),'available',(select (result-paid-pending)::text from totals)),'participants',coalesce((select jsonb_agg(jsonb_build_object('key',participant,'label',participant,'paid',paid::text,'pending',pending::text,'value',(paid+pending)::text) order by participant) from participant),'[]'::jsonb));
$$;

revoke all on function public.analytics_management_snapshot(uuid,uuid,text,text),public.analytics_management_page(uuid,uuid,text,integer,integer),public.analytics_operation_snapshot(uuid,text,text,text),public.analytics_operation_page(uuid,text,text,text,integer,integer),public.analytics_commercial_snapshot(uuid,text,text),public.analytics_commercial_page(uuid,text,text,integer,integer),public.analytics_filter_options(text),public.distribution_page(text,text,text,integer,integer),public.distribution_snapshot(text,text,text) from public,anon;
grant execute on function public.analytics_management_snapshot(uuid,uuid,text,text),public.analytics_management_page(uuid,uuid,text,integer,integer),public.analytics_operation_snapshot(uuid,text,text,text),public.analytics_operation_page(uuid,text,text,text,integer,integer),public.analytics_commercial_snapshot(uuid,text,text),public.analytics_commercial_page(uuid,text,text,integer,integer),public.analytics_filter_options(text),public.distribution_page(text,text,text,integer,integer),public.distribution_snapshot(text,text,text) to authenticated;
commit;
