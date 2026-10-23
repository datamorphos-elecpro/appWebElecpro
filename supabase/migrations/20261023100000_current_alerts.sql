begin;
-- Compare numeric values before serializing decimal strings for the UI.
create view public.project_active_alerts with (security_invoker = true) as
select ('00000000-0000-0000-0000-'||substr(md5(p.id::text||':'||kind),1,12))::uuid id,
p.id project_id,p.title,p.quote_number,c.name client_name,p.status,p.expected_end_date,
p.project_value::text project_value,f.paid::text paid,f.withheld::text withheld,f.balance::text balance,f.budget::text budget,f.expenses::text expenses,
(now() at time zone 'America/Bogota')::date consulted_on, now() consulted_at,kind
from public.projects p join public.clients c on c.id=p.client_id
join public.project_financial_summary f on f.id=p.id
cross join lateral unnest(array_remove(array[
case when p.status in ('approved','in_progress','paused') and p.expected_end_date < (now() at time zone 'America/Bogota')::date then 'retraso' end,
case when p.status not in ('finished','cancelled') and f.budget>0 and f.expenses>f.budget then 'sobrecosto' end,
case when p.status not in ('draft','cancelled') and f.balance>0 then 'cartera' end,
case when p.status in ('approved','in_progress','paused') and p.expected_end_date between (now() at time zone 'America/Bogota')::date and (now() at time zone 'America/Bogota')::date+15 then 'finalizacion_proxima' end],null)) kind
where (select private.is_active_member());
revoke all on public.project_active_alerts from public,anon,authenticated;
grant select on public.project_active_alerts to authenticated;
create function public.alerts_page_v2(p_q text default null,p_kind text default null,p_page integer default 1,p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
with filtered as (select * from public.project_active_alerts where (p_kind is null or kind=p_kind) and (p_q is null or public.normalize_text(quote_number||' '||client_name||' '||title) like '%'||public.normalize_text(p_q)||'%')),
meta as (select count(*) total,least(greatest(p_page,1),greatest(1,ceil(count(*)::numeric/least(greatest(p_limit,1),100))::integer)) page from filtered),
records as (select * from filtered order by case kind when 'retraso' then 1 when 'sobrecosto' then 2 when 'cartera' then 3 else 4 end,expected_end_date,project_id offset ((select page from meta)-1)*least(greatest(p_limit,1),100) limit least(greatest(p_limit,1),100))
select jsonb_build_object('records',coalesce((select jsonb_agg(to_jsonb(records)) from records),'[]'::jsonb),'total',total,'page',page,'consulted_at',now()) from meta;
$$;
revoke all on function public.alerts_page_v2(text,text,integer,integer) from public,anon;
grant execute on function public.alerts_page_v2(text,text,integer,integer) to authenticated;
create or replace function public.dashboard_snapshot() returns jsonb language sql stable security invoker set search_path = '' as $$
  with financial as (select contracted::text contracted,paid::text paid,withheld::text withheld,balance::text balance,expenses::text expenses,budget::text budget,real_profit::text real_profit,projected_profit::text projected_profit,paid_distributions::text paid_distributions from public.portfolio_financial_summary where (select private.is_active_member())),
  projects as (select p.*, f.paid, f.real_profit, f.withheld, f.balance from public.projects p join public.project_financial_summary f on f.id = p.id where (select private.is_active_member())),
  alerts as (select * from public.project_active_alerts)
  select jsonb_build_object('consulted_at',now(),'financial',(select to_jsonb(financial) from financial),'project_total',(select count(*) from projects),'active_total',(select count(*) from projects where status in ('approved','in_progress','paused')),'delayed_total',(select count(*) from alerts where kind='retraso'),'soon_total',(select count(*) from alerts where kind='finalizacion_proxima'),'alert_total',(select count(*) from alerts),'recent_projects',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,quote_number,status,responsible,project_value::text project_value,paid::text paid,withheld::text withheld,real_profit::text real_profit from projects order by created_at desc,id desc limit 4)x),'[]'::jsonb),'priority_alerts',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from alerts order by case kind when 'retraso' then 1 when 'sobrecosto' then 2 when 'cartera' then 3 else 4 end,expected_end_date,project_id limit 3)x),'[]'::jsonb));
$$;

create or replace function public.alerts_page(p_q text default null,p_kind text default null,p_offset integer default 0,p_limit integer default 20) returns table(id uuid,project_id uuid,title text,kind text,expected_end_date date,project_value numeric,paid numeric,total_count bigint) language sql stable security invoker set search_path = '' as $$
  select id,project_id,title,kind,expected_end_date,project_value::numeric,paid::numeric,count(*) over() from public.project_active_alerts
where (p_kind is null or kind=p_kind) and (p_q is null or public.normalize_text(quote_number||' '||client_name||' '||title) like '%'||public.normalize_text(p_q)||'%')
order by case kind when 'retraso' then 1 when 'sobrecosto' then 2 when 'cartera' then 3 else 4 end,expected_end_date,project_id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.dashboard_snapshot(), public.alerts_page(text,text,integer,integer) from public, anon;
grant execute on function public.dashboard_snapshot(), public.alerts_page(text,text,integer,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
