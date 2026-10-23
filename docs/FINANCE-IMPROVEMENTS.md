# Cotizaciones, gastos, retenciones y detalle de Análisis

Actualización del 22 de octubre de 2026.

## Comportamiento entregado

- Cotizaciones: Mostrar AIU afecta solo el documento; al desactivarlo, Costo directo + Administración + Imprevistos + Utilidad se presentan como Subtotal del servicio. El editor conserva todos los campos económicos. Ambos impuestos siguen separados.
- IVA sobre costo directo: opcional, inicialmente apagado, tasa editable inicial 19 %, rango 0–100 con dos decimales. Usa el costo comercial ajustado actual, incluyendo IVA por ítem e incremento de materiales. Se suma al IVA sobre utilidad; apagarlo conserva la tasa. La vista previa, impresión y proyecto convertido usan el mismo total. Ambas opciones quedan bloqueadas al convertir.
- Gastos: el selector ofrece únicamente Materiales, Mano de obra, Transporte, Terceros, Equipos, Alquiler de equipos, Herramientas, Viáticos y alimentación, Ingeniería y diseño, Permisos y certificaciones y Varios, en ese orden. Permite escribir otra categoría sin añadirla a las sugerencias. Conserva textos históricos y ya no consulta `expense_categories()`; el RPC permanece disponible para compatibilidad. Se elimina el texto de ayuda bajo el campo.
- Retenciones: en Anticipos y retenciones se registran fecha, tipo, valor manual y observación. Otra retención exige descripción. Se pueden registrar en proyectos existentes. Se corrigen anulando con motivo y creando otro registro; se conservan autor, fecha y auditoría. No son gastos ni efectivo recibido y no afectan ganancia ni distribuciones.
- Cartera: `max(0, valor − cobros − retenciones vigentes)`. El saldo se propaga a panel, proyectos, alertas, análisis, informes y CSV. El detalle y la exportación muestran retenciones por separado; las alertas prioritarias muestran el saldo real.
- Análisis: las 14 tarjetas de Gerencia, Comercial y Distribuciones abren tablas paginadas, con carga, error/reintento, estado vacío, enlaces y navegación por teclado. Los gráficos conservan sus acciones de filtrado.

Ejemplo: costo directo $1.000.000, A 8 %, I 3 %, U 10 %, IVA sobre utilidad 19 % e IVA sobre costo directo 19 % → subtotal $1.210.000 + $19.000 + $190.000 = **$1.419.000**.

## Contratos y seguridad

`save_quote` y `approve_and_convert_quote` conservan sus firmas. Sus payloads añaden `show_aiu` (booleano, true), `apply_direct_vat` (booleano, false) y `vat_direct_pct` (decimal en texto, 19). El servidor y PostgreSQL validan y normalizan el porcentaje. `vat_direct_amount numeric(18,6)` se calcula en PostgreSQL, nunca desde un total enviado por el navegador. Se mantiene el cálculo original del presupuesto por ítem durante la conversión.

`project_withholdings` usa `numeric(18,6)` y `request_id` obligatorio y único. Solo se concede SELECT autenticado con RLS de miembro activo. `register_project_withholding(payload)` y `void_project_withholding(p_id,p_reason)` verifican autorización, bloquean el proyecto y escriben auditoría. Registrar exige importe positivo con máximo dos decimales, no superior a la cartera disponible. Un reintento devuelve el mismo registro, incluso si luego fue anulado. Los pagos toman el mismo bloqueo mediante trigger; las actualizaciones del proyecto ya bloquean su fila. Se conserva el comportamiento previo de pagos excedentes: solo la retención nueva se rechaza cuando supera saldo.

`GET /api/analisis/detalle` exige cookie SSR válida y perfil activo, devuelve 401/403 para accesos no autorizados, 400 para parámetros inválidos y 500 para fallos de consulta. Usa `Cache-Control: private, no-store`. Parámetros:

| Parámetro | Valores |
|---|---|
| `metric` | `management.projectValue`, `.balance`, `.expenses`, `.profit`, `.projectedProfit`; `commercial.approvedValue`, `.validSent`, `.expired`, `.approval`; `distribution.result`, `.paid`, `.pending`, `.assigned`, `.available` |
| `page`, `pageSize` | Página positiva; tamaño 20, 50 o 100. Se ajusta al último rango válido al consultar. |
| Filtros | Los parámetros URL existentes de la pestaña activa, incluidos IDs y estados múltiples. Otras pestañas no interfieren. |

El RPC `analytics_metric_detail` devuelve `{metric,total,page,pageSize,unit,value,components,records}` desde una misma instantánea. Los registros discriminan `project`, `expense`, `quote` o `distribution`, y los importes viajan como texto decimal. El total considera todo el conjunto. Aprobación devuelve `value: null` si no hay decisiones; Disponible muestra ganancias por proyecto y asignaciones con signo negativo. El resultado de Distribuciones siempre usa el portafolio completo; sus asignaciones respetan filtros. El mes de Gerencia solo afecta caja y no limita sus tarjetas acumuladas.

## Aplicar en Supabase y desplegar

