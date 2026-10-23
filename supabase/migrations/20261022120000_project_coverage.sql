-- Extend the dashboard without changing payment semantics or historical records.
begin;

create or replace function public.dashboard_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
  with financial as (select * from public.portfolio_financial_summary where (select private.is_active_member())),
  projects as (select p.*, f.paid, f.real_profit, f.withheld, f.balance from public.projects p join public.project_financial_summary f on f.id = p.id where (select private.is_active_member())),
  alerts as (select p.id project_id, p.title, p.expected_end_date, p.project_value, p.paid, p.balance, p.withheld, kind from projects p join public.project_financial_summary f on f.id=p.id cross join lateral unnest(array_remove(array[
    case when p.status not in ('draft','quoted','cancelled') and coalesce(p.actual_end_date,(now() at time zone 'America/Bogota')::date)>p.expected_end_date then 'retraso' end,
    case when f.budget>0 and f.expenses>f.budget then 'sobrecosto' end,
    case when p.status not in ('draft','cancelled') and f.balance>0 then 'cartera' end,
    case when p.status in ('approved','in_progress','paused') and p.expected_end_date between (now() at time zone 'America/Bogota')::date and ((now() at time zone 'America/Bogota')::date+15) then 'finalizacion_proxima' end],null)) kind)
  select jsonb_build_object('financial',(select to_jsonb(financial) from financial),'project_total',(select count(*) from projects),'active_total',(select count(*) from projects where status in ('approved','in_progress','paused')),'delayed_total',(select count(*) from alerts where kind='retraso'),'soon_total',(select count(*) from alerts where kind='finalizacion_proxima'),'alert_total',(select count(*) from alerts),'recent_projects',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,quote_number,status,responsible,project_value,paid,withheld,real_profit from projects order by created_at desc,id desc limit 4)x),'[]'::jsonb),'priority_alerts',coalesce((select jsonb_agg(to_jsonb(x)) from (select ('00000000-0000-0000-0000-'||substr(md5(project_id::text||':'||kind),1,12))::uuid id,project_id,title,kind,expected_end_date,project_value,paid,balance,withheld from alerts order by case kind when 'retraso' then 1 when 'sobrecosto' then 2 when 'cartera' then 3 else 4 end,expected_end_date,project_id limit 3)x),'[]'::jsonb));
$$;

revoke all on function public.dashboard_snapshot() from public, anon;
grant execute on function public.dashboard_snapshot() to authenticated;
notify pgrst, 'reload schema';
commit;
