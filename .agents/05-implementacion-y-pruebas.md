# Implementación y pruebas

## Orden de implementación

1. Inicializar Next.js con TypeScript, instalar clientes de Supabase, configurar variables, estilos globales y la estructura de rutas.
2. Crear y aplicar la migración inicial conforme a [04-migraciones-supabase.md](04-migraciones-supabase.md). Verificar RLS antes de construir pantallas.
3. Implementar autenticación, Proxy de sesión, layout protegido, perfil y administración de usuarios.
4. Reproducir el shell visual: logo, barra lateral adaptable, cabecera, tema, componentes de tablas, formularios y diálogos.
5. Implementar clientes, proveedores y catálogo; usar estos datos en selectores y búsqueda de cotizaciones.
6. Implementar cotizaciones, guardado transaccional, cálculos de servidor, vista previa e impresión.
7. Implementar proyectos, conversión idempotente, anticipos, gastos, presupuestos y participaciones.
8. Construir panel, finanzas, análisis y alertas con consultas consistentes y filtros independientes.
9. Ejecutar pruebas automatizadas, revisión manual visual y pruebas de RLS antes de publicar.

## Casos de prueba funcionales

| Área | Escenario esperado |
| --- | --- |
| Cotización | Un material con incremento de 10 % aplica el factor solo una vez; mano de obra conserva el precio base. |
| Cotización | AIU se calcula sobre costo directo e IVA solo sobre utilidad; el total coincide en editor, vista previa y proyecto convertido. |
| Cotización | No se permite incremento cuando hay ítems sin categoría. |
| Conversión | Dos solicitudes simultáneas para una cotización aprobada producen el mismo proyecto, nunca dos. |
| Historial | Cambiar o desactivar un ítem de catálogo no modifica cotizaciones ni presupuestos ya guardados. |
| Proyecto | Anticipos actualizan pagado y saldo; gastos actualizan ganancia y alertan al exceder presupuesto. |
| Proyecto | Ganancia en modo manual usa ganancia inicial, no valor contratado. |
| Alertas | Solo aparecen retraso, sobrecosto, cartera y finalización próxima bajo las condiciones de producto. |
| Análisis | Filtros de Gerencia, Operación y Comercial no se afectan entre sí. |
| Usuarios | Gerencia administra datos de negocio, pero no puede invitar ni cambiar roles; usuario inactivo no accede. |

## Pruebas técnicas

- Unitarias para `calculations.ts`: importes, redondeo de presentación, saldos, ganancias, participaciones y reglas de retraso.
- Integración para Server Actions y RPC: validación, consecutivos concurrentes, guardado de cotización y conversión.
- Pruebas de base de datos que cubran `select`, `insert`, `update` y `delete` con `anon`, `authenticated` activo, administrador y usuario inactivo.
- Pruebas de interfaz con navegación por teclado, cierre de diálogo, búsqueda, filtros por URL, estados vacíos y mensajes de error.
- Construcción de producción con `npm run build`, verificación de tipos y linter configurado.

## Revisión visual y accesible

Comparar cada módulo con `../index.html` en escritorio, 900 px, 680 px y 380 px. Verificar menú colapsado en escritorio, panel móvil, contraste, foco visible, etiquetas de formularios, uso con Tab/Enter/Espacio y reducción de movimiento. La vista previa debe recoger el contenido que aún está en el editor y la impresión debe incluir solo el documento de cotización.

## Criterios de aceptación

La primera versión queda lista cuando un administrador puede invitar a un usuario, un usuario activo puede iniciar sesión, crear catálogo y cliente, emitir y aprobar una cotización, convertirla una sola vez en proyecto, registrar movimientos y consultar el panel sin depender de `localStorage`. Las políticas deben impedir cualquier acceso anónimo o de usuario inactivo, y los importes mostrados deben coincidir con los cálculos de servidor.
