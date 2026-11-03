"""Concurrent mutation checks on a disposable, fully migrated test database.
Set ELECPRO_TEST_DATABASE=true and PG* connection variables; PSQL_EXE is optional.
Reserved fixture IDs start with cb; only these fixtures are removed afterwards.
"""
import json
import os
import subprocess
import time

if os.environ.get('ELECPRO_TEST_DATABASE') != 'true':
    raise SystemExit('Set ELECPRO_TEST_DATABASE=true for a disposable database.')

args = [os.environ.get('PSQL_EXE', 'psql'), '-X', '-At', '-v', 'ON_ERROR_STOP=1']
actor = 'cb000000-0000-4000-8000-000000000001'
client = 'cb000000-0000-4000-8000-000000000002'
project = 'cb000000-0000-4000-8000-000000000003'
payment = 'cb000000-0000-4000-8000-000000000004'
receipt = 'cb000000-0000-4000-8000-000000000005'
replacement = 'cb000000-0000-4000-8000-000000000006'
claim = f"select set_config('request.jwt.claim.sub','{actor}',false);"
authorized = claim + 'set role authenticated;'


def sql(statement):
    return subprocess.run(args + ['-c', statement], capture_output=True, text=True, encoding='utf-8', timeout=30)


def checked(statement):
    result = sql(statement)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip().splitlines()[-1]


def rpc(name, payload):
    return f"select public.{name}('{json.dumps(payload)}'::jsonb);"


def held_mutation(statement):
    environment = {**os.environ, 'PGAPPNAME': 'elecpro_payment_race'}
    process = subprocess.Popen(args + ['-c', authorized + 'begin;' + statement + 'select pg_sleep(2);commit;'],
                               env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if checked("select exists(select 1 from pg_stat_activity where application_name='elecpro_payment_race' and wait_event='PgSleep');") == 't':
            return process
        if process.poll() is not None:
            _, error = process.communicate()
            raise AssertionError(error)
        time.sleep(0.05)
    raise AssertionError('The first session never acquired the mutation lock.')


def completed(process):
    _, error = process.communicate(timeout=30)
    assert process.returncode == 0, error


checked(f"""
insert into auth.users(id,email) values ('{actor}','payment-race@test.invalid');
insert into public.clients(id,name) values ('{client}','Concurrencia anticipos');
insert into public.projects(id,client_id,quote_number,title,project_value,start_date,expected_end_date)
values ('{project}','{client}','PRY-PAYMENT-RACE','Concurrencia',1000,current_date,current_date);
insert into public.project_payments(id,project_id,payment_date,amount,payment_method) values ('{payment}','{project}',current_date,100,'Transferencia');
""")
try:
    revision = checked(f"select updated_at from public.project_payments where id='{payment}';")
    payload = dict(id=payment, project_id=project, expected_updated_at=revision,
                   request_id='cb000000-0000-4000-8000-000000000011', payment_date='2026-11-03', amount='200', payment_method='Efectivo')
    first = held_mutation(rpc('edit_project_payment', payload))
    other = {**payload, 'request_id': 'cb000000-0000-4000-8000-000000000012', 'amount': '300'}
    second = sql(authorized + rpc('edit_project_payment', other))
    completed(first)
    assert second.returncode != 0 and 'cambió' in second.stderr, second.stderr
    assert checked(f"select amount=200 from public.project_payments where id='{payment}';") == 't'
    checked(authorized + rpc('edit_project_payment', payload))
    print('OK: concurrent edits reject stale revisions; replay is idempotent.')

    checked(authorized + f"select public.prepare_project_file('{receipt}','{project}','receipt','pago.png','image/png',100,'{payment}');")
    checked(f"insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{{\"size\":100,\"mimetype\":\"image/png\"}}'::jsonb from public.project_files where id='{receipt}';")
    checked(authorized + f"select public.finish_project_file('{receipt}');")
    checked(authorized + f"select public.prepare_project_file('{replacement}','{project}','receipt','nuevo.jpg','image/jpeg',100,payment_id,id,updated_at) from public.project_files where id='{receipt}';")
    checked(f"insert into storage.objects(bucket_id,name,metadata) select 'project-files',object_path,'{{\"size\":100,\"mimetype\":\"image/jpeg\"}}'::jsonb from public.project_files where id='{replacement}';")
    deletion = dict(id=payment, project_id=project, expected_updated_at=checked(f"select updated_at from public.project_payments where id='{payment}';"),
                    request_id='cb000000-0000-4000-8000-000000000013', reason='Duplicado')
    first = held_mutation(rpc('delete_project_payment', deletion))
    second = sql(authorized + f"select public.finish_project_file('{replacement}');")
    completed(first)
    assert second.returncode != 0 and 'Anticipo' in second.stderr, second.stderr
    assert checked(f"select status='ready' and not cleanup_complete from public.project_files where id='{receipt}';") == 't'
    assert checked(f"select paid=0 and balance=1000 from public.project_financial_summary where id='{project}';") == 't'
    print('OK: concurrent deletion blocks receipt replacement and preserves its current support.')
finally:
    checked(f"""
    {claim}
    select set_config('storage.allow_delete_query','true',false);
    delete from storage.objects where bucket_id='project-files' and name like 'PRY-PAYMENT-RACE/%';
    delete from public.project_files where project_id='{project}';
    delete from public.project_payments where project_id='{project}';
    delete from public.projects where id='{project}';
    delete from public.clients where id='{client}';
    delete from public.audit_log where actor_id='{actor}' or entity_id in ('{actor}','{client}','{project}','{payment}');
    delete from auth.users where id='{actor}';
    """)
