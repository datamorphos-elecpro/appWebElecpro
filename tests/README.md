# Pruebas de integración y RLS

Los soportes y adjuntos de proyectos se verifican con las pruebas `project-files`, `project-file-route`, `project-file-upload`, el navegador `tests/charts/project-files.spec.ts` y `supabase/tests/project_files.sql`. La prueba real de Storage es optativa. Consulte [configuración, despliegue y recuperación](../docs/PROJECT-FILES.md).

El descuento porcentual/fijo se verifica con `tests/quote-discount.test.ts`, `tests/charts/quote-discount.spec.ts` y `supabase/tests/quote_direct_discount.sql`. Consulte [QUOTE-DIRECT-DISCOUNT](../docs/QUOTE-DIRECT-DISCOUNT.md) para despliegue y comprobación de conservación histórica.

Las unitarias se ejecutan con `npm test`. Para integración, aplique la migración a un proyecto de pruebas y ejecute los casos definidos en `.agents/05-implementacion-y-pruebas.md`: usuarios anónimo, activo, administrador e inactivo; RPC concurrente de conversión; y acceso directo bloqueado a auditoría y contadores. Las credenciales nunca se incorporan al repositorio.

Las pruebas de IVA y categorías están en `supabase/tests/quote_item_vat.sql` y `supabase/tests/quote_item_vat_concurrency.py`. Consulte [preparación y comandos](../docs/QUOTE-ITEM-VAT.md). El editor puede probarse sin Supabase con `npx playwright test --config playwright.charts.config.ts tests/charts/quote-editor.spec.ts`; las acciones se simulan y los componentes son los de producción.

Las opciones AIU/IVA, categorías de gastos, retenciones y los 14 desgloses de métricas tienen pruebas unitarias, de endpoint, SQL/RLS, historial, concurrencia y navegador. Consulte [FINANCE-IMPROVEMENTS](../docs/FINANCE-IMPROVEMENTS.md) para la preparación y los comandos. Las fixtures usan componentes de producción y acciones simuladas; las reglas transaccionales se verifican por separado en PostgreSQL real.

La cobertura y las categorías fijas se validan con `tests/project-coverage.test.ts`, `tests/charts/project-coverage.spec.ts` y `supabase/tests/project_coverage.sql`; ejecutar después de la migración `20261022120000`. Las páginas de producción se renderizan con consultas simuladas en `coverage-pages.html`; las capturas y el PDF se guardan en `test-results`.

## Anticipos y aprobación, noviembre de 2026

Aplicar las dos migraciones `20261103` antes de las pruebas SQL. `payment_management_pending_finance.sql` verifica RLS, eliminación lógica, auditoría, imágenes, estados y métricas. `payment_management_concurrency.py` comprueba dos sesiones reales con las variables `PG*`, `PSQL_EXE` opcional y `ELECPRO_TEST_DATABASE=true`, exclusivamente en una base desechable. Las pruebas de navegador están en `payment-management.spec.ts`. Ver [contrato y despliegue](../docs/PAYMENT-MANAGEMENT-AND-APPROVAL.md).
