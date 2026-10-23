-- Ejecutar únicamente en una base de pruebas con el historial completo aplicado.
begin;
create function pg_temp.check_true(p_test boolean, p_message text) returns void language plpgsql as $$
begin if p_test is distinct from true then raise exception 'FAIL: %', p_message; end if; end $$;
create function pg_temp.must_fail(p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then return; end;
  raise exception 'FAIL: se permitió %', p_sql;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','finance-manager@example.test','{}'),
 ('a1000000-0000-4000-8000-000000000002','finance-admin@example.test','{}'),
 ('a1000000-0000-4000-8000-000000000003','finance-inactive@example.test','{}');
update public.profiles set role='administrator' where id='a1000000-0000-4000-8000-000000000002';
update public.profiles set is_active=false where id='a1000000-0000-4000-8000-000000000003';
insert into public.clients(id,name) values ('a2000000-0000-4000-8000-000000000001','Pruebas financieras');
insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date,profit_mode,initial_profit) values
 ('a3000000-0000-4000-8000-000000000001','PRY-FINANCE-1','a2000000-0000-4000-8000-000000000001','Proyecto con retenciones',10000000,'approved','Ana','Bogotá',current_date,current_date+30,'value',0),
 ('a3000000-0000-4000-8000-000000000002','PRY-FINANCE-2','a2000000-0000-4000-8000-000000000001','Proyecto manual',1000,'in_progress','Ana','Bogotá',current_date,current_date+30,'manual',100);
insert into public.project_payments(project_id,payment_date,amount,payment_method) values
 ('a3000000-0000-4000-8000-000000000001',current_date,9600000,'Transferencia');
insert into public.project_expenses(project_id,expense_date,category,amount,payment_method,note)
select 'a3000000-0000-4000-8000-000000000002', current_date - x, 'Categoría histórica especial', 10, 'Transferencia','Gasto '||x
from generate_series(1,25) x;
insert into public.project_budgets(project_id,category,amount) values ('a3000000-0000-4000-8000-000000000002','Mano de obra',300);
insert into public.portfolio_shares(id,participant,mode,value,basis,is_active,is_paid,paid_amount,paid_on) values
 ('a4000000-0000-4000-8000-000000000001','Prueba pagada','fixed',10,'portfolio_profit',false,true,10,current_date),
 ('a4000000-0000-4000-8000-000000000002','Prueba pendiente','fixed',10,'portfolio_profit',true,false,null,null);

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare p uuid := 'a3000000-0000-4000-8000-000000000001'; w public.project_withholdings; again public.project_withholdings;
begin
  w := public.register_project_withholding(jsonb_build_object('project_id',p,'request_id','a5000000-0000-4000-8000-000000000001',
    'withholding_date',current_date,'kind','income','amount','200000'));
  again := public.register_project_withholding(jsonb_build_object('project_id',p,'request_id','a5000000-0000-4000-8000-000000000001',
    'withholding_date',current_date,'kind','income','amount','200000'));
  perform pg_temp.check_true(w.id=again.id,'reintento idempotente');
  perform pg_temp.check_true((select balance=200000 and withheld=200000 and paid=9600000 and expenses=0 and real_profit=10000000 from public.project_financial_summary where id=p),'retención parcial');
  perform public.register_project_withholding(jsonb_build_object('project_id',p,'request_id','a5000000-0000-4000-8000-000000000002',
    'withholding_date',current_date,'kind','vat','amount','200000'));
  perform pg_temp.check_true((select balance=0 and withheld=400000 from public.project_financial_summary where id=p),'cierre de cartera');
  perform pg_temp.check_true(not exists(select 1 from public.alerts_page() where project_id=p and kind='cartera'),'alerta resuelta');
  perform pg_temp.must_fail(format('select public.register_project_withholding(%L::jsonb)',jsonb_build_object('project_id',p,
    'request_id',gen_random_uuid(),'withholding_date',current_date,'kind','ica','amount','1')));
  perform pg_temp.must_fail(format('select public.void_project_withholding(%L,%L)',w.id,''));
  perform public.void_project_withholding(w.id,'Valor registrado por error');
  perform public.void_project_withholding(w.id,'Reintento');
  perform pg_temp.check_true((select balance=200000 and withheld=200000 and paid=9600000 and real_profit=10000000 from public.project_financial_summary where id=p),'anulación restaura saldo');
  perform pg_temp.check_true((select void_reason='Valor registrado por error' and voided_by=auth.uid() from public.project_withholdings where id=w.id),'historial de anulación');
  perform pg_temp.check_true(exists(select 1 from public.expense_categories() where category='Categoría histórica especial'),'categorías históricas');
  perform pg_temp.must_fail(format('update public.project_withholdings set amount=1 where id=%L',w.id));
  perform pg_temp.must_fail(format('delete from public.project_withholdings where id=%L',w.id));
  perform pg_temp.must_fail(format('insert into public.project_withholdings(project_id) values(%L)',p));
end $$;

