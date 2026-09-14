-- Limpieza opcional de datos de demostración. Ejecute este archivo individualmente en SQL Editor.
-- Esperado: borra solamente el lote identificado. Si hubo actividad nueva sobre el lote, se revierte completo.
begin;
do $$
declare v_batch constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  if not exists (select 1 from private.demo_batches where id = v_batch) then return; end if;
  if exists (select 1 from public.quotes q join private.demo_manifest m on m.batch_id=v_batch and m.entity_type='quotes' and m.entity_id=q.id where q.project_id is not null) then raise exception 'No se limpia: una cotización de demostración ya fue convertida.'; end if;
  if exists (select 1 from public.project_payments x join private.demo_manifest p on p.batch_id=v_batch and p.entity_type='projects' and p.entity_id=x.project_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='project_payments' and m.entity_id=x.id)) then raise exception 'No se limpia: hay cobros nuevos vinculados al lote.'; end if;
  if exists (select 1 from public.project_expenses x join private.demo_manifest p on p.batch_id=v_batch and p.entity_type='projects' and p.entity_id=x.project_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='project_expenses' and m.entity_id=x.id)) then raise exception 'No se limpia: hay gastos nuevos vinculados al lote.'; end if;
  if exists (select 1 from public.project_budgets x join private.demo_manifest p on p.batch_id=v_batch and p.entity_type='projects' and p.entity_id=x.project_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='project_budgets' and m.entity_id=x.id)) then raise exception 'No se limpia: hay presupuestos nuevos vinculados al lote.'; end if;
  if exists (select 1 from public.project_shares x join private.demo_manifest p on p.batch_id=v_batch and p.entity_type='projects' and p.entity_id=x.project_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='project_shares' and m.entity_id=x.id)) then raise exception 'No se limpia: hay participaciones nuevas vinculadas al lote.'; end if;
  if exists (select 1 from public.projects x join private.demo_manifest c on c.batch_id=v_batch and c.entity_type='clients' and c.entity_id=x.client_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='projects' and m.entity_id=x.id)) then raise exception 'No se limpia: hay proyectos externos asociados a un cliente del lote.'; end if;
  if exists (select 1 from public.quotes x join private.demo_manifest c on c.batch_id=v_batch and c.entity_type='clients' and c.entity_id=x.client_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='quotes' and m.entity_id=x.id)) then raise exception 'No se limpia: hay cotizaciones externas asociadas a un cliente del lote.'; end if;
  if exists (select 1 from public.quote_items x join private.demo_manifest c on c.batch_id=v_batch and c.entity_type='catalog_items' and c.entity_id=x.catalog_item_id where not exists (select 1 from private.demo_manifest m where m.batch_id=v_batch and m.entity_type='quote_items' and m.entity_id=x.id)) then raise exception 'No se limpia: hay referencias externas al catálogo del lote.'; end if;
  delete from public.quote_items where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='quote_items');
  delete from public.project_payments where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='project_payments');
  delete from public.project_expenses where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='project_expenses');
  delete from public.project_budgets where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='project_budgets');
  delete from public.project_shares where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='project_shares');
  delete from public.portfolio_shares where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='portfolio_shares');
  delete from public.quotes where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='quotes');
  delete from public.projects where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='projects');
  delete from public.catalog_items where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='catalog_items');
  delete from public.suppliers where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='suppliers');
  delete from public.clients where id in (select entity_id from private.demo_manifest where batch_id=v_batch and entity_type='clients');
  delete from private.demo_batches where id=v_batch;
end $$;
commit;
