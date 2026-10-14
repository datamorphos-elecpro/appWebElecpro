# Categorías e IVA por ítem

Actualización del 13 de octubre de 2026.

## Comportamiento

Todocosto (`all_inclusive`, prefijo TODO) y Transporte (`transport`, prefijo TRA) están disponibles en catálogo, filtro URL `category` y editor de cotizaciones. No reciben incremento de materiales. El catálogo genera códigos con sus contadores actuales, sin renumerar registros.

Cada ítem de cotización tiene IVA (%) junto a Precio base. Inicializa en 0, incluidos ítems agregados desde catálogo. Vacío equivale a 0; admite coma o punto, dos decimales y rango 0 a 100. El porcentaje pertenece a la cotización, no al catálogo. Los borradores guardan el texto ingresado; servidor y RPC normalizan y validan al guardar. Borradores antiguos sin IVA se recuperan como 0.

```text
costo_unitario = precio_base × (1 + iva_item / 100)
precio_final = costo_unitario × (1 + incremento_materiales / 100), solo Material
precio_final = costo_unitario, demás categorías
base_total = cantidad × precio_base
cost_total = cantidad × costo_unitario
final_total = cantidad × precio_final
```

El costo directo usa la suma comercial `final_total`; AIU usa ese costo directo e IVA sobre utilidad conserva su regla. Con cantidad 2, base $100.000, IVA 19 % e incremento 10 %, el costo presupuestado es $238.000, precio comercial unitario $130.900 y subtotal comercial $261.800. Con Administración 8 %, Imprevistos 3 %, Utilidad 10 % e IVA sobre utilidad 19 %, el total es $321.752,20 (presentado en COP sin decimales).

Se mantiene el precio base sin IVA. `calculateQuote` acepta `vatPct` opcional y devuelve `costUnitPrice` y `costTotal`. Los payloads de `save_quote` y `approve_and_convert_quote` incorporan `items[].vat_pct`; las firmas RPC no cambian. `save_quote_calculated` sigue sin permiso de ejecución para usuarios API.

Las instantáneas agregan `vat_pct numeric(5,2)` y `cost_total numeric(18,6)` a ítems y presupuestos. Se usa seis decimales, como los importes vigentes, para conservar costos históricos y cantidades fraccionarias: reducirlos a `numeric(14,2)` perdería precisión. No se redondean pasos intermedios; PostgreSQL aplica la escala al persistir. Las nuevas conversiones usan `cost_total` como presupuesto, excluyendo el incremento comercial.

La tabla de presupuesto del proyecto usa los títulos «Costo presupuestado» y «Valor comercial» para identificar estos importes; las categorías de instantáneas se presentan en español.

## Aplicación en Supabase

1. Revisar el historial y aplicar migraciones anteriores pendientes en orden, hasta `20261002100000_quote_inputs_print_navigation.sql`.
2. Ejecutar **solo** `20261013100000_expand_quote_categories.sql` en SQL Editor y confirmar que terminó. Su `COMMIT` permite usar los valores nuevos del enum en la siguiente operación.
3. Ejecutar `20261013101000_quote_item_vat.sql` una sola vez. La transacción registra contadores, columnas y funciones, completa datos históricos y solicita recargar el esquema PostgREST.
4. Desplegar la aplicación y recargar editores abiertos. No volver a aplicar estos archivos fuera del control del historial.
5. Con usuario activo, crear un ítem de cada categoría nueva, filtrar catálogo, guardar una cotización con IVA, reabrirla y convertirla. Comparar importes con el ejemplo anterior.

La migración no recalcula cotizaciones ni cambia presupuestos históricos: IVA inicial 0 y costo igual al total base guardado. Los presupuestos manuales pueden dejar ambos campos de instantánea nulos. Para completar ítems ya convertidos se deshabilita únicamente el trigger de normalización bajo el bloqueo DDL de la misma transacción y se restaura antes del COMMIT; RLS permanece habilitada. Se conceden a `authenticated` permisos para las funciones de normalización usadas por los índices del catálogo, sin conceder acceso a `anon` ni escritura en contadores. Se preservan las capas de ubicación, reintentos y bloqueo transaccional.

## Pruebas reproducibles

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/quote-print.spec.ts tests/charts/quote-editor.spec.ts
```

En una base de pruebas migrada, ejecutar `supabase/tests/quote_item_vat.sql` y `supabase/tests/quote_navigation.sql` con SQL Editor o `psql -v ON_ERROR_STOP=1 -f <archivo>`. Ambos revierten fixtures y contadores con ROLLBACK. El segundo usa al dueño SQL únicamente para preparar fixtures con escrituras directas que no están autorizadas a usuarios de la aplicación.

La prueba de dos conexiones usa `python supabase/tests/quote_item_vat_concurrency.py`. Configurar `ELECPRO_TEST_DATABASE=true`, las variables habituales `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` y, si no está en PATH, `PSQL_EXE`. Requiere el dueño SQL, elimina los fixtures exactos de su ejecución y consume consecutivos: usar exclusivamente una base desechable de pruebas. Nunca registrar contraseñas en archivos del repositorio.

Las fixtures de Playwright usan el editor y documento reales, con acciones y búsqueda simuladas; PostgreSQL prueba por separado los RPC y RLS. La suite cubre IVA opcional y fraccionario, rechazo de valores inválidos, recuperación de borradores, reapertura, bloqueo al convertir, categorías y catálogo, teclado, tamaños móviles y 12 combinaciones PDF (Carta/A4, ambas orientaciones y tres tamaños de letra).

## Resultado de validación local

- 106 pruebas unitarias y 29 pruebas Playwright aprobadas.
- PostgreSQL 16 local aislado: historial completo de migraciones, prueba de backfill con cotización previamente convertida e importes históricos sin cambios, ambos scripts SQL y prueba de dos conexiones concurrentes aprobados. Se simula únicamente el esquema de identidad Auth necesario para los perfiles; no se ha ejecutado contra Supabase remoto.
- Compilación de producción, TypeScript y lint aprobados.
- Doce PDF de estrés rasterizados con PDFium, entre 4 y 7 páginas; revisión visual de formatos y páginas representativas sin recortes ni superposiciones.
- La instalación local de Next.js tenía archivos faltantes; se restauró el mismo paquete 16.3.4 desde la caché, sin cambiar dependencias ni lockfile.

Las migraciones están preparadas y verificadas localmente; su aplicación en Supabase y el despliegue quedan como pasos de publicación. El diálogo interactivo real de Chrome/Edge mantiene la comprobación manual documentada en [impresión](QUOTE-PRINT-VALIDATION.md).
