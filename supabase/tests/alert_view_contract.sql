-- Run with psql against a disposable database migrated through 20261103100000.
-- This applies the COMPLETE next migration, including its BEGIN/COMMIT.
\set ON_ERROR_STOP on
create view public.alert_contract_dependent with (security_invoker=true) as
select * from public.project_active_alerts;
revoke all on public.alert_contract_dependent from public, anon;

create temporary table alert_contract_before as
select c.oid, c.relowner, c.relacl, c.reloptions,
 (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attcollation)
                   order by a.attnum)
  from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns
from pg_class c where c.oid='public.project_active_alerts'::regclass;
create temporary table alert_dependencies_before as
select * from pg_depend where refobjid='public.project_active_alerts'::regclass;
create temporary table alert_sources_before as
select d.* from pg_depend d join pg_rewrite r on r.oid=d.objid
where d.classid='pg_rewrite'::regclass and r.ev_class='public.project_active_alerts'::regclass;

\ir ../migrations/20261103110000_payment_management_pending_finance.sql

do $$
declare before_row record; after_columns jsonb;
begin
 select * into strict before_row from alert_contract_before;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attcollation)
                  order by a.attnum) into after_columns
 from pg_attribute a where a.attrelid='public.project_active_alerts'::regclass
 and a.attnum>0 and not a.attisdropped;
 if before_row.columns is distinct from after_columns then
  raise exception 'Alert column names, order, types, typmods or collations changed';
 end if;
 if not exists(select 1 from pg_class c where c.oid='public.project_active_alerts'::regclass
  and c.oid=before_row.oid and c.relowner=before_row.relowner
  and c.relacl is not distinct from before_row.relacl
  and c.reloptions is not distinct from before_row.reloptions
  and 'security_invoker=true'=any(c.reloptions)) then
  raise exception 'Alert identity, ownership, ACLs or security options changed';
 end if;
 if exists((select * from alert_dependencies_before except
            select * from pg_depend where refobjid='public.project_active_alerts'::regclass)
           union all
           (select * from pg_depend where refobjid='public.project_active_alerts'::regclass
            except select * from alert_dependencies_before)) then
  raise exception 'Existing alert dependents changed';
 end if;
 if exists(select * from alert_sources_before except select d.* from pg_depend d
  join pg_rewrite r on r.oid=d.objid where d.classid='pg_rewrite'::regclass
  and r.ev_class='public.project_active_alerts'::regclass) then
  raise exception 'An existing source dependency was lost';
 end if;
 perform * from public.alert_contract_dependent limit 1;
end $$;

drop view public.alert_contract_dependent;
\ir payment_management_pending_finance.sql
\ir project_coverage.sql
\ir current_alerts.sql
\ir project_files.sql
\ir finance_improvements.sql
