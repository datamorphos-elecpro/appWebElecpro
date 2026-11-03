# Anticipos, aprobación y cartera

## Despliegue

Aplicar, en este orden y antes de desplegar la aplicación:

1. `supabase/migrations/20261103100000_pending_project_status.sql` después de `20261029100000_project_files.sql`. Ejecutar el archivo completo y dejar que termine su `COMMIT`.
2. `supabase/migrations/20261103110000_payment_management_pending_finance.sql` en una ejecución separada. El nuevo valor del enum debe estar confirmado antes de usarlo en vistas y funciones.
3. Desplegar la aplicación. No se requieren variables de entorno nuevas ni `service_role`.

En Supabase SQL Editor, ejecutar cada archivo en una consulta separada; no envolver ambos en una sola transacción. Con CLI, conservar las dos migraciones y su orden. No volver a ejecutar archivos ya aplicados.

Las migraciones no reclasifican proyectos, recalculan cotizaciones ni cambian importes históricos. Los anticipos anteriores comienzan vigentes; los campos de eliminación son nulos.

### Reintentar tras el error de tipos de alertas

La segunda migración conserva ahora la definición desplegada de `project_active_alerts` mediante `pg_get_viewdef` y la envuelve con un filtro por `project_id` para excluir `pending_approval`. Mantiene nombres, orden y tipos de columnas, incluidos importes `text` o `numeric(18,6)`, identidad, permisos, `security_invoker` y dependencias existentes; no elimina la vista ni modifica sus cálculos.

Si se ejecutó el segundo archivo completo con su `BEGIN`, el error de tipos aborta la transacción y revierte esa migración. Si la sesión continúa en una transacción fallida, ejecutar `ROLLBACK` antes del reintento.

Tras corregir y validar el archivo, ejecutar nuevamente **solo `supabase/migrations/20261103110000_payment_management_pending_finance.sql` completo**, incluidos `BEGIN` y `COMMIT`. **No repetir `20261103100000_pending_project_status.sql` si ya terminó correctamente.**

Si se ejecutaron fragmentos fuera de la transacción, inspeccionar primero los objetos creados: columnas y restricciones de `project_payments`, vistas `active_project_payments` y `financial_projects`, definición y contrato de `project_active_alerts`, funciones, políticas y permisos. Compararlos con el archivo y resolver el estado parcial antes de reintentar; no asumir que hubo rollback ni eliminar dependencias con `CASCADE`.

## Cambiar proyectos existentes

1. Entrar a **Proyectos** y abrir el proyecto que aún no tiene aprobación.
2. Pulsar **Editar proyecto**.
3. En **Estado**, seleccionar **Pendiente por aprobar**.
4. Pulsar **Guardar proyecto** y confirmar **Guardar cambios**.
5. Comprobar el estado y el aviso de exclusión en el detalle.
6. Consultar **Panel general**, **Análisis → Gerencia y rentabilidad** y **Alertas**: el proyecto no debe contribuir a sus totales financieros ni generar alertas.
7. Repetir individualmente con los demás proyectos pendientes.
8. Cuando el cliente apruebe, editar nuevamente y seleccionar **Aprobado**. Sus cifras y movimientos se incorporan con las fechas originales.

El estado no altera la cotización de origen, fechas, importes o documentos. Los proyectos pendientes permanecen en el listado, recientes, detalle y conteos por estado de Operación; no son proyectos activos ni retrasados. Se permite registrar anticipos, gastos, presupuesto, retenciones y distribuciones mientras están pendientes. El detalle conserva sus cifras individuales con el aviso de exclusión.

## Reglas financieras

- `financial_projects` es una vista `security_invoker` que excluye únicamente `pending_approval`. Las reglas de los otros estados se conservan.
- Gerencia, caja, cartera, rentabilidad, informes, desgloses y base de distribuciones generales usan el conjunto contabilizable. El inventario y Operación conservan los pendientes. Los segmentos financieros y de retrasos del listado los excluyen.
- `active_project_payments` excluye anticipos eliminados. La RLS también oculta esos registros ante consultas directas con sesión autenticada. Solo los RPC autorizados crean, editan y eliminan anticipos; no se concede INSERT/UPDATE/DELETE directo a `authenticated`.
- **Ganancia menos cartera** = ganancia actual consolidada − cartera pendiente consolidada, con aritmética decimal y sin recortar negativos. Conserva la deducción de gastos y distribuciones pagadas del cálculo actual. Las próximas finalizaciones siguen disponibles en Alertas.
- **Total de Cartera** usa el agregado completo de Gerencia según cliente, proyecto y estado. No depende de la página ni del periodo de caja. Sin resultados muestra cero. La tabla y el informe impreso usan **Cartera Pendiente**.

