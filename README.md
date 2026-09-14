# Elecpro

Aplicación Next.js para la operación comercial, técnica y financiera de Elecpro. El prototipo `index.html` se conserva como referencia visual y funcional.

## Configuración y arranque de producción

Copie `.env.example` a `.env.local` y complete `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y `NEXT_PUBLIC_APP_URL`. Instale dependencias con `npm install`.

Antes de iniciar producción, reconstruya la aplicación:

```bash
npm run build
npm run start
```

## Migraciones de Supabase

Instalación nueva: ejecute estas cuatro migraciones en SQL Editor, exactamente en este orden:

1. `20260909000000_initial_elecpro.sql`
2. `20260909100000_fix_audit_entity_id.sql`
3. `20260910000000_complete_workflows.sql`
4. `20260911000000_phase_2_data_operations.sql`

Actualización de una base existente: compruebe primero el historial real de migraciones (o las tablas, vistas y funciones ya presentes). Aplique únicamente los archivos pendientes y en orden; no ejecute nuevamente la migración inicial. La cuarta migración recrea las vistas financieras conservando `security_invoker`, permisos y RLS.

La aplicación verifica en lecturas autenticadas las vistas `project_financial_summary` y `portfolio_financial_summary`, incluyendo `projected_profit`, `balance` y `budget`. Un error de consulta se muestra como error de la ruta, nunca como un estado vacío.

En Authentication, mantenga Email habilitado y las inscripciones públicas desactivadas. Cree el primer usuario y asígnele el rol de administrador desde SQL Editor. No hay correos programados ni resumen semanal: las alertas se calculan al consultar.

## Validación

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

La validación contra Supabase requiere credenciales configuradas: pruebe en producción ambos roles activos, las cuatro pantallas y el bloqueo de usuarios anónimos o inactivos.
