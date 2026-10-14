# Pruebas de integración y RLS

Las unitarias se ejecutan con `npm test`. Para integración, aplique la migración a un proyecto de pruebas y ejecute los casos definidos en `.agents/05-implementacion-y-pruebas.md`: usuarios anónimo, activo, administrador e inactivo; RPC concurrente de conversión; y acceso directo bloqueado a auditoría y contadores. Las credenciales nunca se incorporan al repositorio.

Las pruebas de IVA y categorías están en `supabase/tests/quote_item_vat.sql` y `supabase/tests/quote_item_vat_concurrency.py`. Consulte [preparación y comandos](../docs/QUOTE-ITEM-VAT.md). El editor puede probarse sin Supabase con `npx playwright test --config playwright.charts.config.ts tests/charts/quote-editor.spec.ts`; las acciones se simulan y los componentes son los de producción.
