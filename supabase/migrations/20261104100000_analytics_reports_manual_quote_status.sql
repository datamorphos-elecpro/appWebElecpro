-- Informes completos, cronograma, barras comerciales y estados explícitos de cotización.
begin;

create or replace function private.analytics_management_entries(p_metric text, p_filters jsonb)
returns table(id text, label text, sort_date date, amount numeric, data jsonb)
language sql stable security invoker set search_path = '' as $$
  with projects as (
    select p.*, c.name client_name, f.paid, f.withheld, f.balance, f.expenses, f.budget,
      f.real_profit, f.projected_profit, f.paid_distributions
    from public.financial_projects p join public.clients c on c.id=p.client_id
    join public.project_financial_summary f on f.id=p.id
    where (select private.is_active_member())
      and (coalesce(jsonb_array_length(p_filters->'management_client'),0)=0 or p.client_id in (select value::uuid from jsonb_array_elements_text(p_filters->'management_client')))
      and (coalesce(jsonb_array_length(p_filters->'management_project'),0)=0 or p.id in (select value::uuid from jsonb_array_elements_text(p_filters->'management_project')))
      and (coalesce(jsonb_array_length(p_filters->'management_status'),0)=0 or p.status::text in (select value from jsonb_array_elements_text(p_filters->'management_status')))
  )
  select p.id::text, coalesce(nullif(p.quote_number,''),p.title), null::date,
    case p_metric when 'management.projectValue' then p.project_value when 'management.balance' then p.balance
      when 'management.projectedProfit' then p.projected_profit else p.real_profit end,
    jsonb_build_object('kind','project','id',p.id,'project_id',p.id,'client_id',p.client_id,
      'label',coalesce(nullif(p.quote_number,''),p.title),'title',p.title,'client_name',p.client_name,
      'status',p.status,'project_value',p.project_value::text,'paid',p.paid::text,'withheld',p.withheld::text,
      'balance',p.balance::text,'profit_mode',p.profit_mode,
      'base',(case when p.profit_mode='manual' then p.initial_profit else p.project_value end)::text,
      'paid_distributions',p.paid_distributions::text,'expenses',p.expenses::text,'budget',p.budget::text)
  from projects p where p_metric<>'management.expenses' and (p_metric<>'management.balance' or p.balance>0)
  union all
  select e.id::text,coalesce(nullif(p.quote_number,''),p.title),e.expense_date,e.amount,
    jsonb_build_object('kind','expense','id',e.id,'project_id',p.id,'client_id',p.client_id,
      'label',coalesce(nullif(p.quote_number,''),p.title),'title',p.title,'client_name',p.client_name,
      'date',e.expense_date,'category',e.category,'note',e.note)
  from public.project_expenses e join projects p on p.id=e.project_id where p_metric='management.expenses';
$$;
revoke all on function private.analytics_management_entries(text,jsonb) from public,anon;
grant execute on function private.analytics_management_entries(text,jsonb) to authenticated;

