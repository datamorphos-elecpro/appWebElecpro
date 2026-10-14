# Presentación e impresión de cotizaciones

Validación inicial del 2 de octubre de 2026; actualización del 13 de octubre de 2026.

## Cambios

`QuoteDocument` usa una tabla de ítems con distribución automática: las seis columnas compactas toman el ancho necesario y Descripción recibe el restante. En pantalla conserva un ancho mínimo de 720 px dentro de un contenedor desplazable; en impresión se adapta al papel. Ítem, Código, Cant., Unidad, Valor Unitario y Total están centrados horizontal y verticalmente, sin saltos de línea. Códigos normales como MO-001 quedan completos; cadenas excepcionales admiten división dentro de un contenedor de máximo 12ch. Descripción conserva texto justificado y alineación superior. Los encabezados se repiten y las filas que caben completas evitan cortes de página.

El saludo tiene su propio párrafo, separado del destinatario. Se justifican las descripciones y todos los textos narrativos solicitados, con última línea a la izquierda y saltos escritos por el usuario conservados. Las reglas móviles de cabecera y firma se limitan a pantalla para que no cambien según el papel al imprimir.

El botón mantiene `window.print()`, el selector conserva los tres tamaños de letra y se añade la indicación sobre las opciones del diálogo. La regla de página es `size: auto; margin: 12mm`, conforme a [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40page/size).

## Comprobaciones automatizadas y revisión PDF

El IVA por ítem se incluye en los importes comerciales, sin columna ni desglose en el documento. El resumen mantiene IVA sobre utilidad y su alineación previa. La suite incorpora verificaciones de centrado en ambos ejes, MO-001 en una línea y valores comerciales con IVA. Para cálculos y migraciones, consultar [IVA por ítem](QUOTE-ITEM-VAT.md).

Los resultados siguientes corresponden a la validación inicial; los resultados de la actualización se registran en la sección final.

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
2. Elegir Guardar como PDF, probar Carta y A4 y alternar vertical/horizontal. Confirmar que las elecciones del diálogo se aplican.<!--  -->
3. Probar márgenes personalizados distintos de 12 mm, por ejemplo 20 mm; comprobar visualmente las guías y el PDF guardado. Registrar navegador, versión y resultado.
4. Comprobar que el diálogo ofrece las opciones disponibles para el destino elegido, incluidos páginas, escala y, cuando corresponda, copias.

Los ajustes de alineación no requieren cambios de datos; el IVA por ítem y las categorías sí requieren las dos migraciones del 13 de octubre, descritas en [IVA por ítem](QUOTE-ITEM-VAT.md).

## Validación del 13 de octubre

Pasaron 106 pruebas unitarias y 29 pruebas de navegador (21 del documento y 8 del editor). Se verificaron centrado horizontal/vertical, código MO-001 en una línea, IVA incorporado en los valores sin columna adicional, desplazamiento móvil y encabezados repetidos. Se rasterizaron las 12 combinaciones PDF con PDFium: entre 4 y 7 páginas por documento, con revisión visual de formatos y páginas representativas sin texto recortado ni superpuesto. La compilación de producción, TypeScript y lint fueron aprobados. Los PDF y capturas automatizados quedan en `test-results/`; la revisión rasterizada temporal queda en `.supabase/pdf-review/`.
