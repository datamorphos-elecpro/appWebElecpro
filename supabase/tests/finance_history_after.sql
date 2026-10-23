-- Misma base desechable, DESPUÉS de aplicar 20261022100000.
begin;
do $$
declare s record; current_data jsonb;
begin
  for s in select * from private.finance_history_snapshot loop
    case s.entity
      when 'quotes' then select to_jsonb(q)-'show_aiu'-'apply_direct_vat'-'vat_direct_pct'-'vat_direct_amount' into current_data from public.quotes q where id=s.id;
      when 'quote_items' then select to_jsonb(q) into current_data from public.quote_items q where id=s.id;
      when 'projects' then select to_jsonb(p) into current_data from public.projects p where id=s.id;
      when 'project_budgets' then select to_jsonb(b) into current_data from public.project_budgets b where id=s.id;
      when 'summary' then select to_jsonb(f)-'withheld' into current_data from public.project_financial_summary f where id=s.id;
    end case;
    if current_data is distinct from s.data then raise exception 'Historial modificado: % %',s.entity,s.id; end if;
  end loop;
  if exists(select 1 from public.project_withholdings) then raise exception 'Se crearon retenciones históricas'; end if;
  if exists(select 1 from public.quotes where not show_aiu or apply_direct_vat or vat_direct_pct<>19 or vat_direct_amount<>0) then raise exception 'Defaults históricos incorrectos'; end if;
  raise notice 'PASS: filas, instantáneas e importes históricos idénticos; retenciones vacías.';
end $$;
rollback;
