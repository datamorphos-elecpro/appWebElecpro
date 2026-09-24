-- Limpieza manual de TODOS los datos de negocio de Elecpro.
-- No forma parte de las migraciones automáticas: ejecutar el archivo completo
-- en Supabase SQL Editor con el rol postgres, después de respaldar los datos.
-- Detener temporalmente las escrituras de la aplicación durante la ejecución.
--
-- Conserva: auth, profiles, company_settings, audit_log, document_counters y
-- catalog_code_counters. Los consecutivos continúan para no reutilizar números.
-- También limpia los manifiestos privados de demostración ya sin datos asociados.
--
-- PRUEBA: ejecutar sin cambios; devuelve los conteos y revierte la limpieza.
-- APLICAR: reemplazar únicamente el ROLLBACK final por COMMIT y ejecutar TODO.
-- Después de COMMIT, recuperar los datos requiere restaurar el respaldo.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- El bloqueo evita escrituras entre el conteo y la limpieza. Si no se puede
-- obtener o aparece una dependencia externa, se cancela toda la transacción.
lock table
  public.clients,
  public.suppliers,
  public.catalog_items,
  public.quotes,
  public.quote_items,
  public.projects,
  public.project_payments,
  public.project_expenses,
  public.project_budgets,
  public.project_shares,
  public.portfolio_shares,
  private.demo_batches,
  private.demo_manifest
in access exclusive mode;

do $$
declare
  v_table text;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
begin
  foreach v_table in array array[
    'public.clients', 'public.suppliers', 'public.catalog_items',
    'public.quotes', 'public.quote_items', 'public.projects',
    'public.project_payments', 'public.project_expenses',
    'public.project_budgets', 'public.project_shares',
    'public.portfolio_shares', 'private.demo_batches', 'private.demo_manifest'
  ] loop
    execute format('select count(*) from %s', v_table::regclass) into v_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  end loop;

  -- Una sola sentencia resuelve las referencias circulares cotización/proyecto.
  -- RESTRICT impide borrar tablas ajenas por cascada. No se deshabilitan RLS,
  -- restricciones ni triggers. TRUNCATE no ejecuta triggers de DELETE por fila;
  -- por eso se registra abajo una entrada de auditoría de la operación completa.
  truncate table
    public.clients,
    public.suppliers,
    public.catalog_items,
    public.quotes,
    public.quote_items,
    public.projects,
    public.project_payments,
    public.project_expenses,
    public.project_budgets,
    public.project_shares,
    public.portfolio_shares,
    private.demo_batches,
    private.demo_manifest
  continue identity restrict;

  insert into public.audit_log (
    actor_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    null, 'business_data_reset', null, 'update', v_counts,
    jsonb_build_object(
      'operation', 'truncate_business_data',
      'database_user', current_user,
      'session_user', session_user,
      'script', 'manual/03_clear_business_data.sql'
    )
  );
end $$;

-- Resumen de esta ejecución (también visible en el ensayo con ROLLBACK).
select before_data as filas_eliminadas_por_tabla, after_data as operacion
from public.audit_log
where entity_type = 'business_data_reset'
order by id desc
limit 1;

rollback;
