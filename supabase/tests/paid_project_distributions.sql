begin;
create function pg_temp.check_true(ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed'; end if; end $$;
insert into auth.users(id,email) values ('ab000000-0000-4000-8000-000000000001','distribution@test.invalid');
insert into public.clients(id,name) values ('ab000000-0000-4000-8000-000000000002',U&'Cliente Garc\00eda');
insert into public.projects(id,quote_number,client_id,title,project_value,start_date,expected_end_date,profit_mode,initial_profit,responsible,location) values
('ab000000-0000-4000-8000-000000000003','PRY-DIST','ab000000-0000-4000-8000-000000000002','Test',1000,current_date,current_date,'value',0,'','');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.project_shares(id,project_id,participant,execution_date,mode,value,basis) values
('ab000000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000003','A',current_date,'fixed',600,'real_profit'),
('ab000000-0000-4000-8000-000000000005','ab000000-0000-4000-8000-000000000003','B',current_date,'fixed',400,'real_profit');
select pg_temp.check_true((select real_profit=1000 and paid_distributions=0 from public.project_financial_summary where id='ab000000-0000-4000-8000-000000000003'));
select public.settle_project_shares('ab000000-0000-4000-8000-000000000003',array['ab000000-0000-4000-8000-000000000004'::uuid],current_date);
select pg_temp.check_true((select real_profit=400 and paid_distributions=600 and expenses=0 from public.project_financial_summary where id='ab000000-0000-4000-8000-000000000003'));
select pg_temp.check_true((public.projects_list_page(p_q=>'GARCIA')->>'total')::integer=1);
select public.settle_project_shares('ab000000-0000-4000-8000-000000000003',array['ab000000-0000-4000-8000-000000000005'::uuid],current_date);
select pg_temp.check_true((select real_profit=0 from public.project_financial_summary where id='ab000000-0000-4000-8000-000000000003'));
select public.settle_project_shares('ab000000-0000-4000-8000-000000000003',array['ab000000-0000-4000-8000-000000000004'::uuid],null,true);
select pg_temp.check_true((select real_profit=600 from public.project_financial_summary where id='ab000000-0000-4000-8000-000000000003'));
do $$ begin
 begin
 perform public.settle_project_shares('ab000000-0000-4000-8000-000000000003',array['ab000000-0000-4000-8000-000000000005'::uuid],current_date);
 raise exception 'Repeated paid row accepted';
 exception when others then if sqlerrm='Repeated paid row accepted' then raise; end if; end;
 begin
 insert into public.project_shares(project_id,participant,execution_date,mode,value,basis) values ('ab000000-0000-4000-8000-000000000003','Percent',current_date,'percent',10,'real_profit');
 raise exception 'Percentage accepted';
 exception when others then if sqlerrm='Percentage accepted' then raise; end if; end;
end $$;
select public.analytics_management_financial_page();
select public.analytics_metric_detail('management.profit','{}',1,20);
reset role;
update public.profiles set is_active=false where id='ab000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.project_financial_summary where id='ab000000-0000-4000-8000-000000000003'));
reset role;
set local role anon;
do $$ begin
 begin perform * from public.project_financial_summary; raise exception 'Anonymous read accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
