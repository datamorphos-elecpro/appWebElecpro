# Corrección de alertas e informe de Gerencia

## Contrato y diagnóstico

`consulted_at` se normaliza a `string | null`. Un campo ausente, nulo, vacío o no interpretable como fecha muestra «Última actualización: no disponible». No se sustituye por la hora del navegador ni se descartan registros, total o página efectiva. Los errores RPC se propagan. Se conservan actualización manual y deduplicación del retorno por foco/visibilidad.

La migración local `20261023100000_current_alerts.sql` incluye la fecha tanto en `dashboard_snapshot` como en `alerts_page_v2`, incluso sin alertas. No se cambió SQL ni se creó una migración correctiva sin evidencia de una diferencia desplegada. En esta ejecución `.env.local` está vacío, no hay navegadores conectados y Docker no está iniciado: no se pudo consultar la sesión real, comparar las definiciones desplegadas ni ejecutar SQL/RLS contra Supabase. La causa de que el entorno reportado omita la fecha sigue pendiente de comprobar.

Comprobar las respuestas RPC desde una sesión activa de la aplicación, su `consulted_at` y las definiciones desplegadas. En SQL Editor, solo lectura:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select pg_get_functiondef('public.dashboard_snapshot()'::regprocedure);
select pg_get_functiondef('public.alerts_page_v2(text,text,integer,integer)'::regprocedure);
select pg_get_viewdef('public.project_active_alerts'::regclass, true);
select reloptions from pg_class where oid = 'public.project_active_alerts'::regclass;
select auth.uid(), private.is_active_member();
```

Table Editor/SQL Editor sin contexto de usuario pueden mostrar cero filas de `project_active_alerts`: su filtro exige un miembro activo y usa `security_invoker` y RLS. Esto no demuestra que no haya cartera. No se añade acceso administrativo especial. Conciliar bajo la misma sesión activa `balance = greatest(0, project_value - paid - withheld)` con el resumen, detalle, panel y listado; retenciones anuladas no entran en `withheld`. Ejecutar `supabase/tests/current_alerts.sql` en una base de pruebas para pago parcial, completo, anulación, compatibilidad y restricciones de acceso.

Si la inspección real demuestra un contrato antiguo después de `20261023100000`, entregar una migración incremental posterior, conservando firma anterior, filas, totales y página efectiva. Aplicar esa migración y sus pruebas antes de desplegar la aplicación. No se ejecutó despliegue en esta tarea.

## Gerencia

Se retira la leyenda financiera de la interfaz, modales e informes y se conservan fondos y descripciones accesibles. Gerencia conserva sus cinco métricas y filtros, seguida de cobros/gastos/diferencia, cartera por cliente y tabla financiera a todo el ancho. Se retiran los bloques de márgenes y ejecución de pantalla e informe. Operación, Comercial y cotizaciones mantienen su composición.

El informe usa una página CSS nombrada de Carta horizontal con margen de 10 mm y una vista previa de ancho equivalente. Cada gráfico calcula su escala con todos sus datos y tiene un único título. Las tres barras de cada mes se agrupan para impedir saltos internos; cada cliente conserva etiqueta e importe. El navegador decide los saltos sin cortes artificiales cada 12 barras. La tabla recorre todas las páginas de consulta, repite encabezados y evita partir filas; sus cifras se muestran con la indicación global «Importes en COP, sin decimales» para aprovechar el ancho disponible.

## Verificación reproducible

- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `npm run test:charts`: fixtures de componentes reales, sin sustituir la validación SSR/Auth del entorno desplegado.
- `tests/charts/management-report.spec.ts`: 1/12/36 meses, 45 nombres largos, 135 proyectos, importes grandes, Carta horizontal, escritorio/móvil, claro/oscuro y selección por teclado.
- `tests/alerts-data.test.ts` y `tests/charts/current-alerts.spec.ts`: fecha válida/no disponible, conservación de datos, errores, botón y retorno deduplicado.

Resultados de esta ejecución: 182 pruebas unitarias aprobadas; 99 casos de la suite completa de navegador y 8 casos adicionales de Panel/Alertas sin alertas con fechas ausentes, vacías, inválidas y válidas aprobados. Lint, tipos y compilación de producción aprobados. Se inspeccionaron renderizados de los PDF y se comprobaron sus dimensiones, límites del texto, títulos únicos, encabezados repetidos, 135 proyectos completos y 45 clientes. Los informes de 1/12/36 meses produjeron 10/12/16 páginas; cada mes conserva sus tres barras en una misma página. No se ejecutaron SQL ni despliegues por las limitaciones de entorno indicadas arriba.
