# Migraciones y configuración de Supabase

## Resultado requerido

Durante la implementación se debe crear exactamente una migración inicial estructural:

```text
supabase/migrations/<timestamp>_initial_elecpro.sql
```

El archivo no debe contener datos ficticios. Si se requieren demostraciones, crear después una migración de desarrollo explícitamente opcional o un script de seed separado. Esta guía define el contenido de la migración; no sustituye el archivo SQL.

## Orden dentro de la migración

1. Activar `pgcrypto` y `unaccent`; crear los esquemas `private` y, si se necesita, `extensions` según la configuración del proyecto.
2. Crear enums: `app_role`, `catalog_category`, `quote_status`, `project_status`, `project_priority`, `profit_mode`, `budget_source`, `share_mode`, `share_basis` y `audit_action`.
3. Crear `profiles`, la función y trigger para crear perfil después de insertar en `auth.users`, `company_settings` y `document_counters`.
4. Crear clientes, proveedores, catálogo, cotizaciones e ítems; después proyectos y sus tablas financieras. Añadir la referencia circular `quotes.project_id` al final con un `alter table`.
5. Crear `audit_log`, triggers de `updated_at` y triggers de auditoría para las tablas operativas. Los triggers deben omitir columnas irrelevantes de sesión si existen y nunca registrar contraseñas o tokens.
6. Crear índices, checks y restricciones únicas descritas en [el modelo de datos](03-modelo-de-datos.md).
7. Crear funciones `private` de autorización y funciones RPC transaccionales.
8. Crear vistas de resumen con `security_invoker = true`.
9. Revocar todos los privilegios a `anon` y `authenticated` sobre cada tabla, secuencia, función y esquema que no corresponda.
10. Conceder mínimos privilegios a `authenticated`, habilitar RLS y crear políticas por operación. Conceder `usage` de esquema solo donde sea necesario.
11. Insertar la fila única de `company_settings` y el contador `quote` con `on conflict do nothing`; no insertar clientes, proyectos ni usuarios.

La migración debe poder ejecutarse una vez en una base vacía y fallar de forma clara si se ejecuta por segunda vez fuera del control de historial de migraciones. No usar `drop ... cascade`, políticas permisivas temporales ni `service_role` dentro del SQL.

## Funciones obligatorias

### Seguridad

- `private.current_profile()`: obtiene el perfil de `(select auth.uid())`, solo si existe y está activo.
- `private.is_active_member()`: devuelve si el usuario autenticado tiene perfil activo.
- `private.is_administrator()`: devuelve si el perfil activo tiene rol `administrator`.
- Todas son `security definer`, `set search_path = ''`, con referencias a esquemas calificadas y acceso público revocado. Otorgar `execute` solo a `authenticated` cuando sea estrictamente necesario.

Las políticas deben llamar estas funciones con `(select private.is_active_member())` o `(select private.is_administrator())`, para que PostgreSQL evalúe el resultado una vez por consulta. Añadir índices sobre las columnas usadas para filtrar relaciones.

### Consecutivo

`public.next_quote_number(p_year integer default extract(year from current_date))` bloquea con `FOR UPDATE` la fila `document_counters.key = 'quote'`, incrementa el valor y devuelve `COT-YYYY-NNNN`. Solo una función de guardado o un administrador puede invocarla; el cliente no actualiza contadores directamente.

### Guardado de cotización

`public.save_quote(payload jsonb)` debe:

- Requerir miembro activo y validar cliente activo, estado, porcentajes e ítems.
- Asignar consecutivo al crear, o bloquear y cargar la cotización existente al editar.
- Rechazar editar una cotización ya vinculada a un proyecto.
- Para cada ítem, calcular precios final, total base y total final en PostgreSQL, aplicando incremento solo a `material`.
- Recalcular todos los importes AIU, IVA y total desde los ítems calculados.
- Reemplazar los ítems en una transacción conservando su orden y devolver la cotización persistida.

No aceptar totales enviados por cliente como fuente de verdad. Devolver errores de validación útiles a la Server Action.

### Conversión a proyecto

`public.convert_quote_to_project(p_quote_id uuid)` debe:

