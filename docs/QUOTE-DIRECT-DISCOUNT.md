# Descuento opcional en cotizaciones

Actualización del 22 de octubre de 2026.

## Comportamiento y contrato

El interruptor **Aplicar descuento al costo directo** inicia apagado. Al activarlo se elige Porcentaje o Valor fijo, ambos inicialmente 0. Los dos valores se conservan por separado al alternar, apagar, guardar y recuperar borradores. Se aceptan coma o punto decimal, máximo dos decimales, sin separadores de miles. Porcentaje: 0–100; fijo: no negativo y, cuando está seleccionado y activado, no superior al costo directo. Si reducir ítems provoca un exceso, se indica el error y se impiden guardado, vista previa, impresión y conversión. Apagar permite conservar ese monto para futuras modificaciones.

La base incluye IVA por ítem e incremento de materiales. El descuento reduce esa base antes de calcular A/I/U, IVA sobre utilidad e IVA directo. Los precios y subtotales de ítems conservan su fórmula. Con AIU visible se muestran costo directo anterior, descuento negativo, costo neto y AIU. Con AIU oculto, Subtotal del servicio antes del descuento equivale a costo original más AIU recalculado; después se muestran descuento, subtotal neto e impuestos. Un descuento activo de 0 conserva su fila.

Ejemplo: costo $1.000.000, descuento 10 % o $100.000, A/I/U 8/3/10 %, ambos IVA 19 %: neto $900.000 + $72.000 + $27.000 + $90.000 + $17.100 + $171.000 = **$1.277.100**. Sin IVA directo: **$1.106.100**.

`save_quote` y `approve_and_convert_quote` conservan firmas y autorización. El payload añade:

| Campo | Tipo / valor inicial |
|---|---|
| `apply_direct_discount` | booleano, false |
| `direct_discount_type` | `percent` o `fixed`, inicialmente `percent` |
| `direct_discount_pct` | texto decimal, 0 |
| `direct_discount_fixed_amount` | texto decimal, 0; hasta 12 dígitos enteros |

PostgreSQL calcula `direct_discount_amount numeric(18,6)` e ignora cualquier importe calculado enviado por el navegador. `direct_cost` sigue siendo el costo original; la base neta se obtiene restando el descuento. No se redondea entre pasos; se conserva la precisión vigente al persistir. Ambos valores de entrada deben tener formato válido aun si no están seleccionados; el límite contra costo directo solo se aplica al descuento fijo seleccionado y activo.

La conversión conserva el total descontado como valor del proyecto y los costos por ítem como presupuesto. Los controles quedan bloqueados tras convertir; se mantienen idempotencia, permisos y auditoría. Las cotizaciones anteriores comienzan sin descuento; sus importes e instantáneas permanecen iguales durante la migración.

## Migración y despliegue

1. Verificar el historial hasta `20261022100000_quote_options_withholdings_analytics.sql`.
2. En una base de pruebas, aplicar **completo y una sola vez** `supabase/migrations/20261022110000_quote_direct_discount.sql` mediante SQL Editor o el historial configurado de Supabase CLI. La transacción añade columnas, reemplaza el cálculo interno, conserva permisos y recarga PostgREST. No modifica migraciones anteriores.
3. Ejecutar las pruebas SQL y de aplicación indicadas abajo. Comprobar guardado/reapertura, documento, conversión y permisos con ambos roles activos.
4. Aplicar la misma migración en producción **antes de desplegar la aplicación**. Desplegar y recargar las pestañas abiertas antes de editar cotizaciones con descuento.
5. Comprobar el ejemplo económico, una cotización anterior, una conversión y la recuperación de borrador. No se requieren variables de entorno nuevas.

No ejecutar las pruebas con fixtures en producción. No revertir el esquema eliminando las columnas si ya existen cotizaciones con descuento: preservan su instantánea comercial.

## Pruebas reproducibles

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/quote-discount.spec.ts tests/charts/quote-editor.spec.ts tests/charts/quote-print.spec.ts
```

En una base de pruebas con el historial completo, con `psql` y las variables estándar `PG*` configuradas:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_direct_discount.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/finance_improvements.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_item_vat.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quote_navigation.sql
```

Los cuatro archivos revierten sus fixtures con ROLLBACK. Cubren ambos tipos, AIU/IVA, límites, precisión, importes enviados ignorados, conservación de los dos valores, desactivación, conversión, idempotencia y acceso anónimo/inactivo/directo bloqueado.

Para conservación histórica, usar otra base desechable migrada **hasta 20261022100000**: ejecutar `quote_discount_history_before.sql`, aplicar `20261022110000_quote_direct_discount.sql` y ejecutar `quote_discount_history_after.sql`. Se comparan las filas completas antes/después, incluyendo impuestos previos, estados, auditoría, ítems, proyectos, presupuestos y resúmenes. Los fixtures históricos solo permanecen en esa base desechable.

Las pruebas de navegador usan componentes reales con acciones simuladas; las reglas de servidor y permisos se comprueban por separado en PostgreSQL 16 local. La migración remota y el despliegue se realizan con los pasos anteriores.

Validación local completada: **151 pruebas unitarias y 43 de navegador**, incluidas las 12 combinaciones existentes de PDF y los nuevos documentos con descuento en escritorio/móvil. También pasaron SQL/RLS, comparación histórica completa, conversión con dos conexiones, TypeScript, lint y build de producción. La migración se aplicó a una copia desechable de la base local de pruebas; no se aplicó a Supabase remoto.
