-- Elecpro: esquema inicial. Ejecutar una sola vez sobre una base vacía.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

create type public.app_role as enum ('administrator', 'management');
create type public.catalog_category as enum ('material', 'labor');
create type public.quote_status as enum ('draft', 'sent', 'approved', 'rejected');
create type public.project_status as enum ('draft', 'quoted', 'approved', 'in_progress', 'paused', 'finished', 'cancelled');
create type public.project_priority as enum ('low', 'medium', 'high', 'critical');
create type public.profit_mode as enum ('value', 'manual');
create type public.budget_source as enum ('manual', 'quote_snapshot');
create type public.share_mode as enum ('percent', 'fixed');
create type public.share_basis as enum ('project_value', 'real_profit', 'portfolio_profit');
create type public.audit_action as enum ('insert', 'update', 'deactivate', 'convert_quote', 'invite_user', 'change_role', 'disable_user');

create function public.normalize_text(value text) returns text language sql immutable strict
set search_path = '' as $$ select extensions.unaccent(lower(value)) $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', role public.app_role not null default 'management',
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.company_settings (
  id boolean primary key default true check (id), legal_name text not null default 'Elecpro Ingeniería Eléctrica',
  manager_name text not null default '', manager_role text not null default '', professional_card text,
  phone text, email text, address text, timezone text not null default 'America/Bogota', currency_code text not null default 'COP',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  check (timezone = 'America/Bogota'), check (currency_code = 'COP')
);
create table public.document_counters (key text primary key, last_value bigint not null default 0 check (last_value >= 0));

create table public.clients (
 id uuid primary key default extensions.gen_random_uuid(), name text not null, client_type text not null default 'Empresa', contact_name text, phone text, email text, address text,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
create table public.suppliers (
 id uuid primary key default extensions.gen_random_uuid(), name text not null, phone text, email text, website text, description text,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
create table public.catalog_items (
 id uuid primary key default extensions.gen_random_uuid(), code text not null, description text not null, unit text not null,
 base_unit_price numeric(14,2) not null check (base_unit_price >= 0), category public.catalog_category not null,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
create table public.quotes (
 id uuid primary key default extensions.gen_random_uuid(), number text not null unique, client_id uuid not null references public.clients(id),
 status public.quote_status not null default 'draft', issued_on date not null, valid_until date not null check (valid_until >= issued_on), title text not null,
 greeting text not null default '', project_description text not null default '', objective text not null default '', notes text not null default '', scope text not null default '', benefits text not null default '', exclusions text not null default '', payment_terms text not null default '', execution_time text not null default '', deliverable text not null default '',
 material_increase_pct numeric(7,2) not null default 0 check (material_increase_pct >= 0), administration_pct numeric(7,2) not null default 0 check (administration_pct >= 0), contingency_pct numeric(7,2) not null default 0 check (contingency_pct >= 0), utility_pct numeric(7,2) not null default 0 check (utility_pct >= 0), vat_utility_pct numeric(7,2) not null default 0 check (vat_utility_pct >= 0),
 direct_cost numeric(14,2) not null default 0, administration_amount numeric(14,2) not null default 0, contingency_amount numeric(14,2) not null default 0, utility_amount numeric(14,2) not null default 0, vat_utility_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0,
 project_id uuid unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
create table public.quote_items (
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid not null references public.quotes(id) on delete cascade, position integer not null check (position > 0), catalog_item_id uuid references public.catalog_items(id) on delete set null,
 code text not null default '', description text not null, category public.catalog_category not null, quantity numeric(14,2) not null check (quantity >= 0), unit text not null,
 base_unit_price numeric(14,2) not null check (base_unit_price >= 0), final_unit_price numeric(14,2) not null check (final_unit_price >= 0), base_total numeric(14,2) not null check (base_total >= 0), final_total numeric(14,2) not null check (final_total >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id), unique (quote_id, position)
);
create table public.projects (
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid unique references public.quotes(id), quote_number text not null, client_id uuid not null references public.clients(id), title text not null,
 project_value numeric(14,2) not null check (project_value >= 0), status public.project_status not null default 'approved', responsible text not null default '', location text not null default '', priority public.project_priority not null default 'medium',
 start_date date not null, expected_end_date date not null check (expected_end_date >= start_date), actual_end_date date check (actual_end_date is null or actual_end_date >= start_date), observations text not null default '', profit_mode public.profit_mode not null default 'value', initial_profit numeric(14,2) not null default 0 check (initial_profit >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id)
);
alter table public.quotes add constraint quotes_project_id_fkey foreign key (project_id) references public.projects(id);
create table public.project_payments (id uuid primary key default extensions.gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict, payment_date date not null, amount numeric(14,2) not null check (amount > 0), payment_method text not null, note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id));
create table public.project_expenses (id uuid primary key default extensions.gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict, expense_date date not null, category text not null, amount numeric(14,2) not null check (amount > 0), payment_method text not null, note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id));
create table public.project_budgets (id uuid primary key default extensions.gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict, source public.budget_source not null default 'manual', position integer, category text not null, note text not null default '', quantity numeric(14,2), base_unit_price numeric(14,2), final_unit_price numeric(14,2), base_total numeric(14,2), final_total numeric(14,2), amount numeric(14,2) not null check (amount >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id));
create table public.project_shares (id uuid primary key default extensions.gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict, participant text not null, mode public.share_mode not null, value numeric(14,2) not null check (value >= 0), basis public.share_basis not null check (basis in ('project_value','real_profit')), is_paid boolean not null default false, paid_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id), check (paid_on is null or is_paid));
create table public.portfolio_shares (id uuid primary key default extensions.gen_random_uuid(), participant text not null, mode public.share_mode not null, value numeric(14,2) not null check (value >= 0), basis public.share_basis not null default 'portfolio_profit' check (basis = 'portfolio_profit'), is_paid boolean not null default false, paid_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id), check (paid_on is null or is_paid));
create table public.audit_log (id bigserial primary key, occurred_at timestamptz not null default now(), actor_id uuid references public.profiles(id) on delete set null, entity_type text not null, entity_id uuid, action public.audit_action not null, before_data jsonb, after_data jsonb, request_id uuid);

