-- Solo base de PRUEBAS, con ambas migraciones 20261013 aplicadas.
-- Fixtures y consecutivos se revierten al terminar.
begin;
create temporary table vat_fixture(kind text primary key, id uuid default extensions.gen_random_uuid());
insert into vat_fixture(kind) values ('user'), ('inactive'), ('client');
grant select on vat_fixture to authenticated;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data)
select id,id::text||'@example.test','{"full_name":"Prueba IVA"}'::jsonb from vat_fixture where kind in ('user','inactive');
update public.profiles set is_active=false where id=(select id from vat_fixture where kind='inactive');
insert into public.clients(id,name) select id,'IVA TEST' from vat_fixture where kind='client';
select set_config('request.jwt.claim.sub',(select id::text from vat_fixture where kind='user'),true);
set local role authenticated;

do $$
declare
  q public.quotes%rowtype; again public.quotes%rowtype; p public.projects%rowtype; p_again public.projects%rowtype;
  c public.catalog_items%rowtype; payload jsonb; category text; invalid text; vat text;
  request_id uuid := pg_catalog.gen_random_uuid(); rejected boolean;
begin
  -- Catálogo: nuevos prefijos y códigos únicos sin escritura directa al contador.
  foreach category in array array['all_inclusive','transport'] loop
    insert into public.catalog_items(description,unit,base_unit_price,category)
    values('Categoría IVA TEST','und',100000,category::public.catalog_category) returning * into c;
    perform pg_temp.assert_true(c.code ~ (case when category='transport' then '^TRA-[0-9]{4}$' else '^TODO-[0-9]{4}$' end),'Prefijo nuevo');
    insert into public.catalog_items(description,unit,base_unit_price,category)
    values('Otro ítem IVA TEST','und',100000,category::public.catalog_category) returning * into c;
  end loop;
  perform pg_temp.assert_true((select count(*)=count(distinct code) from public.catalog_items),'Códigos únicos');

  payload := jsonb_build_object(
    'client_id',(select id from vat_fixture where kind='client'),'title','IVA TEST',
    'status','approved','issued_on',current_date,'valid_until',current_date+15,
    'address','Dirección de prueba','city','Bogotá','request_id',request_id,
    'material_increase_pct','10','administration_pct','8','contingency_pct','3','utility_pct','10','vat_utility_pct','19',
    'items',jsonb_build_array(jsonb_build_object('description','Conductor','code','MAT-TEST','category','material','quantity','2','unit','und','base_unit_price','100000','vat_pct','19')));
  select * into q from public.save_quote(payload);
  perform pg_temp.assert_true(q.direct_cost=261800 and q.total_amount=321752.2,'Totales de aceptación con AIU');
  perform pg_temp.assert_true(q.address='Dirección de prueba' and q.city='Bogotá','Capa de ubicación conservada');
  perform pg_temp.assert_true(exists(select 1 from public.quote_items where quote_id=q.id and vat_pct=19 and base_total=200000 and cost_total=238000 and final_unit_price=130900 and final_total=261800),'Instantánea de aceptación');
  select * into again from public.save_quote(payload);
  perform pg_temp.assert_true(q.id=again.id,'Guardado idempotente');
  select * into p from public.convert_quote_to_project(q.id);
  select * into p_again from public.convert_quote_to_project(q.id);
  perform pg_temp.assert_true(p.id=p_again.id and p.project_value=q.total_amount,'Conversión idempotente conserva valor comercial');
  perform pg_temp.assert_true(exists(select 1 from public.project_budgets where project_id=p.id and vat_pct=19 and cost_total=238000 and amount=238000 and base_total=200000 and final_total=261800),'Presupuesto incluye IVA y excluye incremento');
  rejected := false;
  begin perform public.save_quote(payload||jsonb_build_object('id',q.id));
  exception when raise_exception then rejected := sqlerrm like '%convertida%'; end;
  perform pg_temp.assert_true(rejected,'Bloqueo comercial después de convertir');

  -- IVA de todas las categorías, nunca incremento comercial fuera de Material.
  foreach category in array array['labor','design','technical_visit','all_inclusive','transport'] loop
    payload := jsonb_set(payload - 'request_id','{items,0,category}',to_jsonb(category));
    select * into q from public.save_quote(payload);
    perform pg_temp.assert_true(q.direct_cost=238000,'IVA en categoría '||category);
  end loop;
  -- Precisión de cálculo antes de persistir, incluyendo IVA con coma decimal.
  payload := jsonb_set(payload,'{items,0}',jsonb_build_object('description','Transporte','code','TRA-TEST','category','transport','quantity','1.25','unit','und','base_unit_price','1250.50','vat_pct','19,25'));
  select * into q from public.save_quote(payload);
  perform pg_temp.assert_true(q.total_amount=2290.888645 and q.direct_cost=1864.026563,'Sin redondear pasos intermedios');
  perform pg_temp.assert_true(exists(select 1 from public.quote_items where quote_id=q.id and vat_pct=19.25 and cost_total=1864.026563),'Costo decimal persistido');
  -- Editar y volver a consultar conserva el nuevo IVA.
  payload := jsonb_set(payload,'{items,0,vat_pct}','"5"'::jsonb)||jsonb_build_object('id',q.id);
  select * into again from public.save_quote(payload);
  perform pg_temp.assert_true(again.id=q.id and exists(select 1 from public.quote_items where quote_id=q.id and vat_pct=5),'Edición de IVA');
  payload := payload - 'id';
  foreach vat in array array['','0','100'] loop
    select * into q from public.save_quote(jsonb_set(payload,'{items,0,vat_pct}',to_jsonb(vat)));
    perform pg_temp.assert_true(exists(select 1 from public.quote_items where quote_id=q.id and vat_pct=coalesce(nullif(vat,''),'0')::numeric),'IVA opcional o extremo');
  end loop;
  select * into q from public.save_quote(payload #- '{items,0,vat_pct}');
  perform pg_temp.assert_true(exists(select 1 from public.quote_items where quote_id=q.id and vat_pct=0 and cost_total=base_total),'Payload anterior sin IVA');
  foreach invalid in array array['-1','100.01','101','19.001','NaN','Infinity','1e1','19,'] loop
    rejected := false;
    begin perform public.save_quote(jsonb_set(payload,'{items,0,vat_pct}',to_jsonb(invalid)));
    exception when raise_exception then rejected := sqlerrm like 'Ingrese un IVA%'; end;
    perform pg_temp.assert_true(rejected,'RPC rechaza IVA '||invalid);
  end loop;
  rejected := false;
  begin perform public.save_quote_calculated(payload);
  exception when insufficient_privilege then rejected := true; end;
  perform pg_temp.assert_true(rejected,'Cálculo interno no expuesto');
end $$;

reset role;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.quote_items'::regclass,'public.project_budgets'::regclass,'public.catalog_code_counters'::regclass)),'RLS conservada');
select pg_temp.assert_true(not has_table_privilege('anon','public.quote_items','SELECT') and not has_table_privilege('anon','public.project_budgets','SELECT'),'Anon no tiene acceso a nuevas instantáneas');
select pg_temp.assert_true(not has_function_privilege('anon','public.save_quote(jsonb)','EXECUTE'),'Anon no ejecuta RPC');
select set_config('request.jwt.claim.sub',(select id::text from vat_fixture where kind='inactive'),true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.quote_items),'Inactivo no consulta IVA');
do $$
declare rejected boolean := false;
begin
  begin perform public.save_quote('{}'::jsonb);
  exception when raise_exception then rejected := sqlerrm='No autorizado'; end;
  perform pg_temp.assert_true(rejected,'Inactivo no guarda');
end $$;
reset role;
rollback;
