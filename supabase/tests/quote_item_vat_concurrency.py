"""Two real PostgreSQL connections. Run only against a disposable test database.

Set ELECPRO_TEST_DATABASE=true, standard PG* connection variables and optionally
PSQL_EXE. Requires the full migration history, SQL-owner privileges and psql.
Fixtures are deleted in finally; document counters advance in the test database.
"""
import concurrent.futures
import json
import os
import subprocess
import uuid

if os.environ.get("ELECPRO_TEST_DATABASE") != "true":
    raise SystemExit("Set ELECPRO_TEST_DATABASE=true for a disposable database.")

psql = os.environ.get("PSQL_EXE", "psql")
user_id, client_id, request_id = (str(uuid.uuid4()) for _ in range(3))
quote_id = None


def sql(statement):
    result = subprocess.run([psql, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
                            capture_output=True, text=True, encoding="utf-8", timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return [line for line in result.stdout.splitlines() if line.strip()]


claim = f"do $$ begin perform set_config('request.jwt.claim.sub','{user_id}',false); end $$;"
try:
    sql(f"""insert into auth.users(id,email,raw_user_meta_data) values('{user_id}','{user_id}@example.test','{{}}');
    insert into public.clients(id,name) values('{client_id}','VAT CONCURRENCY TEST');""")
    payload = json.dumps({"client_id": client_id, "request_id": request_id, "title": "VAT CONCURRENCY TEST",
                          "status": "approved", "issued_on": "2026-10-13", "valid_until": "2026-10-28",
                          "material_increase_pct": "10", "items": [{"description": "Conductor", "code": "MAT-TEST",
                          "category": "material", "quantity": "2", "unit": "UND", "base_unit_price": "100000", "vat_pct": "19"}]})
    quote_id = sql(claim + f"select (public.save_quote($payload${payload}$payload$::jsonb)).id;")[0]
    # Both sessions contend for the same quote row. The first holds the lock
    # briefly after converting, so the other must return the committed project.
    statement = claim + f"""begin; set local role authenticated;
    select (public.convert_quote_to_project('{quote_id}')).id; select pg_sleep(0.5); commit;"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(sql, [statement, statement]))
    assert results[0][0] == results[1][0], results
    checks = sql(f"""select count(*) from public.projects where quote_id='{quote_id}';
    select sum(amount) from public.project_budgets where project_id='{results[0][0]}';
    select project_value from public.projects where id='{results[0][0]}';""")
    assert checks == ["1", "238000.000000", "261800.000000"], checks
    print("PASS: concurrent conversions return one project; VAT cost=238000, commercial value=261800.")
finally:
    # Only exact fixture UUIDs created by this run are eligible for cleanup.
    sql(f"""begin;
    update public.quotes set project_id=null where client_id='{client_id}';
    update public.projects set quote_id=null where client_id='{client_id}';
    delete from public.project_budgets where project_id in (select id from public.projects where client_id='{client_id}');
    delete from public.projects where client_id='{client_id}';
    delete from public.quotes where client_id='{client_id}';
    delete from public.clients where id='{client_id}';
    delete from public.audit_log where actor_id='{user_id}';
    delete from auth.users where id='{user_id}'; commit;""")
