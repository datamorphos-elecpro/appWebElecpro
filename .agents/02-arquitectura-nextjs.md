# Arquitectura Next.js

## Base técnica

Crear una aplicación con `create-next-app`, TypeScript, ESLint, npm y App Router. Usar React Server Components para carga inicial, Server Actions para mutaciones y Client Components solo para formularios, filtros, editor de cotización, diálogos, navegación adaptable y visualizaciones.

Instalar `@supabase/supabase-js` y `@supabase/ssr`. Configurar clientes de navegador y servidor con cookies, junto con `proxy.ts` para refrescar sesiones. Proteger rutas y operaciones con `supabase.auth.getClaims()`; no usar `getSession()` para autorizar.

Variables requeridas en `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

La clave `SUPABASE_SERVICE_ROLE_KEY` solo se leerá en código de servidor para invitaciones y administración de usuarios. Nunca se añadirá al cliente ni a una variable `NEXT_PUBLIC_*`.

## Estructura propuesta

```text
app/
  (auth)/login/page.tsx
  (auth)/recuperar-acceso/page.tsx
  (protected)/layout.tsx
  (protected)/page.tsx
  (protected)/analisis/page.tsx
  (protected)/proyectos/page.tsx
  (protected)/proyectos/[projectId]/page.tsx
  (protected)/cotizaciones/page.tsx
  (protected)/cotizaciones/[quoteId]/page.tsx
  (protected)/catalogo/page.tsx
  (protected)/proveedores/page.tsx
  (protected)/clientes/page.tsx
  (protected)/finanzas/page.tsx
  (protected)/alertas/page.tsx
  (protected)/administracion/usuarios/page.tsx
  actions/
components/
  layout/ ui/ projects/ quotes/ analytics/ admin/
lib/
  supabase/client.ts
  supabase/server.ts
  supabase/proxy.ts
  auth.ts
  permissions.ts
  money.ts
  calculations.ts
  validators/
styles/
  tokens.css globals.css
```

La ruta protegida raíz es el panel general. El layout consulta el perfil activo, impide el acceso de usuarios inactivos y muestra nombre, rol y navegación. `administracion/usuarios` exige `administrator` desde el servidor, no solo mediante ocultamiento visual.

## Capa de datos y acciones

- Las páginas consultan con el cliente de servidor autenticado y funciones de consulta específicas por módulo. Nunca pasan una clave de administrador al navegador.
- Las Server Actions validan entradas con esquemas compartidos, verifican sesión y rol, ejecutan una mutación y revalidan la ruta afectada.
- Crear/actualizar cotizaciones y convertirlas a proyecto llama a funciones RPC de PostgreSQL para preservar consistencia.
- Las búsquedas, filtros y orden de tablas se expresan mediante parámetros de URL validados, para poder compartir enlaces y mantener renderizado en servidor.
- El editor sincroniza los valores locales de campos en cada entrada; antes de vista previa, impresión o guardado realiza validación y conserva el último valor escrito.

## Autenticación y usuarios

1. Deshabilitar registros públicos en Supabase Auth.
2. Crear el primer usuario administrador en Supabase Auth y enlazar o actualizar su perfil con rol `administrator`.
3. Inicio de sesión por correo y contraseña; cierre de sesión desde el menú de cuenta.
4. Recuperación de contraseña mediante el flujo de Supabase con URL de retorno permitida.
5. La pantalla administrativa invitará usuarios por correo mediante una Route Handler o Server Action que usa `service_role`, crea/actualiza el perfil y asigna rol. Debe registrar la acción en auditoría.
6. Desactivar un usuario marca `profiles.is_active = false`, invalida su acceso en las políticas y solicita al administrador revocar sesiones mediante la API administrativa. Nunca elimina proyectos ni auditoría.

## Estilos y componentes

Extraer los tokens de color, espaciado, tipografía, estados y estilos de impresión de `index.html` a `styles/tokens.css` y `globals.css`. Cada módulo usa CSS Module para su distribución propia. Crear componentes reutilizables para botón, tabla adaptable, diálogo, campos, estados, métricas, filtros, tarjeta y mensaje vacío. No añadir un framework de componentes que cambie la identidad del prototipo.

## Responsabilidades de permisos

| Acción | `management` | `administrator` |
| --- | --- | --- |
| Consultar, crear, editar, desactivar datos de negocio | Sí | Sí |
| Imprimir y exportar | Sí | Sí |
| Cambiar configuración de empresa | Sí | Sí |
| Invitar, desactivar usuarios y cambiar roles | No | Sí |

RLS aplica el mismo modelo. El servidor repite estas comprobaciones para las acciones privilegiadas; las restricciones de interfaz son solo una ayuda de experiencia.
