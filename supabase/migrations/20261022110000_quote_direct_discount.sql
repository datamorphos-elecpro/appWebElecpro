-- Descuento comercial opcional. No recalcular cotizaciones ni presupuestos anteriores.
begin;

alter table public.quotes
  add column apply_direct_discount boolean not null default false,
  add column direct_discount_type text not null default 'percent' check (direct_discount_type in ('percent', 'fixed')),
  add column direct_discount_pct numeric(5,2) not null default 0 check (direct_discount_pct between 0 and 100),
  add column direct_discount_fixed_amount numeric(18,6) not null default 0 check (direct_discount_fixed_amount >= 0),
  add column direct_discount_amount numeric(18,6) not null default 0 check (direct_discount_amount >= 0);

-- Mantener direct_cost como suma original de ítems; AIU e impuestos usan su neto.
-- Los wrappers autorizados conservan idempotencia, ubicación y bloqueo de conversión.
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
  v_apply_discount boolean := coalesce((payload->>'apply_direct_discount')::boolean, false);
  v_discount_type text := coalesce(payload->>'direct_discount_type', 'percent');
  v_discount_pct_text text := replace(btrim(coalesce(payload->>'direct_discount_pct', '0')), ',', '.');
  v_discount_fixed_text text := replace(btrim(coalesce(payload->>'direct_discount_fixed_amount', '0')), ',', '.');
  v_discount_pct numeric;
  v_discount_fixed numeric;
  v_discount numeric := 0;
  v_net_direct numeric;
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

  if v_discount_type not in ('percent', 'fixed') then
    raise exception 'Tipo de descuento inválido';
  end if;
  if v_discount_pct_text !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' then
    raise exception 'Ingrese un descuento entre 0 y 100 %%, con máximo dos decimales.';
  end if;
  v_discount_pct := v_discount_pct_text::numeric;
  if v_discount_pct not between 0 and 100 then
    raise exception 'Ingrese un descuento entre 0 y 100 %%, con máximo dos decimales.';
  end if;
  if v_discount_fixed_text !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then
    raise exception 'Ingrese un descuento fijo no negativo, sin separadores de miles y con máximo dos decimales.';
  end if;
  v_discount_fixed := v_discount_fixed_text::numeric;

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

  v_discount := case when not v_apply_discount then 0
    when v_discount_type = 'percent' then v_direct * v_discount_pct / 100
    else v_discount_fixed end;
  if v_apply_discount and v_discount > v_direct then
    raise exception 'El descuento fijo no puede superar el costo directo. Corríjalo o desactive el descuento.';
  end if;
  v_net_direct := v_direct - v_discount;

  v_admin := v_net_direct * v_admin_pct / 100;
  v_contingency := v_net_direct * v_contingency_pct / 100;
  v_utility := v_net_direct * v_utility_pct / 100;
  v_vat := v_utility * v_vat_pct / 100;

  v_direct_vat := case when v_apply_direct then v_net_direct * v_direct_pct / 100 else 0 end;
  update public.quotes as q set
    apply_direct_discount = v_apply_discount,
    direct_discount_type = v_discount_type,
    direct_discount_pct = v_discount_pct,
    direct_discount_fixed_amount = v_discount_fixed,
    direct_discount_amount = v_discount,
    show_aiu = v_show_aiu,
    apply_direct_vat = v_apply_direct,
    vat_direct_pct = v_direct_pct,
    vat_direct_amount = v_direct_vat,
    direct_cost = v_direct,
    administration_amount = v_admin,
    contingency_amount = v_contingency,
    utility_amount = v_utility,
    vat_utility_amount = v_vat,
    total_amount = v_net_direct + v_admin + v_contingency + v_utility + v_vat + v_direct_vat,
    updated_by = (select auth.uid())
  where q.id = v_quote.id
  returning q.* into v_quote;

  return v_quote;
end $$;
revoke all on function public.save_quote_calculated(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