create or replace function public.analytics_management_report(p_metric text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if p_metric is null or p_metric not in ('management.projectValue','management.balance','management.expenses','management.profit','management.projectedProfit') then raise exception 'Métrica no válida'; end if;
  select jsonb_build_object('metric',p_metric,'total',count(*),'value',coalesce(sum(e.amount),0)::text,
    'unit','money','components','{}'::jsonb,
    'records',coalesce(jsonb_agg(e.data || jsonb_build_object('amount',e.amount::text)
      order by e.sort_date desc nulls last,e.label,e.id),'[]'::jsonb)) into v_result
  from private.analytics_management_entries(p_metric,p_filters) e;
  return v_result;
end $$;
revoke all on function public.analytics_management_report(text,jsonb) from public,anon;
grant execute on function public.analytics_management_report(text,jsonb) to authenticated;

create or replace function private.project_schedule(p_status text,p_end date)
returns text language sql stable security invoker set search_path = '' as $$
  select case when p_status not in ('approved','in_progress','paused') then ''
    when p_end < (now() at time zone 'America/Bogota')::date then 'overdue'
    when p_end <= (now() at time zone 'America/Bogota')::date+15 then 'upcoming' else 'later' end;
$$;
revoke all on function private.project_schedule(text,date) from public,anon;
grant execute on function private.project_schedule(text,date) to authenticated;

create or replace function private.analytics_operation_scope(p_clients uuid[],p_responsibles text[],p_statuses text[],p_priorities text[],p_schedule text)
returns setof public.projects language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if coalesce(p_schedule,'') not in ('','overdue','upcoming','later') then raise exception 'Cronograma no válido'; end if;
  return query select p.* from public.projects p where
    (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (coalesce(cardinality(p_responsibles),0)=0 or p.responsible=any(p_responsibles) or ('__unassigned__'=any(p_responsibles) and nullif(p.responsible,'') is null))
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
    and (coalesce(cardinality(p_priorities),0)=0 or p.priority::text=any(p_priorities))
    and (coalesce(p_schedule,'')='' or private.project_schedule(p.status::text,p.expected_end_date)=p_schedule);
end $$;
revoke all on function private.analytics_operation_scope(uuid[],text[],text[],text[],text) from public,anon;
grant execute on function private.analytics_operation_scope(uuid[],text[],text[],text[],text) to authenticated;

create or replace function public.analytics_operation_snapshot_v2(p_clients uuid[] default null,p_responsibles text[] default null,p_statuses text[] default null,p_priorities text[] default null,p_schedule text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with projects as materialized (select * from private.analytics_operation_scope(p_clients,p_responsibles,p_statuses,p_priorities,p_schedule))
  select jsonb_build_object('total',(select count(*) from projects),
    'byStatus',coalesce((select jsonb_agg(jsonb_build_object('key',status,'label',status,'value',quantity::text,'unit','count') order by quantity desc,array_position(array['draft','quoted','pending_approval','approved','in_progress','paused','finished','cancelled'],status)) from (select status::text status,count(*) quantity from projects group by status) x),'[]'::jsonb),
    'bySchedule',(select jsonb_agg(jsonb_build_object('key',s.key,'label',s.label,'value',(select count(*)::text from projects p where private.project_schedule(p.status::text,p.expected_end_date)=s.key),'unit','count') order by s.position) from (values ('overdue','Atrasados',1),('upcoming','Próximos a finalizar',2),('later','Con fecha posterior',3)) s(key,label,position)));
$$;
create or replace function public.analytics_operation_page_v2(p_clients uuid[] default null,p_responsibles text[] default null,p_statuses text[] default null,p_priorities text[] default null,p_schedule text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,title text,quote_number text,responsible text,start_date date,expected_end_date date,actual_end_date date,status text,total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.responsible,p.start_date,p.expected_end_date,p.actual_end_date,p.status::text,count(*) over()
  from private.analytics_operation_scope(p_clients,p_responsibles,p_statuses,p_priorities,p_schedule) p
  order by p.expected_end_date,p.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.analytics_operation_snapshot_v2(uuid[],text[],text[],text[],text),public.analytics_operation_page_v2(uuid[],text[],text[],text[],text,integer,integer) from public,anon;
grant execute on function public.analytics_operation_snapshot_v2(uuid[],text[],text[],text[],text),public.analytics_operation_page_v2(uuid[],text[],text[],text[],text,integer,integer) to authenticated;


-- analytics_commercial_snapshot
create or replace function public.analytics_commercial_snapshot(p_client uuid default null,p_status text default null,p_month text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with quotes as (select q.*,q.status::text visible_status from public.quotes q where (select private.is_active_member()) and (p_client is null or q.client_id=p_client) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)), filtered as (select * from quotes where p_status is null or visible_status=p_status)
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'approvedValue', (select coalesce(sum(total_amount) filter(where visible_status='approved'), 0)::text from filtered),
      'validSent', (select count(*) from filtered where visible_status='sent' and valid_until >= (now() at time zone 'America/Bogota')::date),
      'expired', (select count(*) from filtered where visible_status='expired'),
      'approval', (select case when count(*) filter(where visible_status in ('approved','rejected')) = 0 then null else round(100.0 * count(*) filter(where visible_status='approved') / count(*) filter(where visible_status in ('approved','rejected')), 1)::text end from filtered)
    ),
    'byStatus', coalesce((select jsonb_agg(jsonb_build_object('key', visible_status, 'label', visible_status, 'value', count::text) order by visible_status) from (select visible_status, count(*) as count from filtered group by visible_status) x), '[]'::jsonb),
    'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', month_key, 'label', month_key, 'value', amount::text) order by month_key) from (select to_char(issued_on, 'YYYY-MM') as month_key, sum(total_amount) as amount from filtered group by 1) x), '[]'::jsonb),
    'byClient', coalesce((select jsonb_agg(jsonb_build_object('key', client_id, 'label', name, 'value', amount::text) order by amount desc, client_id) from (select q.client_id, c.name, sum(q.total_amount) as amount from filtered q join public.clients c on c.id=q.client_id group by q.client_id, c.name) x), '[]'::jsonb)
  );
