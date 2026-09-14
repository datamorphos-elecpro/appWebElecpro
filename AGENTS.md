# Instrucciones para agentes

Este repositorio parte de un prototipo autónomo en `index.html`. Antes de implementar la aplicación productiva, lee `.agents/README.md` y cada documento enlazado en el orden indicado.

## Reglas obligatorias

- Conserva `index.html` como referencia de diseño, textos, cálculos y flujos. No lo conviertas de forma mecánica a React.
- La aplicación de producción será una única empresa: Elecpro. No agregues `organization_id`, multitenencia ni flujos de registro público.
- Usa Next.js App Router, TypeScript, npm, CSS Modules y Supabase con autenticación SSR basada en cookies.
- Mantén español colombiano, `COP` sin decimales visuales y zona horaria `America/Bogota`.
- Usa `numeric`, nunca `float`, para importes y porcentajes que intervengan en cálculos financieros.
- No expongas `service_role` ni secretos en el navegador. Toda operación administrativa de Auth debe hacerse desde una Server Action o Route Handler autorizado.
- Habilita RLS, revoca permisos de `anon` y crea políticas explícitas para cada tabla de `public`.
- Las cotizaciones y sus ítems pueden editarse hasta que se conviertan en proyecto. La conversión debe ser una operación transaccional, idempotente y conservar las instantáneas económicas.
- No marques como implementadas automatizaciones de correo o trabajos programados: en la primera versión solo hay alertas internas calculadas al consultar.

## Fuente de verdad

La prioridad es: instrucciones del usuario, este archivo, `.agents/*.md`, y finalmente el comportamiento verificable de `index.html`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