- Requerir miembro activo, bloquear la fila de cotización (`FOR UPDATE`) y verificar que está aprobada.
- Retornar el proyecto existente cuando `project_id` ya tiene valor; esta es la propiedad de idempotencia.
- Validar que cliente y configuración estén activos/disponibles.
- Crear el proyecto y sus presupuestos de origen `quote_snapshot` en la misma transacción con las instantáneas de cada `quote_item`.
- Asignar la referencia bidireccional de cotización y proyecto, escribir auditoría `convert_quote` y devolver el proyecto.
- No crear pagos, gastos ni participaciones de forma implícita.

La aprobación debe ocurrir mediante una actualización explícita anterior o una función que apruebe y convierta en la misma transacción; no permitir convertir borradores o vencidas sin una decisión explícita del usuario.

## RLS y permisos

| Recurso | Miembro activo | Administrador |
| --- | --- | --- |
| Datos de negocio y vistas de resumen | Select e inserción/actualización permitidas | Igual |
| `profiles` | Solo consulta de su propio perfil | Consulta y actualización de perfiles según funciones administrativas |
| `company_settings` | Lectura y actualización | Igual |
| Funciones de negocio | Ejecutar únicamente las funciones expuestas | Igual |
| Auditoría | Sin escritura directa; lectura solo si se habilita para ambos roles | Lectura completa si se habilita en pantalla futura |
| Gestión de usuarios Auth | Sin acceso | Solo mediante acción de servidor con clave de servicio |

En todas las tablas de negocio, las políticas `select`, `insert`, `update` y, cuando exista eliminación física autorizada, `delete`, exigirán `(select private.is_active_member())`. Para perfiles, el `using` de usuarios comunes será `id = (select auth.uid())`; las mutaciones de perfiles por administradores deben exponerse por RPC que evita elevar o desactivar al último administrador activo.

El usuario inactivo queda bloqueado por RLS aunque conserve una cookie válida. Las tablas de auditoría, contadores y configuración de Auth no se exponen para escritura directa. Las vistas deben declarar `with (security_invoker = true)` para obedecer la RLS subyacente.

## Índices mínimos

- Unicidad normalizada: códigos de catálogo y números de cotización.
- `quotes(client_id, issued_on desc)`, `quotes(status, valid_until)`, `projects(client_id)`, `projects(status, expected_end_date)`, `projects(responsible, status)`.
- Claves foráneas de todos los movimientos: `(project_id, payment_date desc)`, `(project_id, expense_date desc)`, `(project_id, position)` y `(quote_id, position)`.
- Búsqueda normalizada de nombre/descripcion en clientes, proveedores y catálogo.
- Auditoría por entidad y por actor según el modelo.

## Ejecución en Supabase SQL Editor

1. Crear un proyecto de Supabase y guardar su URL y Publishable Key.
2. En **Authentication → Providers**, dejar Email habilitado y desactivar las inscripciones públicas. Configurar las URLs de redirección para desarrollo y producción.
3. Crear el archivo de migración siguiendo esta guía. Revisar que no incluya claves, contraseñas ni datos de muestra.
4. Abrir **SQL Editor → New query**, pegar el SQL completo y ejecutarlo una sola vez.
5. Verificar en **Table Editor** las tablas de `public`, las relaciones y las restricciones; confirmar en **Database → Policies** que cada tabla expuesta tiene RLS y políticas.
6. Crear el primer usuario desde **Authentication → Users**. En SQL Editor, asignar de forma controlada su perfil a `administrator`; después la pantalla administrativa de la app será la vía de gestión diaria.
7. Copiar URL y Publishable Key a `.env.local`. Reservar `SUPABASE_SERVICE_ROLE_KEY` solo para variables de servidor seguras.
8. Registrar la migración en el historial del proyecto al adoptar Supabase CLI; no pegarla nuevamente en bases que ya la aplicaron.

## Verificación posterior

- Intentar leer una tabla con `anon`: debe fallar.
- Con un usuario activo `management`, probar select e inserción de datos de negocio y rechazar administración de usuarios.
- Con perfil inactivo, confirmar que no puede consultar ni mutar datos.
- Con dos sesiones, llamar a la conversión de la misma cotización simultáneamente y comprobar que se obtiene un solo proyecto.
- Confirmar que un cambio de precio de catálogo no cambia ítems ni presupuestos creados desde una cotización anterior.
