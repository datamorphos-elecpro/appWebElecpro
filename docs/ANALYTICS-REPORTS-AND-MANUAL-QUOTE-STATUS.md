# Proyectos, informes y estados explícitos de cotización

Actualización del 4 de noviembre de 2026.

## Comportamiento

- Soportes y adjuntos comparten un área para arrastrar un archivo. Seleccionar o arrastrar no inicia la carga: se conserva Guardar y su confirmación. Los errores no retiran una selección válida. Se rechazan carpetas, múltiples archivos, formatos no permitidos y tamaños excesivos. Permanecen los límites de 10 MB para soportes y 50 MB para adjuntos, el botón accesible, carga TUS y auditoría existentes.
- El encabezado del proyecto incluye Gastos reales, tomado del consolidado financiero completo. La constante `SHOW_PROJECTED_PROFIT` en `ProjectWorkspace` está desactivada: solo oculta ese dato en el resumen del proyecto. Su cálculo y los indicadores de Análisis siguen disponibles.
- Cada modal de las cinco métricas de Gerencia ofrece **Imprimir como PDF**. La vista previa conserva la página del modal al cerrarla y permite reintentar una lectura fallida. Imprimir se habilita cuando se cargó el documento completo.
- Los informes contienen logo, fecha de Bogotá, filtros, resumen, gráficos con escala común, todos los registros y subtotales. Usan Carta horizontal, encabezados repetidos y resultados negativos con eje cero. Cartera agrupa por cliente; gastos, por proyecto; los otros informes, por cliente. Los clientes se distinguen por UUID aunque sus nombres coincidan.
- El periodo de caja no limita las métricas acumuladas ni sus informes. `pending_approval` continúa excluido de Gerencia y conservado en Operación.
- Operación ordena los estados por cantidad descendente, con desempate por orden de estados. El gráfico de cronograma y su selector filtran proyectos activos (`approved`, `in_progress`, `paused`) entre atrasados, próximos a finalizar desde hoy hasta 15 días inclusive, y fecha posterior. El filtro conserva cliente, responsable, estado y prioridad.
- Comercial muestra Valor pendiente de aprobación: suma de cotizaciones enviadas cuya vigencia es hoy o posterior. Respeta cliente, estado y emisión; el dato secundario muestra la cantidad. El modal tiene el mismo conjunto.
- Las barras comerciales usan valor monetario por estado, cantidades interiores, total al final, leyenda y desglose para segmentos pequeños o valores cero. El nombre filtra por cliente; un segmento o su desglose filtra por cliente y estado. Se conserva acceso por teclado y contenido equivalente en impresión.

## Cotizaciones sin vencimiento automático

La fecha `valid_until` nunca convierte visualmente una cotización en Vencida. El estado mostrado coincide con el guardado, incluyendo cotizaciones con vigencia pasada. Esta regla se aplica al listado, filtros, gráficos, indicadores, modales e informes; no se reescribe ningún registro.

La vigencia se sigue usando para calcular Propuestas vigentes en la página de Cotizaciones y Valor pendiente de aprobación en Análisis. Una enviada con fecha anterior a hoy sigue Enviada y queda fuera de esos dos cálculos. No se añade un estado manual nuevo. Los contratos y etiquetas heredados de `expired` se conservan por compatibilidad, sin inferirlo de fechas.

## Contratos

- `analytics_management_report(p_metric text, p_filters jsonb)` devuelve `{metric,total,value,unit,components,records}` sin paginación. Solo acepta las cinco métricas de Gerencia. El detalle paginado reutiliza la misma selección y los mismos importes dentro de una instantánea SQL. Cada proyecto o gasto incluye `client_id` para agrupación inequívoca.
- `analytics_operation_snapshot_v2` y `analytics_operation_page_v2` incorporan `p_schedule` (`overdue`, `upcoming`, `later` o vacío). El agregado devuelve `bySchedule`; se conservan las funciones anteriores.
- `analytics_commercial_snapshot_multi` conserva su firma y añade `metrics.pendingValue` y `byClient[].{count,segments}`. Cada segmento tiene `{status,count,value}`. `analytics_metric_detail` y `GET /api/analisis/detalle` aceptan `commercial.pendingValue`; `commercial.validSent` conserva compatibilidad.
- `/analisis/informe?metric=management.balance` y las otras cuatro métricas usan los filtros de Gerencia. Sin `metric`, continúa el informe general de la pestaña. Operación y Comercial reflejan los gráficos nuevos también en sus informes generales.
- Importes SQL `numeric`, transporte como texto decimal y sumas de presentación con Decimal. El informe valida cantidad, UUID de cliente y conciliación del total antes de presentarse.
- Consultas nuevas con sesión SSR, perfil activo, RLS y privilegios explícitos; sin acceso anónimo, caché compartida ni `service_role`.

## Aplicar y desplegar

1. Confirmar el historial hasta `20261103110000_payment_management_pending_finance.sql`, incluidas la migración del estado pendiente y la de archivos.
2. En una base de pruebas, aplicar completo `supabase/migrations/20261104100000_analytics_reports_manual_quote_status.sql`, mediante el historial habitual de Supabase CLI o SQL Editor una sola vez.
3. Ejecutar los casos SQL siguientes y validar con ambos roles activos. Verificar que una cotización enviada con fecha pasada siga Enviada y que no contribuya al valor pendiente de aprobación.
4. Aplicar la misma migración en producción antes de desplegar la aplicación. No requiere nuevas variables de entorno, cambios de Storage ni actualización de datos históricos.
5. Desplegar y recargar las sesiones abiertas. Verificar carga por arrastre, cronograma, filtro de segmentos y los cinco informes con datos reales.

La migración y las pruebas se verifican localmente; no se aplican al Supabase remoto como parte de esta entrega.

## Validaciones reproducibles

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/analytics-improvements.spec.ts tests/charts/project-files.spec.ts tests/charts/management-report.spec.ts tests/charts/finance-improvements.spec.ts
```

En una base PostgreSQL/Supabase de pruebas con el historial completo:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/analytics_reports_manual_status.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/finance_improvements.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/payment_management_pending_finance.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_navigation.sql
```

Los scripts revierten sus fixtures con ROLLBACK. El nuevo caso cubre 125 proyectos financieros, clientes homónimos, ambos modelos de ganancia con pérdidas, conjunto vacío, límites de cronograma, vigencia de hoy, segmentos con valor cero, filtros combinados y permisos. Las fixtures de navegador usan componentes y páginas de producción con datos y respuestas simuladas; los PDF de prueba se generan en `test-results/` para inspección visual.

## Evidencia local

- 247 pruebas unitarias aprobadas. La integración opcional con Storage remoto se omitió por falta de las variables dedicadas de prueba; el flujo se verificó en navegador con cargas simuladas.
- 43 pruebas de navegador aprobadas en el pase final conjunto: arrastre, modales, filtros, cronograma, impresión e interfaces adaptables.
- TypeScript, ESLint y compilación de producción aprobados.
- Migración aplicada correctamente en una copia aislada de PostgreSQL 16 con Auth/Storage simulados. Los cuatro scripts SQL anteriores finalizaron correctamente, incluidos permisos y regresiones de navegación y anticipos. La instancia local quedó detenida.
- Se revisaron escritorio, móvil de 380 px y los cinco PDF con 135 registros completos, entre 7 y 44 páginas según el informe. Se verificaron totales, último registro, importes sin cortes, resultados negativos, subtotales y ausencia de páginas vacías. Los informes generales de Comercial y Operación también se verificaron en PDF.
- Sin migración ni despliegue en Supabase remoto; sin nuevas variables de entorno.
