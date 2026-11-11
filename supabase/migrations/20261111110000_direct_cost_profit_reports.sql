begin;
create function private.project_direct_cost(p_id uuid) returns numeric
language sql stable security invoker set search_path='' as $$
 select case when p.quote_id is null then p.project_value else q.direct_cost-q.direct_discount_amount end
 from public.projects p left join public.quotes q on q.id=p.quote_id where p.id=p_id;
$$;
revoke all on function private.project_direct_cost(uuid) from public,anon;
grant execute on function private.project_direct_cost(uuid) to authenticated;
create or replace view public.project_financial_summary with (security_invoker = true) as
select p.id, p.project_value,
  coalesce(pay.paid, 0)::numeric(18,6) as paid,
  greatest(0, p.project_value - coalesce(pay.paid, 0) - coalesce(w.withheld, 0))::numeric(18,6) as balance,
  coalesce(exp.expenses, 0)::numeric(18,6) as expenses,
  coalesce(bud.budget, 0)::numeric(18,6) as budget,
  (private.project_direct_cost(p.id) - coalesce(exp.expenses, 0) - coalesce(ds.total,0))::numeric(18,6) as real_profit,
  (private.project_direct_cost(p.id) - coalesce(bud.budget, 0))::numeric(18,6) as projected_profit,
  coalesce(w.withheld, 0)::numeric(18,6) as withheld, coalesce(ds.total,0)::numeric(18,6) as paid_distributions
from public.projects p
left join lateral (select sum(amount) paid from public.active_project_payments where project_id = p.id) pay on true
left join lateral (select sum(amount) expenses from public.project_expenses where project_id = p.id) exp on true
left join lateral (select sum(amount) budget from public.project_budgets where project_id = p.id) bud on true
left join lateral (select sum(amount) withheld from public.project_withholdings where project_id = p.id and voided_at is null) w on true
left join lateral (select sum(paid_amount) total from public.project_shares where project_id=p.id and is_paid) ds on true;

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
      'base',(private.project_direct_cost(p.id))::text,
      'paid_distributions',p.paid_distributions::text,'expenses',p.expenses::text,'budget',p.budget::text)
  from projects p where p_metric<>'management.expenses' and (p_metric<>'management.balance' or p.balance>0)
  union all
  select e.id::text,coalesce(nullif(p.quote_number,''),p.title),e.expense_date,e.amount,
    jsonb_build_object('kind','expense','id',e.id,'project_id',p.id,'client_id',p.client_id,
      'label',coalesce(nullif(p.quote_number,''),p.title),'title',p.title,'client_name',p.client_name,
      'date',e.expense_date,'category',e.category,'note',e.note)
  from public.project_expenses e join projects p on p.id=e.project_id where p_metric='management.expenses';
$$;
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
        'base',private.project_direct_cost(p.id)::text,
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
create or replace function public.analytics_management_report(p_metric text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_report jsonb; v_projects jsonb;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 if p_metric is null or p_metric not in ('management.projectValue','management.balance','management.expenses','management.profit','management.projectedProfit') then raise exception 'Métrica no válida'; end if;
 select jsonb_build_object('metric',p_metric,'total',count(*),'value',coalesce(sum(e.amount),0)::text,'unit','money','components','{}'::jsonb,
 'records',coalesce(jsonb_agg(e.data || jsonb_build_object('amount',e.amount::text) order by e.sort_date desc nulls last,e.label,e.id),'[]'::jsonb)) into v_report
 from private.analytics_management_entries(p_metric,p_filters) e;
 select coalesce(jsonb_agg(e.data || jsonb_build_object(
 'direct_cost',r.direct_cost,'total_aiu',r.total_aiu,'real_profit',f.real_profit::text,'projected_profit',f.projected_profit::text,
 'discount',coalesce(q.direct_discount_amount,0)::text,'has_quote',p.quote_id is not null,
 'items',case when p_metric='management.expenses' then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'description',i.description,'category',i.category,'quantity',i.quantity::text,'unit',i.unit,'price',i.final_unit_price::text,'amount',i.final_total::text) order by i.position) from public.quote_items i where i.quote_id=p.quote_id),'[]'::jsonb) else '[]'::jsonb end,
 'expenses_detail',case when p_metric='management.expenses' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.expense_date,'category',x.category,'note',x.note,'method',x.payment_method,'amount',x.amount::text) order by x.expense_date desc,x.id) from public.project_expenses x where x.project_id=p.id),'[]'::jsonb) else '[]'::jsonb end,
 'distributions',case when p_metric='management.expenses' then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'participant',s.participant,'execution_date',s.execution_date,'paid_on',s.paid_on,'amount',s.paid_amount::text) order by s.paid_on desc,s.id) from public.project_shares s where s.project_id=p.id and s.is_paid),'[]'::jsonb) else '[]'::jsonb end
 ) order by e.label,e.id),'[]'::jsonb) into v_projects
 from private.analytics_management_entries('management.projectValue',p_filters) e
 join public.projects p on p.id=e.id::uuid
 join public.project_financial_summary f on f.id=p.id
 left join public.quotes q on q.id=p.quote_id
 cross join lateral public.project_reporting_details(array[p.id]) r;
 return v_report || jsonb_build_object('projects',v_projects);
end $$;
revoke all on function public.analytics_management_report(text,jsonb) from public,anon;
grant execute on function public.analytics_management_report(text,jsonb) to authenticated;
commit;
