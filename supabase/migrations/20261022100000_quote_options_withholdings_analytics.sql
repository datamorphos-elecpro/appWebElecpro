-- Aplicar después de 20261013101000 y antes de desplegar la aplicación.
-- Solo valores predeterminados para columnas nuevas; no se recalcula el historial.
begin;

alter table public.quotes
  add column show_aiu boolean not null default true,
  add column apply_direct_vat boolean not null default false,
  add column vat_direct_pct numeric(5,2) not null default 19 check (vat_direct_pct between 0 and 100),
  add column vat_direct_amount numeric(18,6) not null default 0 check (vat_direct_amount >= 0);

create table public.project_withholdings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  withholding_date date not null,
  kind text not null check (kind in ('income', 'vat', 'ica', 'other')),
  amount numeric(18,6) not null check (amount > 0),
  note text not null default '',
  request_id uuid not null unique,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  check (kind <> 'other' or btrim(note) <> ''),
  check ((voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and coalesce(length(btrim(void_reason)),0) > 0))
);
create index project_withholdings_project_date_idx on public.project_withholdings(project_id, withholding_date desc, id);
create trigger project_withholdings_audit after insert or update on public.project_withholdings
for each row execute function public.audit_row();
alter table public.project_withholdings enable row level security;
revoke all on public.project_withholdings from public, anon, authenticated;
grant select on public.project_withholdings to authenticated;
create policy project_withholdings_read on public.project_withholdings for select to authenticated
using ((select private.is_active_member()));
-- Escritura únicamente por RPC; ninguna política autoriza mutaciones directas.

-- Misma fila bloqueada por pagos, cambios del proyecto y retenciones.
create function private.lock_payment_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    perform 1 from public.projects where id in (old.project_id, new.project_id) order by id for update;
  elsif tg_op = 'DELETE' then
    perform 1 from public.projects where id = old.project_id for update;
    return old;
  else
    perform 1 from public.projects where id = new.project_id for update;
  end if;
  return new;
end $$;
revoke all on function private.lock_payment_project() from public, anon, authenticated;
create trigger project_payments_lock_project before insert or update or delete on public.project_payments
for each row execute function private.lock_payment_project();

create or replace view public.project_financial_summary with (security_invoker = true) as
select p.id, p.project_value,
  coalesce(pay.paid, 0)::numeric(18,6) as paid,
  greatest(0, p.project_value - coalesce(pay.paid, 0) - coalesce(w.withheld, 0))::numeric(18,6) as balance,
  coalesce(exp.expenses, 0)::numeric(18,6) as expenses,
  coalesce(bud.budget, 0)::numeric(18,6) as budget,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(exp.expenses, 0))::numeric(18,6) as real_profit,
  (case when p.profit_mode = 'value' then p.project_value else p.initial_profit end - coalesce(bud.budget, 0))::numeric(18,6) as projected_profit,
  coalesce(w.withheld, 0)::numeric(18,6) as withheld
from public.projects p
left join lateral (select sum(amount) paid from public.project_payments where project_id = p.id) pay on true
left join lateral (select sum(amount) expenses from public.project_expenses where project_id = p.id) exp on true
left join lateral (select sum(amount) budget from public.project_budgets where project_id = p.id) bud on true
left join lateral (select sum(amount) withheld from public.project_withholdings where project_id = p.id and voided_at is null) w on true;

create or replace view public.portfolio_financial_summary with (security_invoker = true) as
select coalesce(sum(project_value), 0)::numeric(18,6) as contracted,
  coalesce(sum(paid), 0)::numeric(18,6) as paid,
  coalesce(sum(balance), 0)::numeric(18,6) as balance,
  coalesce(sum(expenses), 0)::numeric(18,6) as expenses,
  coalesce(sum(budget), 0)::numeric(18,6) as budget,
  coalesce(sum(real_profit), 0)::numeric(18,6) as real_profit,
  coalesce(sum(projected_profit), 0)::numeric(18,6) as projected_profit,
  coalesce(sum(withheld), 0)::numeric(18,6) as withheld
