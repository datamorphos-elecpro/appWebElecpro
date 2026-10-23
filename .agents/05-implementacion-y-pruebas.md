# Implementación y pruebas

## Orden de implementación

1. Inicializar Next.js con TypeScript, instalar clientes de Supabase, configurar variables, estilos globales y la estructura de rutas.
2. Crear y aplicar la migración inicial conforme a [04-migraciones-supabase.md](04-migraciones-supabase.md). Verificar RLS antes de construir pantallas.
3. Implementar autenticación, Proxy de sesión, layout protegido, perfil y administración de usuarios.
4. Reproducir el shell visual: logo, barra lateral adaptable, cabecera, tema, componentes de tablas, formularios y diálogos.
5. Implementar clientes, proveedores y catálogo; usar estos datos en selectores y búsqueda de cotizaciones.
6. Implementar cotizaciones, guardado transaccional, cálculos de servidor, vista previa e impresión.
7. Implementar proyectos, conversión idempotente, anticipos, gastos, presupuestos y participaciones.
8. Construir panel, Análisis con el consolidado financiero integrado y alertas con consultas consistentes y filtros independientes.
9. Ejecutar pruebas automatizadas, revisión manual visual y pruebas de RLS antes de publicar.

## Casos de prueba funcionales

| Área | Escenario esperado |
| --- | --- |
| Cotización | Un material con incremento de 10 % aplica el factor solo una vez; mano de obra conserva el precio base. |
| Cotización | AIU se calcula sobre costo directo e IVA solo sobre utilidad; el total coincide en editor, vista previa y proyecto convertido. |
| Cotización | No se permite incremento cuando hay ítems sin categoría. |
| Cotización | IVA por ítem inicia en 0, admite vacío/coma/punto, aumenta el costo y precio; Material aplica incremento una vez y Todocosto/Transporte no lo reciben. |
| Impresión | Las seis columnas distintas de Descripción están centradas en ambos ejes y no parten códigos normales; IVA por ítem no se desglosa. |
| Conversión | Dos solicitudes simultáneas para una cotización aprobada producen el mismo proyecto, nunca dos. |
| Historial | Cambiar o desactivar un ítem de catálogo no modifica cotizaciones ni presupuestos ya guardados. |
| Proyecto | Anticipos actualizan pagado y saldo; gastos actualizan ganancia y alertan al exceder presupuesto. |
| Cotización | Ocultar AIU mantiene el mismo total; IVA adicional opcional se suma al IVA sobre utilidad y conserva la tasa al desactivar. |
| Cotización | Descuento porcentual/fijo conserva ambos valores y recalcula AIU e IVA sobre neto; un exceso fijo bloquea operaciones. Costo $1.000.000, descuento 10 %, A/I/U 8/3/10 %, ambos IVA 19 % da $1.277.100. La conversión conserva costos y usa ingreso descontado. Pruebas e historial en [QUOTE-DIRECT-DISCOUNT](../docs/QUOTE-DIRECT-DISCOUNT.md). |
| Retenciones | Reducen cartera sin alterar caja/ganancia; anulación restaura saldo; exceso rechazado y reintentos idempotentes. Cubierto suma anticipos y retenciones vigentes en barras, tablas, informe y CSV: $90.000 + $10.000 sobre $100.000 da 100 % y saldo $0. |
| Análisis | Las 14 tarjetas abren su detalle, con total completo independiente de la página y filtros iguales a la métrica. |
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
- Nuevos casos reproducibles de historial, SQL/RLS, concurrencia, endpoint y UI documentados en [FINANCE-IMPROVEMENTS](../docs/FINANCE-IMPROVEMENTS.md).

## Revisión visual y accesible

Comparar cada módulo con `../index.html` en escritorio, 900 px, 680 px y 380 px. Verificar menú colapsado en escritorio, panel móvil, contraste, foco visible, etiquetas de formularios, uso con Tab/Enter/Espacio y reducción de movimiento. La vista previa debe recoger el contenido que aún está en el editor y la impresión debe incluir solo el documento de cotización.

## Criterios de aceptación

La primera versión queda lista cuando un administrador puede invitar a un usuario, un usuario activo puede iniciar sesión, crear catálogo y cliente, emitir y aprobar una cotización, convertirla una sola vez en proyecto, registrar movimientos y consultar el panel sin depender de `localStorage`. Las políticas deben impedir cualquier acceso anónimo o de usuario inactivo, y los importes mostrados deben coincidir con los cálculos de servidor.
