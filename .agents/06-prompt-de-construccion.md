# Prompt de construcción

Usa este texto como instrucción inicial para implementar la aplicación. Adjunta o mantén disponibles `index.html`, `AGENTS.md` y todos los archivos de `.agents`.

```text
Implementa la aplicación de producción Elecpro en este repositorio. El prototipo index.html es la referencia visual y funcional. Lee primero AGENTS.md y después todos los documentos de .agents en su orden.

Construye con Next.js App Router, TypeScript, npm, CSS Modules y Supabase. Mantén el diseño, español colombiano, moneda COP y zona horaria America/Bogota. No conviertas el HTML mecánicamente: extrae componentes reutilizables y conserva sus comportamientos.

Antes de construir pantallas, crea supabase/migrations/<timestamp>_initial_elecpro.sql según .agents/03-modelo-de-datos.md y .agents/04-migraciones-supabase.md. Debe incluir esquema, tablas, índices, relaciones, restricciones, triggers, funciones transaccionales, auditoría, grants y RLS. No pongas datos de demostración en esa migración. Explica cómo ejecutarla desde Supabase SQL Editor y cómo crear el primer administrador.

Implementa autenticación por correo y contraseña mediante @supabase/ssr, clientes de navegador/servidor y proxy de renovación de sesión. El registro público está deshabilitado. Ambos roles, administrator y management, gestionan datos de negocio; solo administrator gestiona usuarios desde una pantalla de administración. Nunca expongas la clave de servicio en el cliente.

Implementa los módulos Panel general, Análisis, Proyectos, Cotizaciones, Productos y servicios, Proveedores, Clientes y Alertas. Integra el consolidado financiero en la vista Gerencia y rentabilidad de Análisis. La cotización debe calcular incremento no acumulativo solo para materiales, AIU e IVA sobre utilidad. El servidor y PostgreSQL son la fuente de verdad para cálculos. La conversión de cotización aprobada a proyecto debe ser transaccional, idempotente y conservar instantáneas de precios y presupuesto.

Implementa alertas internas calculadas. No implementes correos programados ni resúmenes semanales: déjalos documentados como trabajo futuro. Añade pruebas unitarias de cálculos, integración de RPC/acciones y pruebas de RLS, además de verificación responsive, accesibilidad de teclado e impresión exclusiva de cotización.

Entrega una lista breve de archivos creados o modificados, comandos de validación ejecutados, resultados, variables de entorno necesarias y pasos exactos para aplicar la migración en Supabase.
```

## Información que debe pedir o asumir

Antes de usar Supabase real, solicitar URL, Publishable Key, URL pública de la aplicación y correo del primer administrador. Si no existen, crear `.env.example` sin secretos y dejar la integración lista para configurar. No detener la implementación de componentes, esquema ni pruebas locales por falta de estas credenciales.
