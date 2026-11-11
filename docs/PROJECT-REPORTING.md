# Costo directo, AIU y facturas por proyecto

## Despliegue

1. Aplicar las migraciones anteriores, incluida `20261110100000_quote_labor_increase.sql`.
2. Ejecutar una sola vez `supabase/migrations/20261111100000_project_reporting_details.sql` mediante el historial habitual o Supabase SQL Editor.
3. Desplegar la aplicación después de la migración. No requiere variables nuevas ni service_role.

La función de lectura `project_reporting_details(uuid[])` usa RLS y security invoker. Solo miembros activos pueden obtener datos. Devuelve importes como cadenas decimales y facturas vigentes con identificador, nombre y MIME. No modifica datos históricos.

Costo directo = direct_cost − direct_discount_amount de la cotización. Total AIU = administración + imprevistos + utilidad + IVA sobre utilidad, incluso con AIU oculto; no incluye IVA directo. Sin cotización, costo directo equivale al valor actual del proyecto y AIU es cero. Editar el valor de un proyecto cotizado conserva los importes originales.

Las facturas son adjuntos ready con tipo normalizado Factura Electrónica. Se ordenan por created_at descendente e id ascendente. PDF y JPG/PNG comparten el visor existente y las URLs firmadas de 60 segundos. Otros formatos ofrecen descarga. El informe imprime nombres con viñetas.

## Verificación

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/project-reporting.spec.ts tests/charts/project-coverage.spec.ts tests/charts/project-files.spec.ts
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/project_reporting_details.sql
```

Ejecutar SQL únicamente en una base de pruebas migrada; los fixtures terminan con ROLLBACK. Verificar también carga, reclasificación, reemplazo y retiro desde el proyecto y volver a Análisis/informe para comprobar la actualización.
