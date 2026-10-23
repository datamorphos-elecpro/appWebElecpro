-- Base de pruebas con todas las migraciones aplicadas. Fixtures revertidos.
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
 ('c1000000-0000-4000-8000-000000000001','discount-manager@example.test','{}'),
 ('c1000000-0000-4000-8000-000000000002','discount-admin@example.test','{}'),
 ('c1000000-0000-4000-8000-000000000003','discount-inactive@example.test','{}');
update public.profiles set role='administrator' where id='c1000000-0000-4000-8000-000000000002';
update public.profiles set is_active=false where id='c1000000-0000-4000-8000-000000000003';
insert into public.clients(id,name) values ('c2000000-0000-4000-8000-000000000001','Cliente descuento');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$
declare payload jsonb; q public.quotes; again public.quotes; p public.projects; kind text; aiu boolean; vat boolean; invalid text;
begin
  payload := jsonb_build_object('client_id','c2000000-0000-4000-8000-000000000001','title','Descuento de prueba',
    'issued_on',current_date,'valid_until',current_date+30,'status','approved','administration_pct','8','contingency_pct','3',
    'utility_pct','10','vat_utility_pct','19','vat_direct_pct','19','apply_direct_vat',true,
    'apply_direct_discount',true,'direct_discount_pct','10','direct_discount_fixed_amount','100000',
    'direct_discount_amount','999999','total_amount','1',
    'items',jsonb_build_array(jsonb_build_object('code','MO-TEST','description','Servicio','category','labor','unit','UND','quantity','1','base_unit_price','1000000')));
  foreach kind in array array['percent','fixed'] loop
    foreach aiu in array array[true,false] loop
      foreach vat in array array[true,false] loop
        q := public.save_quote(payload || jsonb_build_object('direct_discount_type',kind,'show_aiu',aiu,'apply_direct_vat',vat));
        perform pg_temp.check_true(q.direct_cost=1000000 and q.direct_discount_amount=100000 and q.administration_amount=72000
          and q.contingency_amount=27000 and q.utility_amount=90000 and q.vat_utility_amount=17100
          and q.total_amount=case when vat then 1277100 else 1106100 end,'cálculo y totales enviados ignorados');
        p := public.convert_quote_to_project(q.id);
        perform pg_temp.check_true(p.project_value=q.total_amount,'valor comercial descontado');
        perform pg_temp.check_true((select sum(amount)=1000000 and sum(final_total)=1000000 from public.project_budgets where project_id=p.id),'costos y precios conservados');
        perform pg_temp.check_true((public.convert_quote_to_project(q.id)).id=p.id,'conversión idempotente');
        perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('id',q.id)), 'ya fue convertida');
      end loop;
    end loop;
  end loop;

  q := public.save_quote(payload || '{"direct_discount_type":"percent","direct_discount_pct":"12,25","direct_discount_fixed_amount":"100000,50"}');
  perform pg_temp.check_true(q.direct_discount_pct=12.25 and q.direct_discount_fixed_amount=100000.5 and q.direct_discount_amount=122500,'valores separados y coma decimal');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'direct_discount_type','fixed','direct_discount_pct','12.25','direct_discount_fixed_amount','100000.50'));
  perform pg_temp.check_true(q.direct_discount_amount=100000.5 and q.direct_discount_pct=12.25,'cambio a fijo conserva porcentaje');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'direct_discount_type','fixed','apply_direct_discount',false,'direct_discount_fixed_amount','2000000'));
  perform pg_temp.check_true(q.total_amount=1419000 and q.direct_discount_amount=0 and q.direct_discount_fixed_amount=2000000,'desactivar permite conservar monto superior a nueva base');
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('id',q.id,'direct_discount_type','fixed','direct_discount_fixed_amount','1000000.01')), 'no puede superar el costo directo');
  perform pg_temp.check_true((select total_amount=1419000 and direct_discount_fixed_amount=2000000 from public.quotes where id=q.id),'error no modifica cotización');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'direct_discount_type','percent','direct_discount_pct','100'));
  perform pg_temp.check_true(q.total_amount=0 and q.administration_amount=0 and q.vat_direct_amount=0,'descuento 100 %');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'direct_discount_type','fixed','direct_discount_fixed_amount','0'));
  perform pg_temp.check_true(q.apply_direct_discount and q.total_amount=1419000 and q.direct_discount_amount=0,'descuento cero activado');
  q := public.save_quote(payload - 'apply_direct_discount' - 'direct_discount_pct' - 'direct_discount_fixed_amount');
  perform pg_temp.check_true(not q.apply_direct_discount and q.direct_discount_type='percent' and q.direct_discount_pct=0 and q.direct_discount_fixed_amount=0,'payload anterior compatible');

  foreach invalid in array array['-1','100.01','1.001','NaN','Infinity',''] loop
    perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('direct_discount_pct',invalid)), 'Ingrese un descuento entre');
  end loop;
  foreach invalid in array array['-1','1.001','NaN','Infinity','1.000.000',''] loop
    perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('direct_discount_fixed_amount',invalid)), 'Ingrese un descuento fijo');
  end loop;
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || '{"direct_discount_type":"otro"}'), 'Tipo de descuento inválido');

  payload := payload || '{"material_increase_pct":"12.25","direct_discount_pct":"12.25","items":[{"code":"MAT","description":"Material","category":"material","unit":"UND","quantity":"1","base_unit_price":"100","vat_pct":"19.25"}]}';
  q := public.save_quote(payload);
  perform pg_temp.check_true(q.direct_cost=133.858125 and q.direct_discount_amount=16.397620 and q.total_amount=166.676456,'precisión numeric sin redondeos intermedios');
  q := public.save_quote(payload || '{"direct_discount_type":"fixed","direct_discount_fixed_amount":"133.85"}');
  perform pg_temp.check_true(q.direct_discount_amount=133.85,'límite contra costo con IVA e incremento');
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || '{"direct_discount_type":"fixed","direct_discount_fixed_amount":"133.86"}'), 'no puede superar el costo directo');

  payload := payload || jsonb_build_object('request_id','c3000000-0000-4000-8000-000000000001');
  q := public.save_quote(payload); again := public.save_quote(payload);
  perform pg_temp.check_true(q.id=again.id,'guardado idempotente');
  p := public.approve_and_convert_quote(payload);
  perform pg_temp.check_true(p.project_value=q.total_amount,'aprobar y convertir conserva descuento');
  perform pg_temp.check_true((public.approve_and_convert_quote(payload)).id=p.id,'conversión repetida por solicitud');
  perform pg_temp.must_fail(format('select public.save_quote_calculated(%L::jsonb)',payload),'permission denied');
  perform pg_temp.must_fail(format('update public.quotes set direct_discount_amount=1 where id=%L',q.id),'permission denied');
end $$;

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((public.save_quote('{"client_id":"c2000000-0000-4000-8000-000000000001","title":"Administrador","issued_on":"2026-10-22","valid_until":"2026-11-01","apply_direct_discount":true,"direct_discount_pct":"10","items":[{"category":"labor","unit":"UND","quantity":"1","base_unit_price":"100"}]}')).total_amount=90,'administrador autorizado');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
select pg_temp.must_fail('select public.save_quote(''{}'')','No autorizado');
select pg_temp.check_true((select count(*)=0 from public.quotes),'inactivo sin lectura');
reset role;
set local role anon;
select pg_temp.must_fail('select * from public.quotes','permission denied');
select pg_temp.must_fail('select public.save_quote(''{}'')','permission denied');
rollback;
