begin;

create function public.project_reporting_details(p_project_ids uuid[])
returns table(id uuid, direct_cost text, total_aiu text, invoices jsonb)
language sql stable security invoker set search_path = '' as $$
  select p.id,
    (case when p.quote_id is null then p.project_value else q.direct_cost-q.direct_discount_amount end)::text,
    (case when p.quote_id is null then 0 else q.administration_amount+q.contingency_amount+q.utility_amount+q.vat_utility_amount end)::text,
    coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'original_name',f.original_name,'mime_type',f.mime_type) order by f.created_at desc,f.id)
      from public.project_files f join public.project_attachment_types t on t.id=f.attachment_type_id
      where f.project_id=p.id and f.kind='attachment' and f.status='ready'
        and public.normalize_text(t.name)=public.normalize_text('Factura Electrónica')), '[]'::jsonb)
  from public.projects p left join public.quotes q on q.id=p.quote_id
  where (select private.is_active_member()) and p.id=any(p_project_ids);
$$;
revoke all on function public.project_reporting_details(uuid[]) from public,anon;
grant execute on function public.project_reporting_details(uuid[]) to authenticated;

commit;
