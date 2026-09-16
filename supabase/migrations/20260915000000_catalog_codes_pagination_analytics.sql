-- Fase 3: categorías ampliadas y códigos automáticos de catálogo.
-- Aditiva: conserva códigos e importes históricos y no reescribe cotizaciones ni presupuestos.

begin;

create table if not exists public.catalog_code_counters (
  category public.catalog_category primary key,
  prefix text not null unique,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

insert into public.catalog_code_counters(category, prefix, last_value)
values ('material', 'MAT', 0), ('design', 'DIS', 0), ('technical_visit', 'VIS', 0), ('labor', 'MO', 0)
on conflict (category) do nothing;

with existing as (
  select category, max((regexp_match(upper(code), '^(MAT|DIS|VIS|MO)-([0-9]+)$'))[2]::bigint) as last_value
  from public.catalog_items
  where upper(code) ~ '^(MAT|DIS|VIS|MO)-[0-9]+$'
  group by category
)
update public.catalog_code_counters counter
set last_value = greatest(counter.last_value, existing.last_value), updated_at = now()
from existing
where existing.category = counter.category;

create or replace function public.next_catalog_code(p_category public.catalog_category) returns text
language plpgsql security definer set search_path = '' as $$
declare row_value public.catalog_code_counters%rowtype;
begin
  if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
  select * into row_value from public.catalog_code_counters where category = p_category for update;
  if not found then raise exception 'Categoría de catálogo no configurada'; end if;
  update public.catalog_code_counters
  set last_value = last_value + 1, updated_at = now()
  where category = p_category
  returning * into row_value;
  return row_value.prefix || '-' || lpad(row_value.last_value::text, 4, '0');
end $$;

create or replace function public.assign_catalog_item_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and nullif(trim(new.code), '') is null then
    new.code := public.next_catalog_code(new.category);
  end if;
  if tg_op = 'UPDATE' then
    new.code := old.code;
  end if;
  return new;
end $$;

drop trigger if exists trg_catalog_items_assign_code on public.catalog_items;
create trigger trg_catalog_items_assign_code
before insert or update of code, category on public.catalog_items
for each row execute function public.assign_catalog_item_code();

create index if not exists idx_catalog_items_category_active on public.catalog_items(category, is_active, code);
create index if not exists idx_projects_finance_order on public.projects(id, created_at);
create index if not exists idx_project_expenses_project_category on public.project_expenses(project_id, category);
create index if not exists idx_project_budgets_project_category on public.project_budgets(project_id, category);

revoke all on table public.catalog_code_counters from public, anon, authenticated;
revoke all on function public.next_catalog_code(public.catalog_category) from public, anon, authenticated;
revoke all on function public.assign_catalog_item_code() from public, anon, authenticated;
grant select on public.catalog_code_counters to authenticated;

alter table public.catalog_code_counters enable row level security;
drop policy if exists catalog_code_counters_select on public.catalog_code_counters;
create policy catalog_code_counters_select on public.catalog_code_counters for select using ((select private.is_active_member()));

commit;
