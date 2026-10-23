# Distribuciones pagadas y tablas financieras

Las nuevas distribuciones de proyectos y generales se registran como valores fijos. Solo las pagadas por proyecto reducen la ganancia actual. Se suman sus importes congelados; reabrir restaura la ganancia. Gastos operativos, caja, presupuesto, cartera y resultado proyectado conservan sus formulas.

## Instalacion

1. Aplicar las migraciones anteriores hasta `20261022120000_project_coverage.sql`.
2. Revisar pagos incompletos: `select id,project_id,participant from public.project_shares where is_paid and paid_amount is null;`. Corregir manualmente los importes documentados antes de continuar; la migracion rechaza estos registros y muestra sus IDs.
3. Ejecutar completo `supabase/migrations/20261022130000_paid_project_distributions.sql` una sola vez en Supabase SQL Editor, antes de desplegar la aplicacion.
4. Desplegar y recargar las vistas. No se requieren nuevas variables de entorno.

Se conserva el historial y los contratos existentes. El nuevo RPC `analytics_management_financial_page` agrega `paid_distributions` al detalle de Gerencia. Los resumenes y el detalle de metricas incorporan esa columna decimal; `real_profit` es neto de distribuciones del proyecto pagadas. El CSV agrega Distribuciones pagadas antes de Ganancia (12 columnas).

Los porcentajes historicos pendientes de proyectos se calculan sobre ganancia anterior a las distribuciones, sin modificar pagos congelados. Las nuevas inserciones porcentuales se rechazan en PostgreSQL y Server Actions. El pago por lote bloquea el proyecto, valida el total y rechaza excesos sin pagos parciales; los gastos toman el mismo bloqueo. Un reintento de un pago ya liquidado informa estado incompatible, sin deducir dos veces.

El buscador de proyectos incluye cliente, titulo y numero, normalizados. Resultado financiero y Ejecucion presupuestal intercambian posiciones en Gerencia e informe. Las tablas priorizan importes completos y alineados a la derecha; la pantalla permite desplazamiento interno.

## Validacion local

- 163 pruebas unitarias aprobadas; TypeScript, lint y build de produccion aprobados.
- 28 casos de navegador aprobados inicialmente y el caso restante (14 metricas) aprobado al repetirlo; incluye vistas de 380/680/900/1440 px y PDFs Carta/A4.
- Historial completo de migraciones aplicado en PostgreSQL 16 aislado con Auth simulado.
- `supabase/tests/paid_project_distributions.sql`: liquidacion, limite exacto, reapertura, busqueda normalizada, rechazo de porcentajes y contratos financieros verificados.
- Dos conexiones compitiendo por pagos de 600 sobre ganancia 1000: un pago confirmado, otro rechazado; ganancia final 400 y distribuciones pagadas 600.

Comandos: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npx playwright test --config playwright.charts.config.ts tests/charts/finance-improvements.spec.ts tests/charts/quote-print.spec.ts` y `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/paid_project_distributions.sql` contra una base de pruebas.

La migracion no se ha aplicado al Supabase remoto y la aplicacion no se ha desplegado.

Concurrencia reproducible: en una base desechable migrada, configurar las variables PG*, PSQL_EXE si aplica y ELECPRO_TEST_DATABASE=true; ejecutar `python supabase/tests/paid_distributions_concurrency.py`. El script reserva IDs ab*, comprueba dos conexiones y limpia solo sus fixtures.

Verificacion final adicional: las 12 variantes PDF pasaron con importes monetarios alineados a la derecha y cantidades centradas. La instancia PostgreSQL local de pruebas quedo detenida.
