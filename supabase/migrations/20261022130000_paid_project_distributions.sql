begin;
do $$ begin if exists(select 1 from public.project_shares where is_paid and paid_amount is null) then raise exception 'Corregir pagos sin paid_amount antes de migrar' using detail=(select string_agg(id::text, ', ') from public.project_shares where is_paid and paid_amount is null); end if; end $$;
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
left join lateral (select sum(amount) paid from public.project_payments where project_id = p.id) pay on true
left join lateral (select sum(amount) expenses from public.project_expenses where project_id = p.id) exp on true
left join lateral (select sum(amount) budget from public.project_budgets where project_id = p.id) bud on true
left join lateral (select sum(amount) withheld from public.project_withholdings where project_id = p.id and voided_at is null) w on true
left join lateral (select sum(paid_amount) total from public.project_shares where project_id=p.id and is_paid) ds on true;

create or replace view public.portfolio_financial_summary with (security_invoker = true) as
select coalesce(sum(project_value), 0)::numeric(18,6) as contracted,
  coalesce(sum(paid), 0)::numeric(18,6) as paid,
  coalesce(sum(balance), 0)::numeric(18,6) as balance,
  coalesce(sum(expenses), 0)::numeric(18,6) as expenses,
  coalesce(sum(budget), 0)::numeric(18,6) as budget,
  coalesce(sum(real_profit), 0)::numeric(18,6) as real_profit,
  coalesce(sum(projected_profit), 0)::numeric(18,6) as projected_profit,
  coalesce(sum(withheld), 0)::numeric(18,6) as withheld, coalesce(sum(paid_distributions),0)::numeric(18,6) as paid_distributions
from public.project_financial_summary;
revoke all on public.project_financial_summary, public.portfolio_financial_summary from public, anon;
grant select on public.project_financial_summary, public.portfolio_financial_summary to authenticated;


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
        or p_segment='paid' and f.paid>0
        or p_segment='receivable' and f.balance>0
        or p_segment='expenses' and f.expenses>0
        or p_segment='delayed' and p.status not in ('draft','quoted','cancelled')
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
create or replace function public.settle_project_shares(p_project_id uuid, p_ids uuid[], p_paid_on date, p_reopen boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_total integer; v_project_value numeric; v_profit numeric; v_available numeric; v_due numeric;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if p_paid_on is null and not p_reopen then raise exception 'Indique la fecha de pago'; end if;
  select count(distinct x) into v_total from unnest(p_ids) as x;
  if v_total is null or v_total=0 or v_total<>cardinality(p_ids) then raise exception 'Seleccione participaciones únicas'; end if;
  perform 1 from public.projects where id=p_project_id for update;
  if not found then raise exception 'Proyecto no encontrado'; end if;
  select project_value into v_project_value from public.projects where id=p_project_id;
  select real_profit, real_profit + paid_distributions into v_available, v_profit from public.project_financial_summary where id=p_project_id;
  select count(*) into v_count from public.project_shares where id=any(p_ids) and project_id=p_project_id and is_paid=p_reopen;
  if v_count<>v_total then raise exception 'El lote contiene participaciones inexistentes o con estado de pago incompatible'; end if;
  perform 1 from public.project_shares where id=any(p_ids) and project_id=p_project_id for update;
  if p_reopen then
    update public.project_shares set is_paid=false,paid_on=null,paid_amount=null,updated_by=auth.uid(),updated_at=now() where id=any(p_ids) and project_id=p_project_id;
  else
    select coalesce(sum(greatest(0,round(case when mode='fixed' then value when basis='project_value' then v_project_value*value/100 else v_profit*value/100 end,2))),0) into v_due from public.project_shares where id=any(p_ids) and project_id=p_project_id;
    if v_due > v_available then raise exception 'El pago supera la ganancia disponible'; end if;
    update public.project_shares set is_paid=true,paid_on=p_paid_on,
      paid_amount=greatest(0,round(case when mode='fixed' then value when basis='project_value' then v_project_value*value/100 else v_profit*value/100 end,2)),
      updated_by=auth.uid(),updated_at=now() where id=any(p_ids) and project_id=p_project_id;
  end if;
  return v_count;
end $$;
create function private.require_fixed_distribution() returns trigger language plpgsql set search_path='' as $$
begin if new.mode <> 'fixed' and (TG_OP='INSERT' or new.mode is distinct from old.mode or new.value is distinct from old.value) then raise exception 'Las nuevas distribuciones deben ser valores fijos'; end if; return new; end $$;
revoke all on function private.require_fixed_distribution() from public,anon,authenticated;
create trigger project_distribution_fixed before insert on public.project_shares for each row execute function private.require_fixed_distribution();
create trigger portfolio_distribution_fixed before insert or update of mode,value on public.portfolio_shares for each row execute function private.require_fixed_distribution();
create function private.lock_distribution_project() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP <> 'INSERT' then perform 1 from public.projects where id=old.project_id for update; end if;
 if TG_OP <> 'DELETE' then perform 1 from public.projects where id=new.project_id for update; return new; end if;
 return old;
end $$;
revoke all on function private.lock_distribution_project() from public,anon,authenticated;
create trigger expense_distribution_lock before insert or update or delete on public.project_expenses for each row execute function private.lock_distribution_project();
create function public.analytics_management_financial_page(
  p_clients uuid[] default null, p_projects uuid[] default null, p_statuses text[] default null,
  p_offset integer default 0, p_limit integer default 20
) returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,
  budget text,expenses text,real_profit text,projected_profit text,withheld text,paid_distributions text,total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,
    f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,f.withheld::text,f.paid_distributions::text,count(*) over()
  from public.projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member())
    and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects))
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.analytics_management_financial_page(uuid[],uuid[],text[],integer,integer) from public, anon;
grant execute on function public.analytics_management_financial_page(uuid[],uuid[],text[],integer,integer) to authenticated;


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
    from public.projects p join public.clients c on c.id = p.client_id
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
revoke all on function public.analytics_metric_detail(text,jsonb,integer,integer) from public, anon;
grant execute on function public.analytics_metric_detail(text,jsonb,integer,integer) to authenticated;


notify pgrst, 'reload schema';
commit;
