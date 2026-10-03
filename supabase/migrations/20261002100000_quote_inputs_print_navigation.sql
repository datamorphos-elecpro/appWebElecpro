-- Aplicar antes de desplegar la interfaz de segmentos y orden por creación.
begin;

create function private.normalize_item_unit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'quote_items' then
    if exists (select 1 from public.quotes q where q.id = new.quote_id and q.project_id is not null) then
      raise exception 'La cotización ya fue convertida y no se puede editar';
    end if;
  end if;
  new.unit := upper(btrim(new.unit));
  if new.unit = '' then raise exception 'La unidad es obligatoria'; end if;
  return new;
end $$;
revoke all on function private.normalize_item_unit() from public, anon, authenticated;
create trigger catalog_items_normalize_unit before insert or update on public.catalog_items
for each row execute function private.normalize_item_unit();
create trigger quote_items_normalize_unit before insert or update on public.quote_items
for each row execute function private.normalize_item_unit();

create index quotes_created_at_id_idx on public.quotes(created_at desc, id desc);

-- Sustituir la firma evita sobrecargas ambiguas en PostgREST. Los seis
-- argumentos anteriores siguen siendo válidos por el valor predeterminado.
drop function public.quotes_page(text,text,text,text,integer,integer);
create function public.quotes_page(
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
      case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'America/Bogota')::date
        then 'expired' else q.status::text end as visible_status,
      q.total_amount::text,q.project_id,
      (select count(*) from public.quote_items qi where qi.quote_id=q.id) as item_count
    from public.quotes q join public.clients c on c.id=q.client_id
    where (select private.is_active_member())
      and (p_q is null or public.normalize_text(q.number || ' ' || q.title || ' ' || c.name)
        like '%' || public.normalize_text(p_q) || '%')
  ), filtered as (
    select * from rows where (p_status is null or visible_status=p_status)
      and (p_segment is null
        or p_segment='valid' and visible_status in ('draft','sent')
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
revoke all on function public.quotes_page(text,text,text,text,integer,integer,text) from public, anon;
grant execute on function public.quotes_page(text,text,text,text,integer,integer,text) to authenticated;

-- Retorna un sobre con total y página incluso si no hay resultados.
create function public.projects_list_page(
  p_q text default null, p_status text default null, p_sort text default 'created_at',
  p_direction text default 'desc', p_offset integer default 0, p_limit integer default 20,
  p_segment text default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with filtered as (
    select p.*, jsonb_build_object('name',c.name,'contact_name',c.contact_name,'address',c.address) as clients,
      jsonb_build_object('id',f.id,'project_value',f.project_value::text,'paid',f.paid::text,
        'balance',f.balance::text,'expenses',f.expenses::text,'budget',f.budget::text,
        'real_profit',f.real_profit::text,'projected_profit',f.projected_profit::text) as "financialSummary"
    from public.projects p join public.clients c on c.id=p.client_id
    join public.project_financial_summary f on f.id=p.id
    where (select private.is_active_member())
      and (p_q is null or public.normalize_text(p.title || ' ' || p.quote_number)
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
revoke all on function public.projects_list_page(text,text,text,text,integer,integer,text) from public, anon;
grant execute on function public.projects_list_page(text,text,text,text,integer,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
