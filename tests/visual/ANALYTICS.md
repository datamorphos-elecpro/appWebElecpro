# Capturas de Análisis

`analytics.spec.ts` cubre Gerencia y rentabilidad, Operación y Comercial a 1440, 900, 680 y 380 px.

Las pruebas requieren `E2E_TEST_EMAIL` y `E2E_TEST_PASSWORD` de un miembro activo, además de datos deterministas en Supabase. Sin esas variables se omiten deliberadamente: las políticas RLS impiden que Playwright sustituya la sesión real con acceso anónimo.