## Editar y eliminar anticipos

En **Proyecto → Anticipos y retenciones**, usar **Editar** para corregir fecha, monto, medio de pago y observación y confirmar. El soporte se gestiona con las acciones existentes de agregar, reemplazar y quitar.

**Eliminar** exige un motivo y confirmación. El movimiento deja de sumar a pagos, cobertura y caja; se recalcula la cartera. Gastos, retenciones y ganancia conservan sus fórmulas. Se guardan `deleted_at`, `deleted_by`, `delete_reason` y las instantáneas de auditoría; no hay restauración ni historial visible en esta versión.

Los cambios bloquean la fila del proyecto y verifican la revisión del anticipo. Los reintentos de la última solicitud son idempotentes; una revisión antigua o una solicitud reutilizada con otros datos se rechaza. Ante un conflicto, actualizar el proyecto y revisar el registro antes de repetir la acción.

El soporte vigente del anticipo eliminado se conserva en Storage sin marcarlo para limpieza. RLS, las funciones de archivos y las políticas de Storage bloquean su consulta y modificación ordinarias. Los enlaces firmados emitidos previamente conservan su vencimiento de 60 segundos. La infraestructura puede consultar los registros conservados para auditoría; no debe eliminarlos manualmente.

Soportes admitidos: **.pdf, .jpg, .jpeg y .png**, un archivo opcional por anticipo, máximo **10.485.760 bytes (10 MB)**. Se conservan carga TUS, vista previa y descarga. Se valida extensión, tamaño y MIME canónico según el contrato existente; no se añade antivirus ni análisis del contenido.

## Validación

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/payment-management.spec.ts tests/charts/project-files.spec.ts tests/charts/project-coverage.spec.ts tests/charts/management-report.spec.ts
```

En una base aislada de pruebas con todas las migraciones aplicadas:

```powershell
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/payment_management_pending_finance.sql
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/project_files.sql
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/current_alerts.sql
```

El primer script termina con ROLLBACK y cubre imágenes, límites, estados, fórmulas, caja, desgloses, RLS, auditoría, reintentos, revisiones antiguas y un reemplazo preparado antes de eliminar el anticipo. Las pruebas reales de TUS/Storage siguen siendo optativas según `PROJECT-FILES.md`; las pruebas de PostgreSQL con metadatos simulados no sustituyen esa integración.

La concurrencia real se verifica en dos sesiones con `supabase/tests/payment_management_concurrency.py`. Configurar `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PSQL_EXE` si hace falta y `ELECPRO_TEST_DATABASE=true`. Usar exclusivamente una base desechable: el script confirma fixtures con IDs reservados `cb` y los retira al terminar.

### Regresión del contrato de la vista

En un clúster PostgreSQL local exclusivo de pruebas, con permisos para crear bases y roles `anon`, `authenticated` y `service_role` ya existentes:

```powershell
# Configurar PGHOST, PGPORT, PGUSER y PSQL_EXE para ese clúster local.
$env:ELECPRO_TEST_DATABASE='true'
python supabase/tests/alert_view_contract.py
```

El script crea y elimina únicamente dos bases nuevas de su ejecución. Aplica el historial previo en cada una y modela los importes de alertas como `text` y `numeric(18,6)` sin editar archivos históricos. Usa dobles locales de Auth/Storage (`alert_view_bootstrap.sql`), no servicios reales. `alert_view_contract.sql` captura columnas (nombre, posición, tipo, precisión y escala), OID, propietario, ACL, opciones y dependencias antes de aplicar **completa** la migración corregida. Comprueba que se conservan y ejecuta las suites SQL de anticipos, cobertura/cartera, alertas, archivos y finanzas, incluidas sus verificaciones RLS. Las dependencias entrantes se comparan exactamente; las salientes originales deben permanecer, pudiendo añadirse la relación del filtro con `projects`.