create index clients_name_idx on public.clients (public.normalize_text(name)); create index clients_active_idx on public.clients (is_active) where is_active;
create index suppliers_name_idx on public.suppliers (public.normalize_text(name)); create index suppliers_active_idx on public.suppliers (is_active) where is_active;
create unique index catalog_items_code_normalized_key on public.catalog_items (public.normalize_text(code)); create index catalog_items_search_idx on public.catalog_items (public.normalize_text(code), public.normalize_text(description));
create index quotes_client_issued_idx on public.quotes (client_id, issued_on desc); create index quotes_status_validity_idx on public.quotes (status, valid_until); create index quote_items_quote_position_idx on public.quote_items (quote_id, position);
create index projects_client_idx on public.projects (client_id); create index projects_status_end_idx on public.projects (status, expected_end_date); create index projects_responsible_status_idx on public.projects (responsible, status); create index project_payments_project_date_idx on public.project_payments (project_id, payment_date desc); create index project_expenses_project_date_idx on public.project_expenses (project_id, expense_date desc); create index project_budgets_project_position_idx on public.project_budgets (project_id, position); create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc); create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

create function private.current_profile() returns public.profiles language sql stable security definer set search_path = '' as $$ select p from public.profiles p where p.id = (select auth.uid()) and p.is_active $$;
create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and is_active) $$;
create function private.is_administrator() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and is_active and role = 'administrator') $$;
create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if; return new; end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$ begin insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity_id uuid;
begin
  -- Las filas sin id UUID (company_settings) conservan la instantánea en JSONB
  -- y usan NULL en la columna UUID de auditoría.
  v_entity_id := case
    when (to_jsonb(new)->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (to_jsonb(new)->>'id')::uuid
    else null
  end;

  if tg_op = 'INSERT' then
    insert into public.audit_log(actor_id, entity_type, entity_id, action, after_data)
    values ((select auth.uid()), tg_table_name, v_entity_id, 'insert', to_jsonb(new));
    return new;
  end if;

  insert into public.audit_log(actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    (select auth.uid()), tg_table_name, v_entity_id,
    case when to_jsonb(old)->>'is_active' = 'true' and to_jsonb(new)->>'is_active' = 'false'
      then 'deactivate'::public.audit_action else 'update'::public.audit_action end,
    to_jsonb(old), to_jsonb(new)
  );
  return new;
end $$;
create function public.next_quote_number(p_year integer default extract(year from current_date)::integer) returns text language plpgsql security definer set search_path = '' as $$ declare v bigint; begin if not (select private.is_active_member()) then raise exception 'No autorizado'; end if; update public.document_counters set last_value = last_value + 1 where key = 'quote' returning last_value into v; if not found then raise exception 'Contador de cotizaciones no configurado'; end if; return format('COT-%s-%s', p_year, lpad(v::text,4,'0')); end $$;

create function public.save_quote(payload jsonb) returns public.quotes language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; quote_id uuid := nullif(payload->>'id','')::uuid; client uuid := (payload->>'client_id')::uuid; issued date := coalesce((payload->>'issued_on')::date, current_date); valid date := (payload->>'valid_until')::date; material_pct numeric := coalesce((payload->>'material_increase_pct')::numeric,0); admin_pct numeric := coalesce((payload->>'administration_pct')::numeric,0); contingency_pct numeric := coalesce((payload->>'contingency_pct')::numeric,0); utility_pct numeric := coalesce((payload->>'utility_pct')::numeric,0); vat_pct numeric := coalesce((payload->>'vat_utility_pct')::numeric,0); direct numeric := 0; admin numeric; contingency numeric; utility numeric; vat numeric; item jsonb; pos integer := 0; final_price numeric; base_total numeric; final_total numeric; category public.catalog_category;
begin
 if not (select private.is_active_member()) then raise exception 'No autorizado'; end if;
 if client is null or not exists (select 1 from public.clients where id=client and is_active) then raise exception 'Cliente activo requerido'; end if;
 if valid is null or valid < issued then raise exception 'La vigencia debe ser posterior a la emisión'; end if;
 if least(material_pct,admin_pct,contingency_pct,utility_pct,vat_pct) < 0 then raise exception 'Los porcentajes no pueden ser negativos'; end if;
 if jsonb_typeof(coalesce(payload->'items','null'::jsonb)) <> 'array' or jsonb_array_length(payload->'items') = 0 then raise exception 'Agregue al menos un ítem'; end if;
 if quote_id is null then insert into public.quotes(number,client_id,status,issued_on,valid_until,title,greeting,project_description,objective,notes,scope,benefits,exclusions,payment_terms,execution_time,deliverable,material_increase_pct,administration_pct,contingency_pct,utility_pct,vat_utility_pct,created_by,updated_by) values (public.next_quote_number(extract(year from issued)::integer),client,coalesce((payload->>'status')::public.quote_status,'draft'),issued,valid,coalesce(payload->>'title',''),coalesce(payload->>'greeting',''),coalesce(payload->>'project_description',''),coalesce(payload->>'objective',''),coalesce(payload->>'notes',''),coalesce(payload->>'scope',''),coalesce(payload->>'benefits',''),coalesce(payload->>'exclusions',''),coalesce(payload->>'payment_terms',''),coalesce(payload->>'execution_time',''),coalesce(payload->>'deliverable',''),material_pct,admin_pct,contingency_pct,utility_pct,vat_pct,(select auth.uid()),(select auth.uid())) returning * into q; else select * into q from public.quotes where id=quote_id for update; if not found then raise exception 'Cotización no encontrada'; end if; if q.project_id is not null then raise exception 'La cotización ya fue convertida y no se puede editar'; end if; update public.quotes set client_id=client,status=coalesce((payload->>'status')::public.quote_status,q.status),issued_on=issued,valid_until=valid,title=coalesce(payload->>'title',''),greeting=coalesce(payload->>'greeting',''),project_description=coalesce(payload->>'project_description',''),objective=coalesce(payload->>'objective',''),notes=coalesce(payload->>'notes',''),scope=coalesce(payload->>'scope',''),benefits=coalesce(payload->>'benefits',''),exclusions=coalesce(payload->>'exclusions',''),payment_terms=coalesce(payload->>'payment_terms',''),execution_time=coalesce(payload->>'execution_time',''),deliverable=coalesce(payload->>'deliverable',''),material_increase_pct=material_pct,administration_pct=admin_pct,contingency_pct=contingency_pct,utility_pct=utility_pct,vat_utility_pct=vat_pct where id=q.id returning * into q; delete from public.quote_items where quote_id=q.id; end if;
 for item in select value from jsonb_array_elements(payload->'items') loop pos := pos + 1; category := (item->>'category')::public.catalog_category; if category is null then raise exception 'La categoría es obligatoria'; end if; base_total := coalesce((item->>'quantity')::numeric,0) * coalesce((item->>'base_unit_price')::numeric,0); final_price := coalesce((item->>'base_unit_price')::numeric,0) * case when category='material' then 1 + material_pct / 100 else 1 end; final_total := coalesce((item->>'quantity')::numeric,0) * final_price; if coalesce((item->>'quantity')::numeric,0) < 0 or coalesce((item->>'base_unit_price')::numeric,0) < 0 then raise exception 'Cantidad y precio deben ser positivos'; end if; insert into public.quote_items(quote_id,position,catalog_item_id,code,description,category,quantity,unit,base_unit_price,final_unit_price,base_total,final_total,created_by,updated_by) values(q.id,pos,nullif(item->>'catalog_item_id','')::uuid,coalesce(item->>'code',''),coalesce(item->>'description',''),category,coalesce((item->>'quantity')::numeric,0),coalesce(item->>'unit',''),coalesce((item->>'base_unit_price')::numeric,0),final_price,base_total,final_total,(select auth.uid()),(select auth.uid())); direct := direct + final_total; end loop;
 admin := direct * admin_pct / 100; contingency := direct * contingency_pct / 100; utility := direct * utility_pct / 100; vat := utility * vat_pct / 100; update public.quotes set direct_cost=direct,administration_amount=admin,contingency_amount=contingency,utility_amount=utility,vat_utility_amount=vat,total_amount=direct+admin+contingency+utility+vat where id=q.id returning * into q; return q;
end $$;

create function public.convert_quote_to_project(p_quote_id uuid) returns public.projects language plpgsql security definer set search_path = '' as $$ declare q public.quotes%rowtype; p public.projects%rowtype; location_value text; begin if not (select private.is_active_member()) then raise exception 'No autorizado'; end if; select * into q from public.quotes where id=p_quote_id for update; if not found then raise exception 'Cotización no encontrada'; end if; if q.project_id is not null then select * into p from public.projects where id=q.project_id; return p; end if; if q.status <> 'approved' then raise exception 'Solo se pueden convertir cotizaciones aprobadas'; end if; select coalesce(address,'') into location_value from public.clients where id=q.client_id and is_active; if location_value is null then raise exception 'Cliente inactivo o no disponible'; end if; perform 1 from public.company_settings where id=true; if not found then raise exception 'Configuración de empresa no disponible'; end if; insert into public.projects(quote_id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date,observations,profit_mode,created_by,updated_by) values(q.id,q.number,q.client_id,q.title,q.total_amount,'approved','',location_value,current_date,current_date + 30,q.project_description,'value',(select auth.uid()),(select auth.uid())) returning * into p; insert into public.project_budgets(project_id,source,position,category,note,quantity,base_unit_price,final_unit_price,base_total,final_total,amount,created_by,updated_by) select p.id,'quote_snapshot',position,category::text,description,quantity,base_unit_price,final_unit_price,base_total,final_total,base_total,(select auth.uid()),(select auth.uid()) from public.quote_items where quote_id=q.id order by position; update public.quotes set project_id=p.id where id=q.id; insert into public.audit_log(actor_id,entity_type,entity_id,action,after_data) values((select auth.uid()),'quote',q.id,'convert_quote',jsonb_build_object('project_id',p.id)); return p; end $$;

create view public.project_financial_summary with (security_invoker = true) as select p.id,p.project_value,coalesce(pay.paid,0)::numeric(14,2) as paid,greatest(0,p.project_value-coalesce(pay.paid,0))::numeric(14,2) as balance,coalesce(exp.expenses,0)::numeric(14,2) as expenses,coalesce(bud.budget,0)::numeric(14,2) as budget,case when p.profit_mode='value' then p.project_value-coalesce(exp.expenses,0) else p.initial_profit-coalesce(exp.expenses,0) end::numeric(14,2) as real_profit from public.projects p left join lateral (select sum(amount) paid from public.project_payments where project_id=p.id) pay on true left join lateral (select sum(amount) expenses from public.project_expenses where project_id=p.id) exp on true left join lateral (select sum(amount) budget from public.project_budgets where project_id=p.id) bud on true;
create view public.portfolio_financial_summary with (security_invoker = true) as select coalesce(sum(project_value),0)::numeric(14,2) contracted,coalesce(sum(paid),0)::numeric(14,2) paid,coalesce(sum(expenses),0)::numeric(14,2) expenses,coalesce(sum(real_profit),0)::numeric(14,2) real_profit from public.project_financial_summary;

revoke all on schema public, private, extensions from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clients, public.suppliers, public.catalog_items, public.projects, public.project_payments, public.project_expenses, public.project_budgets, public.project_shares, public.portfolio_shares to authenticated;
grant select, update on public.company_settings to authenticated;
grant select on public.quotes, public.quote_items, public.project_financial_summary, public.portfolio_financial_summary to authenticated;
grant select on public.audit_log to authenticated;
grant execute on function public.save_quote(jsonb), public.convert_quote_to_project(uuid) to authenticated;

alter table public.profiles enable row level security; alter table public.company_settings enable row level security; alter table public.document_counters enable row level security; alter table public.clients enable row level security; alter table public.suppliers enable row level security; alter table public.catalog_items enable row level security; alter table public.quotes enable row level security; alter table public.quote_items enable row level security; alter table public.projects enable row level security; alter table public.project_payments enable row level security; alter table public.project_expenses enable row level security; alter table public.project_budgets enable row level security; alter table public.project_shares enable row level security; alter table public.portfolio_shares enable row level security; alter table public.audit_log enable row level security;
create policy profiles_self_select on public.profiles for select to authenticated using (id=(select auth.uid()) or (select private.is_administrator()));
create policy profiles_admin_update on public.profiles for update to authenticated using ((select private.is_administrator())) with check ((select private.is_administrator()));
create policy company_member on public.company_settings for all to authenticated using ((select private.is_active_member())) with check ((select private.is_active_member()));
do $$ declare t text; begin foreach t in array array['clients','suppliers','catalog_items','projects','project_payments','project_expenses','project_budgets','project_shares','portfolio_shares'] loop execute format('create policy %I on public.%I for all to authenticated using ((select private.is_active_member())) with check ((select private.is_active_member()))', t || '_member', t); end loop; end $$;
create policy quotes_member_select on public.quotes for select to authenticated using ((select private.is_active_member())); create policy quote_items_member_select on public.quote_items for select to authenticated using ((select private.is_active_member())); create policy audit_admin_select on public.audit_log for select to authenticated using ((select private.is_administrator()));
insert into public.company_settings (id) values (true) on conflict do nothing; insert into public.document_counters(key) values ('quote') on conflict do nothing;
revoke all on schema private from public, anon, authenticated;
revoke all on function private.current_profile(), private.is_active_member(), private.is_administrator() from public, anon;
grant usage on schema private to authenticated; grant execute on function private.is_active_member(), private.is_administrator() to authenticated;
