# Colores financieros y alertas vigentes

## Estado de la revisión

Al iniciar existían cambios locales parciales: migración, tarjetas y algunas celdas de panel/Análisis. Se completaron colores en proyectos, distribuciones, desgloses e informe; se corrigieron textos dañados, la selección duplicada de `id` en el panel, la consulta duplicada al montar y las reglas históricas de retraso. No se modificó `index.html`, las fórmulas financieras, los movimientos ni las migraciones anteriores.

## Reglas financieras

`lib/financial-tone.ts` compara los valores originales con Decimal antes de formatear COP: resultados, diferencia de caja y márgenes negativos rojos, positivos verdes, cero neutro; cartera positiva ámbar; gastos rojos únicamente si exceden un presupuesto positivo; ejecución roja únicamente por encima de 100 %. No hay aviso al 90 %. Contratados, precios, anticipos, retenciones, movimientos y deducciones de distribuciones son descriptivos y neutros. Los fondos usan tokens claro/oscuro y descripción accesible, sin leyenda visible. El informe conserva fondos en impresión y usa tema claro. Cotizaciones, vista previa e impresión conservan su presentación.

## Alertas

La vista `public.project_active_alerts`, con `security_invoker` y filtro de miembro activo, centraliza las reglas y usa `project_financial_summary` (solo retenciones no anuladas).

| Tipo | Condición | Desglose |
| --- | --- | --- |
| Cartera | Saldo > 0, excepto borrador/cancelado | Contratado, anticipos, retenciones vigentes, cubierto y saldo |
| Sobrecosto | Presupuesto > 0 y gastos > presupuesto, excepto finalizado/cancelado | Presupuesto, gastos, exceso COP y porcentaje |
| Retraso | Aprobado/en proceso/pausado; fecha prevista anterior a hoy | Fecha prevista y días de retraso |
| Finalización próxima | Aprobado/en proceso/pausado; entre hoy y hoy + 15 inclusive | Fecha prevista y días restantes |

Hoy se calcula en Bogotá. Finalizados solo conservan cartera pendiente y cancelados no generan alertas. El orden es retraso, sobrecosto, cartera, próxima finalización, luego fecha e identificador. La tarjeta compartida muestra tipo, código, cliente, título existente, estado y acceso al proyecto. El panel conserva tres prioritarias. La búsqueda del listado incluye código, cliente y título sin distinguir acentos/mayúsculas.

`alerts_page_v2(q,kind,page,limit)` devuelve registros, total, página efectiva y `consulted_at`, incluso con cero registros. La página efectiva se calcula después del filtro en la misma consulta y se refleja en la URL. `alerts_page(q,kind,offset,limit)` conserva firma y columnas. El panel incluye identificación, cifras, fechas y momento de consulta. Los importes del nuevo contrato JSON se serializan como cadenas decimales para evitar pérdida de precisión en JavaScript; la consulta anterior conserva sus tipos.

Se consulta en el servidor al entrar y mediante «Actualizar» o al regresar a la pestaña. Foco/visibilidad comparten un indicador de salida para no duplicar lecturas; no se vuelve a consultar al montar. Se indica carga y última actualización del servidor en hora de Bogotá. Los errores se propagan al límite de error de la ruta; nunca se convierten en «sin alertas». No hay temporizadores, Realtime, correos ni tareas programadas.

Las acciones de proyectos, pagos, gastos, presupuestos y retenciones ya usan `revalidateBusinessViews`, que invalida panel, alertas, análisis, informe y detalle. Las acciones de clientes también invalidan estas vistas.

## Diagnóstico de cartera

La revisión del repositorio encontró reglas duplicadas entre panel/listado y consultas históricas de retraso. La definición vigente de `project_financial_summary` ya excluye retenciones anuladas. La invalidación de rutas ya estaba conectada. Ninguno de estos hallazgos permite atribuir por sí solo la cartera reportada a caché.

No hay credenciales configuradas en `.env.local`; no se consultó ni modificó la base desplegada. Antes de diagnosticar un proyecto real, comprobar en SQL Editor:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select id, quote_number, title, status, project_value from public.projects where id = '<uuid>';
select * from public.project_financial_summary where id = '<uuid>';
select * from public.project_payments where project_id = '<uuid>' order by payment_date, id;
select * from public.project_withholdings where project_id = '<uuid>' order by withholding_date, id;
select * from public.project_active_alerts where project_id = '<uuid>';
```

Verificar particularmente `20261022100000`, `20261022120000`, `20261022130000` y la nueva migración. Conciliar saldo = máximo(0, contratado − anticipos − retenciones vigentes) con panel, listado y detalle bajo el mismo usuario activo. Verificar la fecha de consulta y el estado. Si SQL Editor se usó manualmente, comprobar también definiciones y permisos: el historial puede no haber sido registrado.

## Despliegue

1. En el entorno de destino confirmar que todas las migraciones hasta `20261022130000` están aplicadas. Revisar respaldo y desplegar primero en pruebas.
2. Aplicar completa `supabase/migrations/20261023100000_current_alerts.sql` mediante el mecanismo habitual (Supabase CLI o SQL Editor). Es transaccional, no modifica movimientos y recarga el esquema de PostgREST. Registrar el historial si se aplica manualmente.
3. Ejecutar `supabase/tests/current_alerts.sql` en una base de pruebas: crea fixtures dentro de una transacción que termina en ROLLBACK. Con psql: `psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/current_alerts.sql`.
4. Desplegar la aplicación después de que existan vista y RPC v2. Conservar las variables de Supabase SSR existentes; no se necesitan secretos nuevos.
5. Probar un proyecto con pago parcial/completo y retención vigente/anulada; comparar las tres pantallas. Verificar estados, búsqueda, última página, «Actualizar» y retorno desde otra pestaña.

## Verificación ejecutada

- 177 pruebas unitarias aprobadas; incluyen fechas ayer/hoy/15/16, estados, precisión decimal, cero, ejecución y propagación de errores.
- 19 pruebas de navegador de alertas/cobertura aprobadas: escritorio y móvil, temas claro/oscuro, contraste mínimo 4,5:1 en celdas coloreadas, teclado, deduplicación de eventos, panel/listado de proyectos/Análisis/informe y exportación PDF del informe.
- 21 casos de regresión de cotizaciones e impresión aprobados, incluidos tamaños de pantalla y PDF Letter/A4.
- Las 28 migraciones aplicaron desde cero en PostgreSQL 16 aislado. Pasaron `current_alerts.sql`, `project_coverage.sql`, `paid_project_distributions.sql`, `finance_improvements.sql` y `quote_direct_discount.sql`. El entorno local usó roles y una tabla/función Auth mínimas; no sustituye la comprobación SSR/Auth en Supabase desplegado.
- Se actualizó el fixture de distribución de `finance_improvements.sql` a valor fijo, conforme a la regla vigente desde `20261022130000`.
- Lint, tipos y compilación de producción aprobados.

Pendiente de acceso al entorno: verificar historial desplegado, el proyecto concreto con cartera reportada y el flujo autenticado real en Supabase. Los resultados anteriores usan fixtures locales y SQL con RLS real.
