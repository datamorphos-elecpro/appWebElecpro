-- Ejecutar únicamente en una base Supabase de PRUEBAS con todas las migraciones.
-- Fixtures transaccionales: ninguna fila ni contador persiste después de ROLLBACK.
begin;
create temporary table navigation_fixture(kind text primary key, id uuid default extensions.gen_random_uuid());
insert into navigation_fixture(kind) values ('user'),('inactive'),('client');
grant select on navigation_fixture to authenticated;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

insert into auth.users(id,email,raw_user_meta_data)
select id,id::text||'@example.test','{"full_name":"Prueba navegación"}'::jsonb
from navigation_fixture where kind in ('user','inactive');
update public.profiles set is_active=false where id=(select id from navigation_fixture where kind='inactive');
insert into public.clients(id,name) select id,'NAVTEST-'||id::text from navigation_fixture where kind='client';
select set_config('elecpro.test.tag','NAVTEST-'||(select id::text from navigation_fixture where kind='client'),true);
select set_config('request.jwt.claim.sub',(select id::text from navigation_fixture where kind='user'),true);
set local role authenticated;

-- Fechas de emisión inversas, horas distintas y un empate de creación.
do $$
declare q public.quotes%rowtype; i integer; today date := (now() at time zone 'America/Bogota')::date;
begin
  for i in 0..4 loop
    select * into q from public.save_quote(jsonb_build_object(
      'client_id',(select id from navigation_fixture where kind='client'),
      'title',current_setting('elecpro.test.tag')||' Cotización '||i,
      'status',(array['draft','sent','approved','rejected','draft'])[i+1],
      'issued_on',case when i=0 then today+20 else today-20 end,
      'valid_until',case when i=4 then today-1 else today+40 end,
      'items',jsonb_build_array(jsonb_build_object('description','Conductor','code','','category','material','quantity','1.25','unit',' und ','base_unit_price','1250.50'))));
    update public.quotes set created_at=case when i in (2,3) then '2026-01-01 16:00:00+00'::timestamptz
      else '2026-01-01 14:00:00+00'::timestamptz+i*interval '1 hour' end where id=q.id;
  end loop;
end $$;
select pg_temp.assert_true(
  (select array_agg(id) from public.quotes_page(p_q=>current_setting('elecpro.test.tag')))=
  (select array_agg(id order by created_at desc,id desc) from public.quotes where title like current_setting('elecpro.test.tag')||'%'),
  'Descendente usa creación, hora y desempate por id');
select pg_temp.assert_true(
  (select array_agg(id) from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_direction=>'asc'))=
  (select array_agg(id order by created_at asc,id desc) from public.quotes where title like current_setting('elecpro.test.tag')||'%'),
  'Ascendente usa creación');
select pg_temp.assert_true((select count(*)=2 from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'valid')),'Vigentes excluye vencidas');
select pg_temp.assert_true((select count(*)=2 from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'decided')),'Decididas incluye aprobadas y rechazadas');
select pg_temp.assert_true((select count(*)=0 from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'valid',p_status=>'approved')),'Intersección de filtros');
select pg_temp.assert_true((select count(*)=1 and min(total_count)=5 from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_limit=>2,p_offset=>100)),'Página fuera de rango conserva total y devuelve última página');
select pg_temp.assert_true((select count(distinct id)=4 from (
  select id from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_limit=>2)
  union all select id from public.quotes_page(p_q=>current_setting('elecpro.test.tag'),p_limit=>2,p_offset=>2))x),'Sin duplicados entre páginas');

-- Unidades: cobertura de inserción y actualización del catálogo y de ítems.
do $$
declare c public.catalog_items%rowtype;
begin
  insert into public.catalog_items(description,unit,base_unit_price,category)
    values(current_setting('elecpro.test.tag'),' und ',1250.50,'material') returning * into c;
  perform pg_temp.assert_true(c.unit='UND' and c.base_unit_price=1250.50,'Catálogo normalizado con centavos');
  update public.catalog_items set unit=' ml ' where id=c.id returning * into c;
  perform pg_temp.assert_true(c.unit='ML','Actualización de catálogo normalizada');
  update public.quote_items set unit=' m² ' where quote_id in (select id from public.quotes where title like current_setting('elecpro.test.tag')||'%');
  perform pg_temp.assert_true(not exists(select 1 from public.quote_items where quote_id in (select id from public.quotes where title like current_setting('elecpro.test.tag')||'%') and unit<>'M²'),'Ítems normalizados');
end $$;

