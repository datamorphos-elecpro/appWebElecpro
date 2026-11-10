-- Solo base de pruebas con todas las migraciones. Fixtures revertidos.
begin;
create function pg_temp.check_true(p_test boolean, p_message text) returns void language plpgsql as $$
begin if p_test is distinct from true then raise exception 'FAIL: %', p_message; end if; end $$;
create function pg_temp.must_fail(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm)>0 then return; end if;
    raise exception 'FAIL: error inesperado: %',sqlerrm;
  end;
  raise exception 'FAIL: se permitió %',p_sql;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('d1000000-0000-4000-8000-000000000001','labor-manager@example.test','{}'),
 ('d1000000-0000-4000-8000-000000000002','labor-admin@example.test','{}'),
 ('d1000000-0000-4000-8000-000000000003','labor-inactive@example.test','{}');
update public.profiles set role='administrator' where id='d1000000-0000-4000-8000-000000000002';
update public.profiles set is_active=false where id='d1000000-0000-4000-8000-000000000003';
insert into public.clients(id,name) values ('d2000000-0000-4000-8000-000000000001','Cliente mano de obra');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$
declare payload jsonb; q public.quotes; again public.quotes; p public.projects; category text; invalid text; kind text;
begin
  payload := '{"client_id":"d2000000-0000-4000-8000-000000000001","title":"Mano de obra","status":"approved","issued_on":"2026-11-10","valid_until":"2026-12-10","labor_increase_pct":"10","material_increase_pct":"20","administration_pct":"8","contingency_pct":"3","utility_pct":"10","vat_utility_pct":"19","apply_direct_vat":true,"vat_direct_pct":"19","items":[{"category":"labor","code":"MO","description":"Servicio","unit":"UND","quantity":"1","base_unit_price":"100000","vat_pct":"19"}]}';
  foreach category in array array['labor','material','design','technical_visit','all_inclusive','transport','labor'] loop
    q := public.save_quote(jsonb_set(payload,'{items,0,category}',to_jsonb(category)));
    perform pg_temp.check_true(q.direct_cost=case category when 'labor' then 130900 when 'material' then 142800 else 119000 end,'incremento exclusivo por categoría');
    perform pg_temp.check_true((select cost_total=119000 and base_total=100000 from public.quote_items where quote_id=q.id),'costos sin incremento');
  end loop;
  foreach kind in array array['percent','fixed'] loop
    q := public.save_quote(payload || jsonb_build_object('apply_direct_discount',true,'direct_discount_type',kind,'direct_discount_pct','10','direct_discount_fixed_amount','13090','total_amount','1'));
    perform pg_temp.check_true(q.direct_cost=130900 and q.direct_discount_amount=13090 and q.administration_amount=9424.8
      and q.contingency_amount=3534.3 and q.utility_amount=11781 and q.vat_utility_amount=2238.39
      and q.vat_direct_amount=22383.9 and q.total_amount=167172.39,'descuento y totales autoritativos');
    p := public.convert_quote_to_project(q.id);
    perform pg_temp.check_true(p.project_value=q.total_amount,'ingreso comercial conserva incremento y descuento');
    perform pg_temp.check_true((select amount=119000 and cost_total=119000 and final_total=130900 and final_unit_price=130900 from public.project_budgets where project_id=p.id),'presupuesto sin incremento y precios comerciales conservados');
    perform pg_temp.check_true((public.convert_quote_to_project(q.id)).id=p.id,'conversión idempotente');
    perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('id',q.id)),'ya fue convertida');
  end loop;
  q := public.save_quote(payload - 'labor_increase_pct');
  perform pg_temp.check_true(q.labor_increase_pct=0 and q.direct_cost=119000,'payload anterior compatible');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'labor_increase_pct','150.25'));
  perform pg_temp.check_true(q.labor_increase_pct=150.25 and q.direct_cost=297797.5,'edición y porcentaje mayor de 100');
  foreach invalid in array array['','-1','0.001','100000','NaN','Infinity','1e2','10,25'] loop
    perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('labor_increase_pct',invalid)),'El incremento sobre mano de obra');
  end loop;
  q := public.save_quote(payload || '{"apply_direct_discount":true,"direct_discount_type":"fixed","direct_discount_fixed_amount":"130900"}');
  perform pg_temp.check_true(q.total_amount=0,'descuento fijo permite costo incrementado');
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || '{"labor_increase_pct":"0","apply_direct_discount":true,"direct_discount_type":"fixed","direct_discount_fixed_amount":"130900"}'),'no puede superar el costo directo');
  q := public.save_quote(jsonb_set(jsonb_set(jsonb_set(payload,'{items,0,quantity}','"1.25"'),'{items,0,base_unit_price}','"1250.50"'),'{items,0,vat_pct}','"19.25"') || '{"labor_increase_pct":"12.25"}');
  perform pg_temp.check_true(q.direct_cost=2092.369816,'precisión de cantidades fraccionarias');
  payload := payload || '{"request_id":"d3000000-0000-4000-8000-000000000001"}';
  q := public.save_quote(payload); again := public.save_quote(payload);
  perform pg_temp.check_true(q.id=again.id,'guardado idempotente');
  p := public.approve_and_convert_quote(payload);
  perform pg_temp.check_true((public.approve_and_convert_quote(payload)).id=p.id,'aprobar y convertir idempotente');
  perform pg_temp.must_fail(format('select public.save_quote_calculated(%L::jsonb)',payload),'permission denied');
  perform pg_temp.must_fail(format('update public.quotes set labor_increase_pct=20 where id=%L',q.id),'permission denied');
end $$;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((public.save_quote('{"client_id":"d2000000-0000-4000-8000-000000000001","title":"Administrador","issued_on":"2026-11-10","valid_until":"2026-12-10","labor_increase_pct":"10","items":[{"category":"labor","unit":"UND","quantity":"1","base_unit_price":"100"}]}')).total_amount=110,'administrador autorizado');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select pg_temp.must_fail('select public.save_quote(''{}'')','No autorizado');
select pg_temp.check_true((select count(*)=0 from public.quotes),'inactivo sin lectura');
reset role;
set local role anon;
select pg_temp.must_fail('select * from public.quotes','permission denied');
select pg_temp.must_fail('select public.save_quote(''{}'')','permission denied');
rollback;
