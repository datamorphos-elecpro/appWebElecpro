# Cotizaciones, impresión y navegación

La interfaz usa fecha de creación para ordenar las cotizaciones; admite coma o punto en precio base y guarda unidades en mayúsculas. El tamaño de impresión es una preferencia del navegador y no altera las instantáneas de cotizaciones convertidas.

## Aplicación de la migración

1. Aplicar todas las migraciones anteriores en orden.
2. Ejecutar `supabase/migrations/20261002100000_quote_inputs_print_navigation.sql` mediante el flujo habitual de migraciones, o pegar su contenido completo en Supabase SQL Editor una sola vez.
3. Desplegar el código después de que la migración termine correctamente. La migración recarga el esquema de PostgREST.
4. Verificar Cotizaciones y Proyectos con un miembro activo. Probar las tarjetas «Propuestas vigentes», «Activos» y «Cartera pendiente» y quitar sus filtros.

La migración sustituye `quotes_page` por una firma con `p_segment` opcional al final: las llamadas anteriores de seis argumentos siguen siendo válidas. Añade `projects_list_page`, un índice por creación y triggers de normalización. No actualiza filas históricas de forma masiva. Las consultas nuevas son `security invoker`, respetan RLS y no conceden ejecución a `anon`.

## Comportamientos relevantes

- Precio base: máximo 12 dígitos enteros y dos decimales. Ejemplos: `1250,50` y `1250.50`. No usar separadores de miles. Un separador final se completa al perder foco; una entrada inválida no se envía para guardar.
- Unidades: se transforman mientras se escribe, al incorporar catálogo y recuperar borradores; servidor y triggers repiten la normalización.
- Impresión: compacto (9/8/11 pt), normal (10/9/12 pt) y grande (12/10/14 pt), para contenido/tablas/títulos. `elecpro:quote-print-size:v1` recuerda la elección. Sin almacenamiento disponible, la selección funciona durante la sesión.
- Segmentos URL de cotizaciones: `valid`, `decided`. Segmentos de proyectos: `active`, `paid`, `receivable`, `expenses`, `delayed`, `ending_soon`. Se intersectan con estado y búsqueda y se conservan al paginar. Las métricas permanecen globales.
- Cartera usa saldo positivo, incluidos borradores y cancelados. Retrasos y finalizaciones próximas reproducen las reglas actuales del panel y la fecha de Bogotá.

## Validación

```powershell
npm test
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/quote-print.spec.ts
npx playwright test tests/visual/quote-navigation.spec.ts
```

La prueba aislada de impresión no requiere Supabase: verifica tamaños, persistencia, almacenamiento bloqueado y emisión exclusiva del documento a 1440, 900, 680 y 380 px; genera capturas y PDF en `test-results/`.

La prueba autenticada requiere `E2E_TEST_ENVIRONMENT=true`, `E2E_TEST_EMAIL` y `E2E_TEST_PASSWORD`, además de una base de pruebas con las migraciones aplicadas. Cubre navegación por teclado desde todas las métricas, filtros compartibles, regreso desde el detalle y entrada de precio/unidad en catálogo. Se omite si no existen credenciales.

Ejecutar `supabase/tests/quote_navigation.sql` únicamente en una base Supabase de pruebas, desde SQL Editor o con `psql` como propietario de la base. Crea fixtures dentro de una transacción y termina con `ROLLBACK`: cubre orden, desempates, paginación, segmentos, centavos, conversión idempotente, bloqueo de cotizaciones convertidas, usuario activo/inactivo y acceso anónimo. No se ha ejecutado en la base remota de la aplicación.

Antes de publicar, ejecutar esta prueba SQL y las pruebas autenticadas en el entorno de pruebas; verificar también una cotización real de varias páginas en la vista previa de impresión del navegador.