$$;

-- analytics_commercial_page
create or replace function public.analytics_commercial_page(p_client uuid default null,p_status text default null,p_month text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,number text,client_name text,issued_on date,visible_status text,total_amount text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  with rows as (select q.*,c.name client_name,q.status::text visible_status from public.quotes q join public.clients c on c.id=q.client_id where (select private.is_active_member()) and (p_client is null or q.client_id=p_client) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)) select id,number,client_name,issued_on,visible_status,total_amount::text,count(*) over() from rows where p_status is null or visible_status=p_status order by issued_on desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

-- quote_project_dashboard_snapshot
create or replace function public.quote_project_dashboard_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  with quote_rows as (
    select q.*, q.status::text as visible_status
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
        'valid_proposals', (select count(*) from quote_rows where visible_status in ('draft','sent') and valid_until >= (now() at time zone 'America/Bogota')::date),
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

-- quotes_page
create or replace function public.quotes_page(
  p_q text default null, p_status text default null, p_sort text default 'created_at',
  p_direction text default 'desc', p_offset integer default 0, p_limit integer default 20,
  p_segment text default null
)
returns table(id uuid, number text, title text, client_name text, client_contact text,
  issued_on date, valid_until date, status text, visible_status text, total_amount text,
  project_id uuid, item_count bigint, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  with rows as (
    select q.id,q.number,q.title,c.name as client_name,c.contact_name as client_contact,
      q.issued_on,q.valid_until,q.status::text,q.created_at,
      q.status::text as visible_status,
      q.total_amount::text,q.project_id,
      (select count(*) from public.quote_items qi where qi.quote_id=q.id) as item_count
    from public.quotes q join public.clients c on c.id=q.client_id
    where (select private.is_active_member())
      and (p_q is null or public.normalize_text(q.number || ' ' || q.title || ' ' || c.name)
        like '%' || public.normalize_text(p_q) || '%')
  ), filtered as (
    select * from rows where (p_status is null or visible_status=p_status)
      and (p_segment is null
        or p_segment='valid' and visible_status in ('draft','sent') and valid_until >= (now() at time zone 'America/Bogota')::date
        or p_segment='decided' and visible_status in ('approved','rejected'))
  ), counted as (select count(*) as total from filtered)
  select f.id,f.number,f.title,f.client_name,f.client_contact,f.issued_on,f.valid_until,
    f.status,f.visible_status,f.total_amount,f.project_id,f.item_count,c.total
  from filtered f cross join counted c
  order by
    case when p_sort='number' and p_direction='asc' then f.number end asc,
    case when p_sort='number' and p_direction<>'asc' then f.number end desc,
    case when p_sort='title' and p_direction='asc' then f.title end asc,
    case when p_sort='title' and p_direction<>'asc' then f.title end desc,
    case when p_sort='total_amount' and p_direction='asc' then f.total_amount::numeric end asc,
    case when p_sort='total_amount' and p_direction<>'asc' then f.total_amount::numeric end desc,
    case when p_sort not in ('number','title','total_amount') and p_direction='asc' then f.created_at end asc,
    case when p_sort not in ('number','title','total_amount') and p_direction<>'asc' then f.created_at end desc,
    f.id desc
  offset least(greatest(p_offset,0), (select greatest(total-1,0)/least(greatest(p_limit,1),100)*least(greatest(p_limit,1),100) from counted))
  limit least(greatest(p_limit,1),100);
$$;

-- analytics_commercial_snapshot_multi
create or replace function public.analytics_commercial_snapshot_multi(p_clients uuid[] default null,p_statuses text[] default null,p_month text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with quotes as (select q.*,q.status::text visible_status from public.quotes q where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or q.client_id=any(p_clients)) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)), filtered as (select * from quotes where coalesce(cardinality(p_statuses),0)=0 or visible_status=any(p_statuses))
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'approvedValue', (select coalesce(sum(total_amount) filter(where visible_status='approved'), 0)::text from filtered),
      'validSent', (select count(*) from filtered where visible_status='sent' and valid_until >= (now() at time zone 'America/Bogota')::date),
      'pendingValue', (select coalesce(sum(total_amount),0)::text from filtered where visible_status='sent' and valid_until >= (now() at time zone 'America/Bogota')::date),
      'expired', (select count(*) from filtered where visible_status='expired'),
      'approval', (select case when count(*) filter(where visible_status in ('approved','rejected')) = 0 then null else round(100.0 * count(*) filter(where visible_status='approved') / count(*) filter(where visible_status in ('approved','rejected')), 1)::text end from filtered)
    ),
    'byStatus', coalesce((select jsonb_agg(jsonb_build_object('key', visible_status, 'label', visible_status, 'value', count::text) order by visible_status) from (select visible_status, count(*) as count from filtered group by visible_status) x), '[]'::jsonb),
    'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', month_key, 'label', month_key, 'value', amount::text) order by month_key) from (select to_char(issued_on, 'YYYY-MM') as month_key, sum(total_amount) as amount from filtered group by 1) x), '[]'::jsonb),
    'byClient', coalesce((select jsonb_agg(jsonb_build_object('key', client_id, 'label', name, 'value', amount::text, 'count', (select count(*) from filtered f where f.client_id=x.client_id),
      'segments', (select coalesce(jsonb_agg(jsonb_build_object('status',z.visible_status,'count',z.quantity,'value',z.amount::text) order by array_position(array['draft','sent','approved','rejected','expired'],z.visible_status)),'[]'::jsonb) from (select f.visible_status,count(*) quantity,sum(f.total_amount) amount from filtered f where f.client_id=x.client_id group by f.visible_status) z)) order by amount desc, client_id) from (select q.client_id, c.name, sum(q.total_amount) as amount from filtered q join public.clients c on c.id=q.client_id group by q.client_id, c.name) x), '[]'::jsonb)
  );
