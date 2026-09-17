-- Fase 6: paneles de cotizaciones y proyectos sin descargar colecciones.
begin;

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
    select status::text as status, count(*) as quantity, coalesce(sum(project_value), 0) as total,
      coalesce(avg(project_value), 0) as average
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
        'contracted_value', (select coalesce(sum(project_value),0)::text from project_rows),
        'active_count', (select count(*) from project_rows where status in ('approved','in_progress','paused')),
        'active_value', (select coalesce(sum(project_value) filter(where status in ('approved','in_progress','paused')),0)::text from project_rows),
        'consolidated_profit', (select coalesce(sum(real_profit),0)::text from project_rows)
      ),
      'by_status', coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',quantity,'total',total::text,'average',average::text,'share',case when (select count(*) from project_rows)=0 then '0' else round(100 * quantity::numeric / (select count(*) from project_rows),2)::text end) order by status) from project_status), '[]'::jsonb)
    )
  );
$$;

create or replace function public.quotes_page(p_q text default null, p_status text default null, p_sort text default 'issued_on', p_direction text default 'desc', p_offset integer default 0, p_limit integer default 20)
returns table(id uuid, number text, title text, client_name text, client_contact text, issued_on date, valid_until date, status text, visible_status text, total_amount text, project_id uuid, item_count bigint, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with rows as (
    select q.id,q.number,q.title,c.name as client_name,c.contact_name as client_contact,q.issued_on,q.valid_until,q.status::text,
      case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date then 'expired' else q.status::text end as visible_status,
      q.total_amount::text,q.project_id,
      (select count(*) from public.quote_items qi where qi.quote_id=q.id) as item_count
    from public.quotes q join public.clients c on c.id=q.client_id
    where (select private.is_active_member())
      and (p_q is null or public.normalize_text(q.number || ' ' || q.title || ' ' || c.name) like '%' || public.normalize_text(p_q) || '%')
  ), filtered as (select * from rows where p_status is null or visible_status=p_status)
  select *, count(*) over() from filtered
  order by
    case when p_sort='number' and p_direction='asc' then number end asc,
    case when p_sort='number' and p_direction='desc' then number end desc,
    case when p_sort='title' and p_direction='asc' then title end asc,
    case when p_sort='title' and p_direction='desc' then title end desc,
    case when p_sort='total_amount' and p_direction='asc' then total_amount::numeric end asc,
    case when p_sort='total_amount' and p_direction='desc' then total_amount::numeric end desc,
    case when p_sort not in ('number','title','total_amount') and p_direction='asc' then issued_on end asc,
    case when p_sort not in ('number','title','total_amount') and p_direction='desc' then issued_on end desc,
    id desc
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

revoke all on function public.quote_project_dashboard_snapshot(), public.quotes_page(text,text,text,text,integer,integer) from public, anon;
grant execute on function public.quote_project_dashboard_snapshot(), public.quotes_page(text,text,text,text,integer,integer) to authenticated;
commit;
