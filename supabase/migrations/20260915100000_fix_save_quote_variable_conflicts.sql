-- Corrige referencias ambiguas entre columnas de quotes y variables PL/pgSQL.
-- Mantiene la firma pública y todos los cálculos financieros de la función.
create or replace function public.save_quote(payload jsonb) returns public.quotes
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
begin
  if not (select private.is_active_member()) then
    raise exception 'No autorizado';
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

    v_base_total := coalesce((v_item->>'quantity')::numeric, 0)
      * coalesce((v_item->>'base_unit_price')::numeric, 0);
    v_final_price := coalesce((v_item->>'base_unit_price')::numeric, 0)
      * case when v_category = 'material' then 1 + v_material_pct / 100 else 1 end;
    v_final_total := coalesce((v_item->>'quantity')::numeric, 0) * v_final_price;

    insert into public.quote_items as item_row (
      quote_id, position, catalog_item_id, code, description, category,
      quantity, unit, base_unit_price, final_unit_price, base_total, final_total,
      created_by, updated_by
    ) values (
      v_quote.id, v_position, nullif(v_item->>'catalog_item_id', '')::uuid,
      coalesce(v_item->>'code', ''), coalesce(v_item->>'description', ''),
      v_category, coalesce((v_item->>'quantity')::numeric, 0),
      coalesce(v_item->>'unit', ''), coalesce((v_item->>'base_unit_price')::numeric, 0),
      v_final_price, v_base_total, v_final_total, (select auth.uid()), (select auth.uid())
    );
    v_direct := v_direct + v_final_total;
  end loop;

  v_admin := v_direct * v_admin_pct / 100;
  v_contingency := v_direct * v_contingency_pct / 100;
  v_utility := v_direct * v_utility_pct / 100;
  v_vat := v_utility * v_vat_pct / 100;

  update public.quotes as q set
    direct_cost = v_direct,
    administration_amount = v_admin,
    contingency_amount = v_contingency,
    utility_amount = v_utility,
    vat_utility_amount = v_vat,
    total_amount = v_direct + v_admin + v_contingency + v_utility + v_vat,
    updated_by = (select auth.uid())
  where q.id = v_quote.id
  returning q.* into v_quote;

  return v_quote;
end $$;