from public.project_financial_summary;
revoke all on public.project_financial_summary, public.portfolio_financial_summary from public, anon;
grant select on public.project_financial_summary, public.portfolio_financial_summary to authenticated;

create function public.register_project_withholding(payload jsonb) returns public.project_withholdings
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (payload->>'project_id')::uuid;
  v_request uuid := (payload->>'request_id')::uuid;
  v_amount numeric;
  v_balance numeric;
  v_row public.project_withholdings%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if v_request is null then raise exception 'Identificador de solicitud requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request::text, 0));
  select * into v_row from public.project_withholdings where request_id = v_request;
  if found then
    if v_row.project_id <> v_project then raise exception 'Solicitud usada en otro proyecto'; end if;
    return v_row;
  end if;
  if coalesce(payload->>'amount', '') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then
    raise exception 'Use un importe positivo con máximo dos decimales';
  end if;
  v_amount := (payload->>'amount')::numeric;
  if v_amount <= 0 then raise exception 'El importe debe ser mayor que cero'; end if;
  perform 1 from public.projects where id = v_project for update;
  if not found then raise exception 'Proyecto no encontrado'; end if;
  select balance into v_balance from public.project_financial_summary where id = v_project;
  if v_amount > v_balance then raise exception 'La retención supera la cartera disponible: % COP', v_balance; end if;
  insert into public.project_withholdings(project_id, withholding_date, kind, amount, note, request_id, created_by, updated_by)
  values(v_project, (payload->>'withholding_date')::date, payload->>'kind', v_amount,
    btrim(coalesce(payload->>'note', '')), v_request, auth.uid(), auth.uid()) returning * into v_row;
  return v_row;
end $$;

create function public.void_project_withholding(p_id uuid, p_reason text) returns public.project_withholdings
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_row public.project_withholdings%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Indique el motivo de anulación'; end if;
  select project_id into v_project from public.project_withholdings where id = p_id;
  if not found then raise exception 'Retención no encontrada'; end if;
  perform 1 from public.projects where id = v_project for update;
  select * into v_row from public.project_withholdings where id = p_id for update;
  if v_row.voided_at is not null then return v_row; end if;
  update public.project_withholdings set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason),
    updated_at = now(), updated_by = auth.uid() where id = p_id returning * into v_row;
  return v_row;
end $$;
revoke all on function public.register_project_withholding(jsonb), public.void_project_withholding(uuid,text) from public, anon;
grant execute on function public.register_project_withholding(jsonb), public.void_project_withholding(uuid,text) to authenticated;

-- Lista completa de categorías históricas, sin el límite de filas de PostgREST.
create function public.expense_categories() returns table(category text)
language sql stable security invoker set search_path = '' as $$
  select min(btrim(e.category)) from public.project_expenses e
  where (select private.is_active_member()) and btrim(e.category) <> ''
  group by public.normalize_text(regexp_replace(btrim(e.category), '\s+', ' ', 'g')) order by 1;
$$;
revoke all on function public.expense_categories() from public, anon;
grant execute on function public.expense_categories() to authenticated;


create or replace function public.save_quote_calculated(payload jsonb) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_quote_id uuid := nullif(payload->>'id', '')::uuid;
  v_client_id uuid := (payload->>'client_id')::uuid;
  v_issued_on date := coalesce((payload->>'issued_on')::date, current_date);
  v_valid_until date := (payload->>'valid_until')::date;
  v_material_pct numeric := coalesce((payload->>'material_increase_pct')::numeric, 0);
  v_admin_pct numeric := coalesce((payload->>'administration_pct')::numeric, 0);
  v_contingency_pct numeric := coalesce((payload->>'contingency_pct')::numeric, 0);
  v_utility_pct numeric := coalesce((payload->>'utility_pct')::numeric, 0);
  v_vat_pct numeric := coalesce((payload->>'vat_utility_pct')::numeric, 0);
  v_show_aiu boolean := coalesce((payload->>'show_aiu')::boolean, true);
  v_apply_direct boolean := coalesce((payload->>'apply_direct_vat')::boolean, false);
  v_direct_pct_text text := replace(btrim(coalesce(payload->>'vat_direct_pct', '19')), ',', '.');
  v_direct_pct numeric;
  v_direct_vat numeric;
  v_direct numeric := 0;
  v_admin numeric;
  v_contingency numeric;
  v_utility numeric;
  v_vat numeric;
  v_item jsonb;
  v_position integer := 0;
  v_final_price numeric;
  v_base_total numeric;
  v_final_total numeric;
  v_category public.catalog_category;
  v_item_vat_text text;
  v_item_vat numeric;
  v_cost_price numeric;
  v_cost_total numeric;
