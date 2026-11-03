"""Full migration regression on two NEW disposable local PostgreSQL databases.

Requires a dedicated test cluster; roles anon/authenticated/service_role must
already exist. Uses PG* and PSQL_EXE, with local auth/storage test doubles.
Never points at the application's Supabase project.
"""
import os
import argparse
from pathlib import Path
import subprocess
import uuid

if os.environ.get('ELECPRO_TEST_DATABASE') != 'true':
    raise SystemExit('Set ELECPRO_TEST_DATABASE=true on a dedicated test cluster.')

root = Path(__file__).resolve().parents[2]
bootstrap = (root / 'supabase/tests/alert_view_bootstrap.sql').read_text(encoding='utf-8')
args = [os.environ.get('PSQL_EXE', 'psql'), '-X', '-w', '-v', 'ON_ERROR_STOP=1']


def run(database, *options, sql=None):
    result = subprocess.run(args + ['-d', database, *options], input=sql,
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--variant', choices=('text', 'numeric'), action='append')
variants = parser.parse_args().variant or ('text', 'numeric')

for variant in variants:
    database = f'alert_contract_{variant}_{uuid.uuid4().hex[:8]}'
    run('postgres', '-c', f'create database {database}')
    try:
        run(database, sql=bootstrap)
        for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
            if migration.name >= '20261103110000':
                break
            sql = migration.read_text(encoding='utf-8')
            if variant == 'numeric' and migration.name == '20261023100000_current_alerts.sql':
                # Model the deployed variant BEFORE any dependent objects exist.
                # Historical files on disk remain untouched.
                for expression in ('p.project_value', 'f.paid', 'f.withheld',
                                   'f.balance', 'f.budget', 'f.expenses'):
                    old = expression + '::text ' + expression.split('.')[1]
                    assert sql.count(old) == 1, old
                    sql = sql.replace(old, expression + '::numeric(18,6) '
                                      + expression.split('.')[1])
            run(database, sql=sql)
        run(database, '-f', str(root / 'supabase/tests/alert_view_contract.sql'))
        print(f'OK: {variant}: complete migration, column contract, dependencies, ACLs, '
              'payments, coverage, alerts, files, finance and RLS.', flush=True)
    finally:
        # Only the database created by this invocation is removed.
        run('postgres', '-c', f'drop database {database}')