do $$
declare payload jsonb; q public.quotes; p public.projects; i integer;
begin
  payload := jsonb_build_object('client_id','a2000000-0000-4000-8000-000000000001','title','Cotización con opciones',
    'issued_on',current_date,'valid_until',current_date+30,'status','approved','administration_pct','8','contingency_pct','3',
    'utility_pct','10','vat_utility_pct','19','vat_direct_pct','19','apply_direct_vat',true,'show_aiu',false,
    'items',jsonb_build_array(jsonb_build_object('code','MO-TEST','description','Servicio','category','labor','unit','UND','quantity','1','base_unit_price','1000000')));
  q := public.save_quote(payload);
  perform pg_temp.check_true(q.total_amount=1419000 and q.vat_direct_amount=190000 and not q.show_aiu,'ambos IVA y AIU oculto');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'apply_direct_vat',false));
  perform pg_temp.check_true(q.total_amount=1229000 and q.vat_direct_amount=0 and q.vat_direct_pct=19,'desactivar conserva tasa');
  q := public.save_quote(payload || jsonb_build_object('id',q.id,'vat_direct_pct','19,25'));
  perform pg_temp.check_true(q.vat_direct_amount=192500,'IVA decimal normalizado');
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('id',q.id,'vat_direct_pct','100.01')));
  q := public.save_quote(payload || jsonb_build_object('id',q.id));
  p := public.convert_quote_to_project(q.id);
  perform pg_temp.check_true(p.project_value=1419000,'proyecto conserva total comercial');
  perform pg_temp.check_true((select sum(amount)=1000000 from public.project_budgets where project_id=p.id),'presupuesto excluye IVA comercial');
  perform pg_temp.check_true((public.convert_quote_to_project(q.id)).id=p.id,'conversión idempotente');
  perform pg_temp.must_fail(format('select public.save_quote(%L::jsonb)',payload || jsonb_build_object('id',q.id,'show_aiu',true)));
  for i in 1..3 loop
    perform public.save_quote(payload || jsonb_build_object('status',case i when 1 then 'sent' when 2 then 'rejected' else 'draft' end,
      'issued_on',current_date-30,'valid_until',case when i=3 then current_date-1 else current_date+30 end));
  end loop;
end $$;

-- Cada detalle concilia con su tarjeta para varios conjuntos de filtros.
do $$
declare metric text; filters jsonb; detail jsonb; snapshot jsonb; expected text; key text; prefix text;
begin
  foreach filters in array array['{}'::jsonb,
    '{"management_client":["a2000000-0000-4000-8000-000000000001"],"management_month":"1900-01","commercial_status":["approved","rejected"],"distribution_activity":["active"]}'::jsonb,
    '{"management_status":["in_progress"],"commercial_month":"1900-01","distribution_q":"inexistente"}'::jsonb] loop
    foreach metric in array array['management.projectValue','management.balance','management.expenses','management.profit','management.projectedProfit',
      'commercial.approvedValue','commercial.validSent','commercial.expired','commercial.approval','distribution.result','distribution.paid','distribution.pending','distribution.assigned','distribution.available'] loop
      prefix := split_part(metric,'.',1); key := split_part(metric,'.',2);
      detail := public.analytics_metric_detail(metric,filters,1,20);
      if prefix='management' then
        snapshot := public.analytics_management_snapshot_multi(
          array(select value::uuid from jsonb_array_elements_text(filters->'management_client')),
          array(select value::uuid from jsonb_array_elements_text(filters->'management_project')),
          array(select value from jsonb_array_elements_text(filters->'management_status')),filters->>'management_month');
      elsif prefix='commercial' then
        snapshot := public.analytics_commercial_snapshot_multi(array(select value::uuid from jsonb_array_elements_text(filters->'commercial_client')),
          array(select value from jsonb_array_elements_text(filters->'commercial_status')),filters->>'commercial_month');
      else
        snapshot := public.distribution_snapshot_multi(filters->>'distribution_q',
          array(select value from jsonb_array_elements_text(filters->'distribution_activity')),
          array(select value from jsonb_array_elements_text(filters->'distribution_payment')));
      end if;
      expected := snapshot->'metrics'->>key;
      perform pg_temp.check_true((detail->>'value')::numeric is not distinct from expected::numeric,'conciliación '||metric||' '||filters::text);
      perform pg_temp.check_true(jsonb_array_length(detail->'records')<=20,'límite de página');
    end loop;
  end loop;
  detail := public.analytics_metric_detail('management.expenses','{"management_project":["a3000000-0000-4000-8000-000000000002"]}',2,20);
  perform pg_temp.check_true((detail->>'total')::int=25 and (detail->>'value')::numeric=250 and jsonb_array_length(detail->'records')=5,'total completo y segunda página');
  detail := public.analytics_metric_detail('management.profit','{"management_project":["a3000000-0000-4000-8000-000000000002"]}',1,20);
  perform pg_temp.check_true((detail->>'value')::numeric=-150 and detail->'records'->0->>'base'='100.00','modo manual y resultado negativo');
  detail := public.analytics_metric_detail('commercial.approval','{"commercial_month":"1900-01"}',100,20);
  perform pg_temp.check_true(detail->>'value' is null and (detail->>'page')::int=1 and (detail->>'total')::int=0,'sin decisiones y página fuera de rango');
end $$;

reset role;
select pg_temp.check_true(exists(select 1 from public.audit_log where entity_type='project_withholdings' and action='insert'),'auditoría de creación');
select pg_temp.check_true(exists(select 1 from public.audit_log where entity_type='project_withholdings' and action='update'),'auditoría de anulación');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_true((public.analytics_metric_detail('management.expenses')->>'value')::numeric=250,'administrador');
reset role;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.project_withholdings),'inactivo no consulta retenciones');
select pg_temp.must_fail($q$select public.analytics_metric_detail('management.expenses')$q$);
select pg_temp.must_fail($q$select public.register_project_withholding('{}')$q$);
reset role;
set local role anon;
select pg_temp.must_fail('select * from public.project_withholdings');
select pg_temp.must_fail($q$select public.analytics_metric_detail('management.expenses')$q$);
select pg_temp.must_fail($q$select public.register_project_withholding('{}')$q$);
reset role;
rollback;