begin
  if not (select private.is_active_member()) then
    raise exception 'No autorizado';
  end if;

  if v_direct_pct_text = '' then v_direct_pct_text := '0'; end if;
  if v_direct_pct_text !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' then
    raise exception 'Ingrese un IVA sobre costo directo entre 0 y 100 %%, con máximo dos decimales';
  end if;
  v_direct_pct := v_direct_pct_text::numeric;
  if v_direct_pct not between 0 and 100 then
    raise exception 'Ingrese un IVA sobre costo directo entre 0 y 100 %%, con máximo dos decimales';
  end if;
  if v_client_id is null or not exists (
    select 1 from public.clients as c where c.id = v_client_id and c.is_active
  ) then
    raise exception 'Cliente activo requerido';
  end if;
  if v_valid_until is null or v_valid_until < v_issued_on then
    raise exception 'La vigencia debe ser posterior a la emisión';
  end if;
  if least(v_material_pct, v_admin_pct, v_contingency_pct, v_utility_pct, v_vat_pct) < 0 then
    raise exception 'Los porcentajes no pueden ser negativos';
  end if;
  if jsonb_typeof(coalesce(payload->'items', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(payload->'items') = 0 then
    raise exception 'Agregue al menos un ítem';
  end if;

  if v_quote_id is null then
    insert into public.quotes as quotes_row (
      number, client_id, status, issued_on, valid_until, title, greeting,
      project_description, objective, notes, scope, benefits, exclusions,
      payment_terms, execution_time, deliverable, material_increase_pct,
      administration_pct, contingency_pct, utility_pct, vat_utility_pct,
      created_by, updated_by
    ) values (
      public.next_quote_number(extract(year from v_issued_on)::integer),
      v_client_id, coalesce((payload->>'status')::public.quote_status, 'draft'),
      v_issued_on, v_valid_until, coalesce(payload->>'title', ''),
      coalesce(payload->>'greeting', ''), coalesce(payload->>'project_description', ''),
      coalesce(payload->>'objective', ''), coalesce(payload->>'notes', ''),
      coalesce(payload->>'scope', ''), coalesce(payload->>'benefits', ''),
      coalesce(payload->>'exclusions', ''), coalesce(payload->>'payment_terms', ''),
      coalesce(payload->>'execution_time', ''), coalesce(payload->>'deliverable', ''),
      v_material_pct, v_admin_pct, v_contingency_pct, v_utility_pct, v_vat_pct,
      (select auth.uid()), (select auth.uid())
    ) returning quotes_row.* into v_quote;
  else
    select q.* into v_quote
    from public.quotes as q
    where q.id = v_quote_id
    for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    if v_quote.project_id is not null then
      raise exception 'La cotización ya fue convertida y no se puede editar';
    end if;

    update public.quotes as q set
      client_id = v_client_id,
      status = coalesce((payload->>'status')::public.quote_status, q.status),
      issued_on = v_issued_on,
      valid_until = v_valid_until,
      title = coalesce(payload->>'title', ''),
      greeting = coalesce(payload->>'greeting', ''),
      project_description = coalesce(payload->>'project_description', ''),
      objective = coalesce(payload->>'objective', ''),
      notes = coalesce(payload->>'notes', ''),
      scope = coalesce(payload->>'scope', ''),
      benefits = coalesce(payload->>'benefits', ''),
      exclusions = coalesce(payload->>'exclusions', ''),
      payment_terms = coalesce(payload->>'payment_terms', ''),
      execution_time = coalesce(payload->>'execution_time', ''),
      deliverable = coalesce(payload->>'deliverable', ''),
      material_increase_pct = v_material_pct,
      administration_pct = v_admin_pct,
      contingency_pct = v_contingency_pct,
      utility_pct = v_utility_pct,
      vat_utility_pct = v_vat_pct,
      updated_by = (select auth.uid())
    where q.id = v_quote.id
    returning q.* into v_quote;

    delete from public.quote_items as qi where qi.quote_id = v_quote.id;
  end if;

  for v_item in select entry.value from jsonb_array_elements(payload->'items') as entry(value) loop
    v_position := v_position + 1;
    v_category := (v_item->>'category')::public.catalog_category;
    if v_category is null then raise exception 'La categoría es obligatoria'; end if;
    if coalesce((v_item->>'quantity')::numeric, 0) < 0
       or coalesce((v_item->>'base_unit_price')::numeric, 0) < 0 then
      raise exception 'Cantidad y precio deben ser positivos';
    end if;

    v_item_vat_text := replace(btrim(coalesce(v_item->>'vat_pct', '')), ',', '.');
    if v_item_vat_text = '' then v_item_vat_text := '0'; end if;
    if v_item_vat_text !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' then
      raise exception 'Ingrese un IVA entre 0 y 100 %%, con máximo dos decimales. Dejar vacío equivale a 0 %%.';
    end if;
    v_item_vat := v_item_vat_text::numeric;
    if v_item_vat not between 0 and 100 then
      raise exception 'Ingrese un IVA entre 0 y 100 %%, con máximo dos decimales. Dejar vacío equivale a 0 %%.';
    end if;
    v_cost_price := coalesce((v_item->>'base_unit_price')::numeric, 0) * (1 + v_item_vat / 100);
    v_cost_total := coalesce((v_item->>'quantity')::numeric, 0) * v_cost_price;

    v_base_total := coalesce((v_item->>'quantity')::numeric, 0)
      * coalesce((v_item->>'base_unit_price')::numeric, 0);
    v_final_price := v_cost_price
      * case when v_category = 'material' then 1 + v_material_pct / 100 else 1 end;
    v_final_total := coalesce((v_item->>'quantity')::numeric, 0) * v_final_price;

    insert into public.quote_items as item_row (
      quote_id, position, catalog_item_id, code, description, category,
      quantity, unit, base_unit_price, final_unit_price, base_total, final_total, vat_pct, cost_total,
      created_by, updated_by
    ) values (
      v_quote.id, v_position, nullif(v_item->>'catalog_item_id', '')::uuid,
      coalesce(v_item->>'code', ''), coalesce(v_item->>'description', ''),
      v_category, coalesce((v_item->>'quantity')::numeric, 0),
      coalesce(v_item->>'unit', ''), coalesce((v_item->>'base_unit_price')::numeric, 0),
      v_final_price, v_base_total, v_final_total, v_item_vat, v_cost_total, (select auth.uid()), (select auth.uid())
    );
    v_direct := v_direct + v_final_total;
  end loop;

  v_admin := v_direct * v_admin_pct / 100;
  v_contingency := v_direct * v_contingency_pct / 100;
  v_utility := v_direct * v_utility_pct / 100;
  v_vat := v_utility * v_vat_pct / 100;

  v_direct_vat := case when v_apply_direct then v_direct * v_direct_pct / 100 else 0 end;
  update public.quotes as q set
    show_aiu = v_show_aiu,
    apply_direct_vat = v_apply_direct,
    vat_direct_pct = v_direct_pct,
    vat_direct_amount = v_direct_vat,
    direct_cost = v_direct,
    administration_amount = v_admin,
    contingency_amount = v_contingency,
    utility_amount = v_utility,
    vat_utility_amount = v_vat,
    total_amount = v_direct + v_admin + v_contingency + v_utility + v_vat + v_direct_vat,
    updated_by = (select auth.uid())
  where q.id = v_quote.id
  returning q.* into v_quote;

  return v_quote;
end $$;
revoke all on function public.save_quote_calculated(jsonb) from public, anon, authenticated;

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

-- Una lectura y una instantánea para registros, total y fórmula de cada tarjeta.
create function public.analytics_metric_detail(
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
      f.real_profit, f.projected_profit, p.client_id
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
        'expenses',p.expenses::text,'budget',p.budget::text) data
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

-- El detalle financiero conserva la firma y añade retenciones al contrato JSON.
create function public.analytics_management_detail_page(
  p_clients uuid[] default null, p_projects uuid[] default null, p_statuses text[] default null,
  p_offset integer default 0, p_limit integer default 20
) returns table(id uuid,title text,quote_number text,status text,project_value text,paid text,balance text,
  budget text,expenses text,real_profit text,projected_profit text,withheld text,total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.title,p.quote_number,p.status::text,p.project_value::text,f.paid::text,f.balance::text,
    f.budget::text,f.expenses::text,f.real_profit::text,f.projected_profit::text,f.withheld::text,count(*) over()
  from public.projects p join public.project_financial_summary f on f.id=p.id
  where (select private.is_active_member())
    and (coalesce(cardinality(p_clients),0)=0 or p.client_id=any(p_clients))
    and (coalesce(cardinality(p_projects),0)=0 or p.id=any(p_projects))
    and (coalesce(cardinality(p_statuses),0)=0 or p.status::text=any(p_statuses))
  order by p.created_at desc,p.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.analytics_management_detail_page(uuid[],uuid[],text[],integer,integer) from public, anon;
grant execute on function public.analytics_management_detail_page(uuid[],uuid[],text[],integer,integer) to authenticated;

create or replace function public.dashboard_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
  with financial as (select * from public.portfolio_financial_summary where (select private.is_active_member())),
  projects as (select p.*, f.paid, f.real_profit, f.withheld, f.balance from public.projects p join public.project_financial_summary f on f.id = p.id where (select private.is_active_member())),
  alerts as (select p.id project_id, p.title, p.expected_end_date, p.project_value, p.paid, p.balance, p.withheld, kind from projects p join public.project_financial_summary f on f.id=p.id cross join lateral unnest(array_remove(array[
    case when p.status not in ('draft','quoted','cancelled') and coalesce(p.actual_end_date,(now() at time zone 'America/Bogota')::date)>p.expected_end_date then 'retraso' end,
    case when f.budget>0 and f.expenses>f.budget then 'sobrecosto' end,
    case when p.status not in ('draft','cancelled') and f.balance>0 then 'cartera' end,
    case when p.status in ('approved','in_progress','paused') and p.expected_end_date between (now() at time zone 'America/Bogota')::date and ((now() at time zone 'America/Bogota')::date+15) then 'finalizacion_proxima' end],null)) kind)
  select jsonb_build_object('financial',(select to_jsonb(financial) from financial),'project_total',(select count(*) from projects),'active_total',(select count(*) from projects where status in ('approved','in_progress','paused')),'delayed_total',(select count(*) from alerts where kind='retraso'),'soon_total',(select count(*) from alerts where kind='finalizacion_proxima'),'alert_total',(select count(*) from alerts),'recent_projects',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,quote_number,status,responsible,project_value,paid,real_profit from projects order by created_at desc,id desc limit 4)x),'[]'::jsonb),'priority_alerts',coalesce((select jsonb_agg(to_jsonb(x)) from (select ('00000000-0000-0000-0000-'||substr(md5(project_id::text||':'||kind),1,12))::uuid id,project_id,title,kind,expected_end_date,project_value,paid,balance,withheld from alerts order by case kind when 'retraso' then 1 when 'sobrecosto' then 2 when 'cartera' then 3 else 4 end,expected_end_date,project_id limit 3)x),'[]'::jsonb));
$$;

notify pgrst, 'reload schema';
commit;
