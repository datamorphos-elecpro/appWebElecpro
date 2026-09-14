# Guía de reconstrucción de Elecpro

Estos documentos convierten el prototipo `../index.html` en una especificación para una aplicación productiva con Next.js y Supabase. No son código de aplicación ni migraciones ejecutables.

## Orden de lectura

1. [Producto y reglas de negocio](01-producto-y-reglas.md): módulos, flujos, cálculos y límites funcionales.
2. [Arquitectura Next.js](02-arquitectura-nextjs.md): estructura, rutas, autenticación y responsabilidades cliente/servidor.
3. [Modelo de datos](03-modelo-de-datos.md): entidades, columnas, relaciones y reglas de integridad.
4. [Migraciones y Supabase](04-migraciones-supabase.md): contenido obligatorio del futuro archivo SQL y ejecución en SQL Editor.
5. [Implementación y pruebas](05-implementacion-y-pruebas.md): orden de trabajo, criterios de aceptación y pruebas.
6. [Prompt de construcción](06-prompt-de-construccion.md): instrucción completa para iniciar la implementación.

## Decisiones cerradas

- Una sola empresa, Elecpro.
- Autenticación con correo y contraseña; sin registro público.
- Roles `administrator` y `management`. Ambos gestionan los datos del negocio; solo `administrator` gestiona usuarios y roles.
- Datos ficticios opcionales y separados de la migración estructural.
- Alertas internas en la primera versión. Correos, resúmenes semanales y tareas programadas se consideran una fase posterior.