-- Proyectos: activos, borradores con cartera, finalizados tarde y límites de 15 días.
do $$
declare p public.projects%rowtype; i integer; today date := (now() at time zone 'America/Bogota')::date;
begin
  for i in 0..7 loop
    select * into p from public.create_manual_project(jsonb_build_object(
      'client_id',(select id from navigation_fixture where kind='client'),
      'title',current_setting('elecpro.test.tag')||' Proyecto '||i,'project_value','1000.50',
      'status',(array['approved','in_progress','paused','draft','cancelled','finished','approved','quoted'])[i+1],
      'responsible','Prueba','priority','medium','start_date',today-30,
      'expected_end_date',case when i=0 then today when i=1 then today+15 when i=6 then today+16 else today-4 end,
      'actual_end_date',case when i=5 then today-1 else null end,'profit_mode','value','initial_profit','0'));
    if i=0 then insert into public.project_payments(project_id,payment_date,amount,payment_method) values(p.id,today,250.25,'Transferencia'); end if;
    if i=2 then insert into public.project_expenses(project_id,expense_date,amount,category,payment_method) values(p.id,today,50.25,'Material','Transferencia'); end if;
  end loop;
end $$;
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'active')->>'total')::integer=4,'Activos incluye pausados');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'paid')->>'total')::integer=1,'Pagos positivos');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'expenses')->>'total')::integer=1,'Gastos positivos');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'receivable')->>'total')::integer=8,'Cartera incluye borradores y cancelados con saldo');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'delayed')->>'total')::integer=2,'Retrasados incluye finalización real tardía');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'ending_soon')->>'total')::integer=2,'Finalización incluye hoy y día 15, excluye día 16');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_segment=>'active',p_status=>'draft')->>'total')::integer=0,'Intersección vacía de proyectos');
select pg_temp.assert_true((public.projects_list_page(p_q=>current_setting('elecpro.test.tag'),p_limit=>2,p_offset=>100)->>'page')::integer=4,'Proyectos ajustan página fuera de rango');
select pg_temp.assert_true(jsonb_typeof(public.projects_list_page(p_q=>current_setting('elecpro.test.tag'))->'records'->0->'financialSummary'->'paid')='string','Importes financieros viajan como cadenas');

-- Guardado financiero y conversión conservan los centavos y las instantáneas.
do $$
declare q public.quotes%rowtype; p public.projects%rowtype; p_again public.projects%rowtype; rejected boolean := false;
begin
  select * into q from public.save_quote(jsonb_build_object(
    'client_id',(select id from navigation_fixture where kind='client'),'title','Prueba de decimales',
    'status','approved','issued_on',(now() at time zone 'America/Bogota')::date,'valid_until',(now() at time zone 'America/Bogota')::date+15,
    'material_increase_pct','10','administration_pct','8','contingency_pct','3','utility_pct','10','vat_utility_pct','19',
    'items',jsonb_build_array(jsonb_build_object('description','Conductor','code','','category','material','quantity','1.25','unit','und','base_unit_price','1250.50'))));
  perform pg_temp.assert_true(q.total_amount=2113.188688,'AIU e IVA sin redondeos intermedios');
  select * into p from public.convert_quote_to_project(q.id);
  select * into p_again from public.convert_quote_to_project(q.id);
  perform pg_temp.assert_true(p.id=p_again.id and p.project_value=q.total_amount,'Conversión idempotente');
  perform pg_temp.assert_true(exists(select 1 from public.project_budgets where project_id=p.id and base_unit_price=1250.50 and final_unit_price=1375.55 and amount=1563.125),'Instantánea decimal');
  begin update public.quote_items set unit='ml' where quote_id=q.id;
  exception when raise_exception then rejected := sqlerrm like '%convertida%'; end;
  perform pg_temp.assert_true(rejected,'Cotización convertida bloqueada');
end $$;

-- Perfil inactivo: ningún dato, incluso con JWT presente.
reset role;
select set_config('request.jwt.claim.sub',(select id::text from navigation_fixture where kind='inactive'),true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.quotes_page()),'Inactivo no consulta cotizaciones');
select pg_temp.assert_true((public.projects_list_page()->>'total')::integer=0,'Inactivo no consulta proyectos');

-- Anónimo: las funciones no tienen permiso de ejecución.
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
declare denied boolean := false;
begin
  begin perform public.quotes_page(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: anon puede ejecutar quotes_page'; end if;
  denied := false;
  begin perform public.projects_list_page(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: anon puede ejecutar projects_list_page'; end if;
end $$;
reset role;
rollback;
