# Matriz de equivalencia — Etapa E

| Área | Resultado | Verificación |
| --- | --- | --- |
| Listado | Cinco métricas de cotización, siete de proyecto, totales y tarjetas de tres columnas | `quotes.spec.ts` en 1440, 900, 680 y 380 px |
| Editor | Cinco secciones en el orden del prototipo; las tres primeras abiertas | Captura de editor y controles de teclado |
| Nuevo borrador | Diálogo inicial con cliente, título, emisión y vigencia | Captura del diálogo en cuatro anchos |
| Catálogo e ítems | Búsqueda normalizada, categoría obligatoria, unidad editable, precio base/final y subtotal | Validación compartida y prueba funcional manual |
| Autoguardado | Espera de 800 ms, cola serial, revisión pendiente, error y reintento | Pruebas unitarias de validación; E2E autenticado pendiente |
| Conversión | Usa el contenido actual, confirma aprobación y bloquea la edición tras convertir | RPC existente; E2E autenticado pendiente |
| Documento | Orden, logo, tablas, porcentajes, total y tarjeta del gerente del prototipo | Captura de vista previa; impresión manual de varias páginas pendiente |
| Exportaciones | CSV UTF-8 con BOM y nueve columnas; impresión exclusiva de cotización y Finanzas | Pruebas unitarias de CSV y build de producción |

## Excepciones y límites deliberados

- Las tarjetas de cotización del prototipo no contienen barras de progreso; no se añadió una barra sin significado financiero. Las barras `pagado / valor` pertenecen a Panel y Proyectos.
- La cuenta y los permisos siguen siendo reales; no se restauró el selector de rol simulado.
- La tarjeta del gerente modifica la configuración global de Elecpro mediante la acción existente, no una copia privada por cotización.
- Las capturas solo se aprueban con fixtures y credenciales `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`. Sin ellas, Playwright registra los casos como omitidos y no genera una referencia engañosa.