$$;

-- analytics_commercial_page_multi
create or replace function public.analytics_commercial_page_multi(p_clients uuid[] default null,p_statuses text[] default null,p_month text default null,p_offset integer default 0,p_limit integer default 20)
returns table(id uuid,number text,client_name text,issued_on date,visible_status text,total_amount text,total_count bigint)
language sql stable security definer set search_path = '' as $$
  with rows as (select q.*,c.name client_name,q.status::text visible_status from public.quotes q join public.clients c on c.id=q.client_id where (select private.is_active_member()) and (coalesce(cardinality(p_clients),0)=0 or q.client_id=any(p_clients)) and (p_month is null or to_char(q.issued_on,'YYYY-MM')=p_month)) select id,number,client_name,issued_on,visible_status,total_amount::text,count(*) over() from rows where coalesce(cardinality(p_statuses),0)=0 or visible_status=any(p_statuses) order by issued_on desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

-- analytics_metric_detail
create or replace function public.analytics_metric_detail(
  p_metric text, p_filters jsonb default '{}'::jsonb, p_page integer default 1, p_page_size integer default 20
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if p_metric is null or p_metric not in ('management.projectValue','management.balance','management.expenses',
    'management.profit','management.projectedProfit','commercial.approvedValue','commercial.validSent',
    'commercial.pendingValue','commercial.expired','commercial.approval','distribution.result','distribution.paid',
    'distribution.pending','distribution.assigned','distribution.available') then raise exception 'Métrica no válida'; end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not in (20,50,100) then
    raise exception 'Paginación no válida';
  end if;
  if p_metric like 'management.%' then
    v_result := public.analytics_management_report(p_metric,p_filters);
    return v_result || jsonb_build_object(
      'page',least(p_page,greatest(1,((v_result->>'total')::bigint+p_page_size-1)/p_page_size)), 'pageSize',p_page_size,
      'records',coalesce((select jsonb_agg(r.value order by r.ordinality) from jsonb_array_elements(v_result->'records') with ordinality r(value,ordinality)
        where r.ordinality > (least(p_page,greatest(1,((v_result->>'total')::bigint+p_page_size-1)/p_page_size))-1)*p_page_size
          and r.ordinality <= least(p_page,greatest(1,((v_result->>'total')::bigint+p_page_size-1)/p_page_size))*p_page_size),'[]'::jsonb));
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
      q.status::text visible_status
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
      case when p_metric in ('commercial.approvedValue','commercial.pendingValue') then q.total_amount
        when p_metric='commercial.approval' then case when q.visible_status='approved' then 1 else 0 end else 1 end,
      jsonb_build_object('kind','quote','id',q.id,'quote_id',q.id,'label',q.number,'title',q.title,
        'client_name',q.client_name,'status',q.visible_status,'date',q.issued_on,'valid_until',q.valid_until,
        'quote_value',q.total_amount::text)
    from commercial q where (p_metric='commercial.approvedValue' and q.visible_status='approved')
      or (p_metric in ('commercial.validSent','commercial.pendingValue') and q.visible_status='sent' and q.valid_until >= (now() at time zone 'America/Bogota')::date)
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

notify pgrst, 'reload schema';
commit;