1. Revisar que estén aplicadas las migraciones anteriores hasta `20261013101000_quote_item_vat.sql`.
2. En un proyecto de pruebas, abrir SQL Editor y ejecutar completo `supabase/migrations/20261022100000_quote_options_withholdings_analytics.sql` una sola vez. Alternativamente, aplicar la migración con el historial de Supabase CLI ya configurado.
3. Verificar las pruebas SQL y los flujos de guardado, conversión, retenciones y Análisis indicados abajo.
4. En producción, aplicar el mismo archivo completo antes de desplegar la nueva aplicación. Su transacción crea columnas, tabla, vistas, funciones, índices, RLS y permisos, y recarga PostgREST.
5. Desplegar y recargar las pestañas abiertas. No se requieren variables de entorno nuevas: se mantienen URL y Publishable Key de Supabase; las funciones de negocio usan la sesión del usuario, sin clave de servicio.
6. Comprobar con usuarios activos de ambos roles: guardar/reabrir una cotización con ambas opciones, convertirla, registrar/anular una retención y abrir las tarjetas filtradas. Un perfil inactivo y `anon` deben quedar bloqueados.

La migración agrega defaults compatibles a cotizaciones existentes y deja retenciones vacías. No ejecuta UPDATE sobre datos de negocio históricos ni recalcula sus importes. La app anterior puede seguir usando los contratos existentes durante el despliegue; las funciones anteriores de listado se conservan. El nuevo cliente usa `analytics_management_detail_page` para incluir la columna retenida.

## Pruebas reproducibles

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/finance-improvements.spec.ts tests/charts/quote-editor.spec.ts tests/charts/quote-print.spec.ts
```

En una **base de pruebas** con el historial aplicado, ejecutar con el dueño SQL:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/finance_improvements.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_item_vat.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_navigation.sql
```

Estos archivos revierten sus fixtures con ROLLBACK. `finance_improvements.sql` concilia las 14 tarjetas con los RPC existentes usando varios filtros; verifica páginas completas, fórmulas manuales, importes negativos, ausencia de decisiones, límites, anulación, auditoría y permisos.

Para verificar el historial: en otra base desechable migrada hasta `20261013101000`, ejecutar `finance_history_before.sql`, aplicar la migración nueva y ejecutar `finance_history_after.sql`. Se comparan filas completas, incluidos totales, instantáneas y auditoría de actualización, tanto de una cotización convertida como de un borrador. Estos fixtures permanecen solo en esa base desechable.

Para concurrencia:

```powershell
$env:ELECPRO_TEST_DATABASE='true'
# Configurar PGHOST, PGPORT, PGUSER, PGDATABASE y credenciales de una base desechable.
# Opcional: PSQL_EXE con la ruta de psql si no está en PATH.
python supabase/tests/withholdings_concurrency.py
python supabase/tests/quote_item_vat_concurrency.py
```

Las pruebas crean UUID propios y limpian únicamente sus fixtures. Comprueban competencia por saldo, solicitudes repetidas, pago concurrente y conversión idempotente. No usar estas pruebas en producción.

La validación local usa PostgreSQL 16 real con un esquema mínimo que simula identidad de Supabase Auth. Playwright usa componentes de producción con acciones y respuestas de red simuladas. La aplicación de esta migración en Supabase remoto y el despliegue de producción se realizan mediante los pasos anteriores.

Resultado local: 133 pruebas unitarias y 39 pruebas de navegador aprobadas; SQL/RLS, historial completo y pruebas de dos conexiones aprobadas. También se verificaron TypeScript, lint, build de producción, capturas de escritorio/móvil y las 12 combinaciones PDF de Carta/A4, orientación y tamaño de letra.


## Cobertura de proyectos — actualización posterior

`Cubierto = anticipos + retenciones vigentes`. El saldo sigue siendo `max(0, valor − cubierto)`; caja, cobros, gastos, resultados y distribuciones conservan su significado. La suma usa Decimal, no aritmética binaria, y no se almacena otro importe derivado.

Panel, tarjetas de proyectos y resumen muestran cobertura e importe con el desglose de anticipos y retenciones. Las tablas de Análisis, detalle de cartera, informe y CSV incluyen Cubierto. En el CSV, Pagado pasa a llamarse Anticipos y se agrega Cubierto entre Retenciones y Saldo (11 columnas). Las barras se limitan visualmente a 100 %, conservando el porcentaje textual real si hay excedentes; para valor cero muestran No calculable. Anular retenciones restaura la cartera y reduce la cobertura.

Aplicar `supabase/migrations/20261022120000_project_coverage.sql` después de `20261022110000_quote_direct_discount.sql` y antes del nuevo despliegue. Agrega `withheld` a `dashboard_snapshot.recent_projects` y conserva la autorización, filtros, firma y permisos; no modifica registros históricos. No hay nuevas variables de entorno. En Supabase SQL Editor ejecutar el archivo completo una vez, o usar el historial de migraciones habitual.

Validación específica:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/finance-improvements.spec.ts tests/charts/project-coverage.spec.ts
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/project_coverage.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/finance_improvements.sql
```

Los SQL requieren una base de pruebas y revierten sus registros con ROLLBACK. Las fixtures de navegador usan componentes y páginas de producción con consultas/acciones simuladas; permiten revisar Panel, Proyectos, Análisis, detalle e impresión sin conexión remota.

Resultado local de esta actualización: 161 pruebas unitarias y 22 pruebas de navegador aprobadas; tipos, lint y compilación de producción aprobados. La migración completa y los SQL de cobertura y mejoras financieras se ejecutaron correctamente en PostgreSQL 16 local con Auth simulado, incluyendo permisos, cuatro tipos de retención, anulaciones, cartera y distribuciones. Se revisaron capturas de escritorio/móvil y la vista de impresión; se generó el PDF de prueba. La instancia local quedó detenida. La migración no se ha aplicado al Supabase remoto ni se ha desplegado la aplicación.
