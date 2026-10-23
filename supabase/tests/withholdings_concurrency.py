"""Run only on a disposable migrated database (ELECPRO_TEST_DATABASE=true).

Uses standard PG* variables and optional PSQL_EXE. All fixture UUIDs are unique
to this run. No external Python packages are required.
"""
import concurrent.futures
import json
import os
import subprocess
import uuid

if os.environ.get('ELECPRO_TEST_DATABASE') != 'true':
    raise SystemExit('Set ELECPRO_TEST_DATABASE=true for a disposable database.')
psql = os.environ.get('PSQL_EXE', 'psql')
actor, client = (str(uuid.uuid4()) for _ in range(2))
projects = [str(uuid.uuid4()) for _ in range(3)]
claim = f"do $$ begin perform set_config('request.jwt.claim.sub','{actor}',false); end $$;"
args = [psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']


def sql(statement, expected=True):
    result = subprocess.run(args + ['-c', statement], capture_output=True, text=True, encoding='utf-8', timeout=30)
    if expected and result.returncode:
        raise RuntimeError(result.stderr)
    return result


def register(project, amount, request=None, hold=False):
    payload = json.dumps({'project_id': project, 'amount': str(amount), 'request_id': request or str(uuid.uuid4()),
                          'kind': 'income', 'withholding_date': '2026-10-22'})
    return claim + f"begin; set local role authenticated; select (public.register_project_withholding($p${payload}$p$)).id;" + ('select pg_sleep(0.4);' if hold else '') + 'commit;'


try:
    sql(f"insert into auth.users(id,email,raw_user_meta_data) values('{actor}','{actor}@example.test','{{}}');"
        f"insert into public.clients(id,name) values('{client}','WITHHOLDING CONCURRENCY TEST');")
    for project in projects:
        sql(f"""insert into public.projects(id,quote_number,client_id,title,project_value,status,responsible,location,start_date,expected_end_date)
          values('{project}','PRY-{project}','{client}','Concurrency test',100,'approved','','',current_date,current_date+30);""")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda statement: sql(statement, expected=False),
                                    [register(projects[0], 60, hold=True), register(projects[0], 60, hold=True)]))
    assert sorted(r.returncode == 0 for r in results) == [False, True], [r.stderr for r in results]
    assert sql(f"select withheld::int||':'||balance::int from public.project_financial_summary where id='{projects[0]}';").stdout.strip() == '60:40'

    request = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(sql, [register(projects[1], 20, request, True)] * 2))
    assert results[0].stdout.strip() == results[1].stdout.strip()
    assert sql(f"select count(*) from public.project_withholdings where project_id='{projects[1]}';").stdout.strip() == '1'

    # Hold a real payment transaction, then attempt a withholding while it is
    # uncommitted. The trigger must make the second connection wait and reread.
    payment = claim + f"""begin; set local role authenticated;
      insert into public.project_payments(project_id,payment_date,amount,payment_method)
      values('{projects[2]}',current_date,80,'Transferencia');
      select 'locked'; select pg_sleep(0.8); commit;"""
    process = subprocess.Popen(args + ['-c', payment], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    assert process.stdout.readline().strip() == 'locked'
    result = sql(register(projects[2], 60), expected=False)
    _, error = process.communicate(timeout=30)
    assert process.returncode == 0, error
    assert result.returncode != 0 and 'cartera' in result.stderr, result.stderr
    assert sql(f"select paid::int||':'||withheld::int||':'||balance::int from public.project_financial_summary where id='{projects[2]}';").stdout.strip() == '80:0:20'
    print('PASS: concurrent limit, request deduplication and payment/withholding serialization.')
finally:
    project_list = ','.join("'" + project + "'" for project in projects)
    sql(f"""begin;
      delete from public.project_withholdings where project_id in ({project_list});
      delete from public.project_payments where project_id in ({project_list});
      delete from public.projects where id in ({project_list});
      delete from public.clients where id='{client}';
      delete from public.audit_log where actor_id='{actor}';
      delete from auth.users where id='{actor}'; commit;""")
