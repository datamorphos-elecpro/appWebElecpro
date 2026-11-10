-- Misma base desechable, después de 20261110100000.
begin;
do $$
declare s record; current_data jsonb;
begin
  for s in select * from private.quote_labor_history_snapshot loop
    case s.entity
      when 'quotes' then select to_jsonb(q)-'labor_increase_pct' into current_data from public.quotes q where id=s.id;
      when 'quote_items' then select to_jsonb(i) into current_data from public.quote_items i where id=s.id;
      when 'projects' then select to_jsonb(p) into current_data from public.projects p where id=s.id;
      when 'project_budgets' then select to_jsonb(b) into current_data from public.project_budgets b where id=s.id;
      when 'summary' then select to_jsonb(f) into current_data from public.project_financial_summary f where id=s.id;
    end case;
    if current_data is distinct from s.data then raise exception 'Historial modificado: % %',s.entity,s.id; end if;
  end loop;
  if exists(select 1 from public.quotes where labor_increase_pct<>0) then raise exception 'Defaults incorrectos'; end if;
  raise notice 'PASS: filas e importes históricos conservados, incluidos auditoría, impuestos y presupuestos.';
end $$;
rollback;
