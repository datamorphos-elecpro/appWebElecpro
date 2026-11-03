-- Apply and commit separately before 20261103110000.
begin;
alter type public.project_status add value 'pending_approval' after 'quoted';
commit;
