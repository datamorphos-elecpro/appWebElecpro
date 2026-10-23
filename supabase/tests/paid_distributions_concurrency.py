"""Run only on a disposable migrated database with ELECPRO_TEST_DATABASE=true.
Uses PG* connection variables and optional PSQL_EXE; fixture SQL uses reserved ab* IDs.
"""
import os
import subprocess
import time
from pathlib import Path

if os.environ.get('ELECPRO_TEST_DATABASE') != 'true':
    raise SystemExit('Set ELECPRO_TEST_DATABASE=true for a disposable database.')
args = [os.environ.get('PSQL_EXE', 'psql'), '-X', '-At', '-v', 'ON_ERROR_STOP=1']
claim = "select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',false);"
project = 'ab000000-0000-4000-8000-000000000003'
share_a = 'ab000000-0000-4000-8000-000000000004'
share_b = 'ab000000-0000-4000-8000-000000000005'

def sql(statement):
    return subprocess.run(args + ['-c', statement], capture_output=True, text=True, encoding='utf-8', timeout=30)

def pay(share):
    return f"select public.settle_project_shares('{project}',array['{share}'::uuid],current_date);"

setup = Path(__file__).with_name('paid_project_distributions.sql').read_text('utf-8')
setup = setup.split('reset role;')[0] + 'commit;'
r = sql(setup)
assert r.returncode == 0, r.stderr
try:
    r = sql(claim + f"select public.settle_project_shares('{project}',array['{share_b}'::uuid],null,true);update public.project_shares set value=600 where id='{share_b}';")
    assert r.returncode == 0, r.stderr
    first = subprocess.Popen(args + ['-c', claim + 'begin;' + pay(share_a) + 'select pg_sleep(2);commit;'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.5)
    second = sql(claim + pay(share_b))
    _, err = first.communicate(timeout=30)
    assert first.returncode == 0, err
    assert second.returncode != 0 and 'ganancia disponible' in second.stderr, second.stderr
    r = sql(f"select real_profit,paid_distributions from public.project_financial_summary where id='{project}';")
    assert '400.000000|600.000000' in r.stdout, r.stdout
    print('OK: concurrent excess rejected; profit 400; paid distributions 600.')
finally:
    r = sql(f"delete from public.project_shares where project_id='{project}';delete from public.projects where id='{project}';delete from public.clients where id='ab000000-0000-4000-8000-000000000002';delete from public.audit_log where actor_id='ab000000-0000-4000-8000-000000000001';delete from auth.users where id='ab000000-0000-4000-8000-000000000001';")
    assert r.returncode == 0, r.stderr
