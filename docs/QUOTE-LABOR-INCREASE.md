# Incremento de mano de obra y presentación del IVA

Actualización del 10 de noviembre de 2026.

## Comportamiento

El resumen económico incluye **Incremento sobre mano de obra** debajo de materiales. Inicia en 0 %, admite de 0 a 99999.99 con hasta dos decimales, siguiendo el formato de materiales. Se conserva al guardar, reabrir y recuperar borradores; queda bloqueado al convertir la cotización. Las entradas anteriores sin el campo toman cero.

El incremento se aplica exclusivamente a **Servicio MO** (`labor`), una sola vez sobre el precio con IVA del ítem. Material usa su propio porcentaje; Diseño, Visita Técnica, Todocosto, Transporte e ítems aún sin categoría no reciben el incremento de mano de obra. La categoría sigue siendo obligatoria para guardar.

```text
costo_unitario = precio_base × (1 + iva_item / 100)
precio_final = costo_unitario × (1 + incremento_materiales / 100)  para Material
precio_final = costo_unitario × (1 + incremento_mano_obra / 100)   para Servicio MO
precio_final = costo_unitario                                   para otras categorías
costo_directo = suma(cantidad × precio_final)
```

Descuento, AIU e impuestos conservan sus fórmulas sobre el nuevo costo directo. El límite del descuento fijo incluye ambos incrementos. Los incrementos se incorporan a los precios del documento, sin filas separadas. La conversión conserva el ingreso comercial y las instantáneas finales; el presupuesto usa costo con IVA, excluyendo ambos incrementos.

Ejemplo: Servicio MO de $100.000, IVA del ítem 19 % e incremento 10 % produce precio comercial $130.900 y presupuesto $119.000. Con descuento 10 %, A/I/U 8/3/10 % y ambos impuestos del 19 %, el total interno es 167172.39 (presentación COP sin decimales).

En vista previa, impresión y PDF, **IVA sobre utilidad** se oculta únicamente con `show_aiu = false` y `apply_direct_vat = true`, independientemente del descuento y del importe del impuesto. Las otras tres combinaciones conservan la fila. El campo del editor permanece visible y el impuesto continúa incluido en el total: ocultarlo no modifica fórmulas ni lo incorpora a otro subtotal. La regla también se aplica al regenerar documentos antiguos o convertidos.

## Contrato y migración

`save_quote` y `approve_and_convert_quote` conservan sus firmas. El payload incorpora `labor_increase_pct` como texto decimal, predeterminado `'0'`. PostgreSQL lo valida y almacena como `numeric(7,2) NOT NULL DEFAULT 0 CHECK (labor_increase_pct >= 0)`. El cálculo compartido acepta `laborIncreasePct` opcional con valor cero si falta.

La migración `20261110100000_quote_labor_increase.sql` añade la columna y reemplaza `save_quote_calculated`. Conserva permisos, RLS, wrappers autorizados, idempotencia y precisión monetaria vigente. No modifica precios del catálogo ni recalcula filas históricas, proyectos o presupuestos.

1. Verificar que las migraciones anteriores estén aplicadas, incluida `20261104100000_analytics_reports_manual_quote_status.sql`.
2. En Supabase **SQL Editor → New query**, ejecutar el contenido completo de `supabase/migrations/20261110100000_quote_labor_increase.sql` una sola vez, o aplicarlo mediante el historial configurado de CLI. No repetirlo si ya figura aplicado.
3. Aplicar la migración **antes de desplegar la aplicación**. No se requieren variables de entorno nuevas.
4. Desplegar y recargar los editores abiertos para evitar que clientes antiguos guarden sin el nuevo campo.
5. Verificar el ejemplo, guardado/reapertura, una cotización anterior y conversión. Comprobar la fila de IVA con AIU visible/oculto; el total debe permanecer igual.

## Pruebas reproducibles

```powershell
npm test
npm run lint
npm run build
npm run test:charts -- tests/charts/quote-labor-increase.spec.ts tests/charts/quote-editor.spec.ts tests/charts/quote-discount.spec.ts tests/charts/quote-print.spec.ts --timeout=60000
```

En una base **desechable de pruebas** con todas las migraciones y variables estándar `PG*` configuradas:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_labor_increase.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_direct_discount.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_item_vat.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_navigation.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/finance_improvements.sql
```

Los fixtures se revierten. Para verificar historial, preparar otra base desechable hasta `20261104100000`, ejecutar `quote_labor_history_before.sql`, aplicar la migración nueva y ejecutar `quote_labor_history_after.sql`. Se comparan filas completas de cotizaciones, ítems, proyectos, presupuestos y resúmenes, excluyendo únicamente la columna nueva cuyo valor debe ser cero. Estos fixtures históricos permanecen exclusivamente en esa base desechable.

Las pruebas de navegador usan componentes reales con acciones simuladas; SQL comprueba cálculos, permisos e instantáneas en PostgreSQL real. Las pruebas no aplican cambios en Supabase remoto.

## Resultado de validación local

Pasaron 275 pruebas unitarias (una prueba existente omitida), 55 de navegador, TypeScript, lint y compilación de producción. Se revisaron capturas de escritorio y móvil y se generaron los PDF de prueba. En PostgreSQL 16 aislado se aplicó todo el historial y pasaron la comparación histórica y las cinco suites funcionales indicadas arriba, incluidos permisos y conversión. La instancia local quedó detenida.

La compilación requirió restaurar archivos ilegibles de `node_modules/next` desde el paquete local 16.3.4, verificando su SHA-512 contra `package-lock.json`; no se cambiaron versiones ni dependencias declaradas. La instalación anterior se conservó en `.supabase/next-corrupt-20261110`.

La migración no se ha aplicado al Supabase remoto y la aplicación no se ha desplegado.
