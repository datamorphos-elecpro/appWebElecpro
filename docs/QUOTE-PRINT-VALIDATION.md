# Presentación e impresión de cotizaciones

Validación del 2 de octubre de 2026.

## Cambios

`QuoteDocument` usa una tabla de ítems con distribución automática, descripción preferente del 45% y columnas cortas ajustadas al contenido. En pantalla conserva un ancho mínimo de 720 px dentro de un contenedor desplazable; en impresión se adapta al papel. Los códigos largos se parten sin recortarse y cantidades e importes conservan su alineación a la derecha. Los encabezados se repiten y las filas que caben completas evitan cortes de página.

El saludo tiene su propio párrafo, separado del destinatario. Se justifican las descripciones y todos los textos narrativos solicitados, con última línea a la izquierda y saltos escritos por el usuario conservados. Las reglas móviles de cabecera y firma se limitan a pantalla para que no cambien según el papel al imprimir.

El botón mantiene `window.print()`, el selector conserva los tres tamaños de letra y se añade la indicación sobre las opciones del diálogo. La regla de página es `size: auto; margin: 12mm`, conforme a [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40page/size).

## Comprobaciones automatizadas y revisión PDF

- `npm test`: 75 pruebas unitarias aprobadas.
- `npm run lint`: aprobado.
- `npm run build`: compilación de producción aprobada.
- `npx playwright test --config playwright.charts.config.ts tests/charts/quote-print.spec.ts`: suite ampliada de 21 casos, con capturas y PDF en `test-results/`.
- Vista previa a 1440, 900, 680 y 380 px, tanto con datos habituales como extensos; las columnas no recortan contenido y el desplazamiento horizontal queda dentro del documento.
- Los datos extensos incluyen un código de 88 caracteres sin espacios, descripción con saltos de línea, cantidades `1234.56` y totales de ítem superiores a un billón de pesos.
- Generación de las 12 combinaciones: Carta/A4, vertical/horizontal, compacto/normal/grande. Comprobación de dimensiones reales del PDF y revisión visual de páginas rasterizadas con PDFium. Los documentos de prueba tienen entre 4 y 7 páginas; se verificaron encabezados repetidos, filas completas y texto legible sin superposiciones ni recortes.
- Se verifica la llamada del botón a `window.print()`, persistencia del tamaño de letra, funcionamiento sin almacenamiento y emisión exclusiva del documento.

Las pruebas usan los componentes reales en una fixture aislada, sin acceso a Supabase. Las comprobaciones del PDF mediante código y su revisión visual son independientes del diálogo interactivo del navegador.

## Comprobación manual del diálogo: pendiente

No se pudo operar el diálogo real: el control visual no tiene navegadores disponibles y las aperturas de Chrome y Edge respondieron `Browser is not available`. Las pruebas automatizadas usan Chromium. No se afirma haber validado Chrome, Edge ni el respeto de márgenes personalizados en sus diálogos.

Para completar esta comprobación en ambos navegadores:

1. Abrir una cotización de varias páginas y pulsar «Imprimir / guardar PDF».
2. Elegir Guardar como PDF, probar Carta y A4 y alternar vertical/horizontal. Confirmar que las elecciones del diálogo se aplican.
3. Probar márgenes personalizados distintos de 12 mm, por ejemplo 20 mm; comprobar visualmente las guías y el PDF guardado. Registrar navegador, versión y resultado.
4. Comprobar que el diálogo ofrece las opciones disponibles para el destino elegido, incluidos páginas, escala y, cuando corresponda, copias.

No se requieren migraciones ni cambios de datos para estos ajustes.
