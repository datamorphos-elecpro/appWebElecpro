# Gráficos y responsive de Elecpro

## Alcance y estado

Implementación terminada; **aceptación integral pendiente del entorno autenticado de prueba**. No se modificaron `index.html`, cálculos financieros, APIs, permisos, base de datos ni migraciones. Las comprobaciones del navegador usaron Chromium local y datos sintéticos o páginas públicas; no se inició sesión ni se modificaron datos productivos.

Los dos gráficos de barras conservan sus propiedades públicas, formatos, series y acciones. Comparten `HorizontalBarChart` y `bar-chart-layout`: aritmética Decimal hasta la geometría, eje proporcional, columnas separadas, medición con `getComputedTextLength` en la fuente del SVG, nombres multilínea, reajuste por datos/ResizeObserver/carga de fuentes y desplazamiento local con foco e indicación. Cada fila es un SVG independiente para conservarla completa en impresión.

Se corrigieron contenedores, acciones, textos extensos, porcentajes, distribuciones, importes del editor, tablas accesibles, navegación y retorno del foco del menú de cuenta. Las vistas previas usan cabecera automática y cuerpo flexible limitado al viewport. Las tablas de documentos impresos permiten ajustar texto. No se añadió ocultamiento horizontal global.

## Matriz de ejecución

**A**: comprobación automatizada aprobada; **P**: pendiente, no aprobada. Las capturas son evidencias de esta ejecución, no comparaciones contra baselines previamente aprobadas.

| Pantalla o componente | 320 | 380 | 680 | 900 | 1440 | 1920 | Alcance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Portada | A | A | A | A | A | A | Ancho de página y captura completa |
| Acceso | A | A | A | A | A | A | Ancho, captura; controles y contraseña probados aparte |
| Recuperación | A | A | A | A | A | A | Ancho, captura y controles |
| Barras compartidas, datos sintéticos | A | A | A | A | A | A | Límites geométricos, separación nombre/importe, desplazamiento, cambio de datos y tamaño |
| Porcentajes y distribuciones sintéticos | A | A | A | A | A | A | Nombres sin espacios y porcentajes/importes extensos, sin desbordamiento de página |
| Panel | P | P | P | P | P | P | Revisión de código y ajustes compartidos; falta sesión |
| Análisis: Gerencia, Operación, Comercial | P | P | P | P | P | P | Falta sesión y datos deterministas |
| Distribuciones de la aplicación | P | P | P | P | P | P | Falta sesión |
| Proyectos y detalle | P | P | P | P | P | P | Falta sesión y E2E_PROJECT_ID |
| Cotizaciones y editor | P | P | P | P | P | P | Falta sesión y E2E_QUOTE_ID |
| Clientes | P | P | P | P | P | P | Falta sesión |
| Proveedores | P | P | P | P | P | P | Falta sesión |
| Catálogo | P | P | P | P | P | P | Falta sesión |
| Alertas | P | P | P | P | P | P | Falta sesión |
| Administración de usuarios | P | P | P | P | P | P | Falta cuenta administradora de prueba |

Públicas: también 379/381, 479/480/481, 599/600/601, 679/681, 699/700/701, 899/901 y 1179/1180/1181 px. Barras: también 379/381, 479/480/481, 679/681, 899/901 y 1180/1181 px.

## Interacciones e impresión

| Caso | Resultado |
| --- | --- |
| Enter y Espacio sobre barras | A; se verificó el identificador seleccionado |
| Flechas sobre contenedor desplazable | A; se comprobó cambio de scrollLeft |
| Importe máximo visible al desplazar | A; caja del texto dentro del contenedor |
| Nombres e importes dentro de cada SVG | A; getBBox, límites y separación, además de capturas |
| Lista de 24 filas, signos mixtos, positivos, negativos, ceros, vacío, varias series | A; fixture independiente de Next/Supabase |
| Cambios de datos a importes de mayor longitud | A |
| Vista previa sintética en horizontal 680 × 320 | A; cierre dentro del viewport, Escape y retorno del foco |
| Zoom CSS al 200 % | A; emulación de reflujo, no equivale a certificar zoom nativo en todos los navegadores |
| Desplazamiento táctil | A; eventos táctiles emulados en Chromium, pendiente dispositivo físico |
| Impresión de barras sintéticas | A; sin scroll, PDF de cinco páginas renderizado e inspeccionado completo, filas y textos íntegros |
| Vista previa e impresión reales de cotización/informe | P; requiere datos autenticados |
| Sidebar expandido/contraído, navegación móvil y cuenta reales | P; pruebas preparadas, falta sesión |
| Zoom nativo 200 % de toda la aplicación, orientación y táctil real | P |
| Carga tardía de fuentes | Recalculo implementado; simulación específica pendiente |

## Validación técnica

- Vitest: **44 aprobadas**, 11 archivos; incluye 9 pruebas nuevas de geometría.
- Playwright gráficos: **19 aprobadas** más **1 aprobada** de porcentajes/distribuciones (20 casos en total).
- Playwright públicas y acceso: **31 aprobadas, 25 omitidas**. Las omitidas corresponden a 24 tamaños privados y un filtro autenticado; no cuentan como aprobadas.
- ESLint, TypeScript y compilación Next.js: aprobados.
- Revisión visual directa: capturas de barras 320/1440, portada 320/1440, acceso y recuperación 320; cinco páginas del PDF. Las demás capturas se generaron y comprobaron por geometría, sin afirmar revisión visual humana individual.

## Evidencias

Selección persistida en `docs/responsive-evidence/`:

- [Barras, 320 px desplazadas al extremo derecho](responsive-evidence/charts-320.png).
- [Barras, 1440 px](responsive-evidence/charts-1440.png).
- [Portada, 320 px](responsive-evidence/portada-320.png) y [1440 px](responsive-evidence/portada-1440.png).
- [Acceso, 320 px](responsive-evidence/login-320.png) y [recuperación, 320 px](responsive-evidence/recuperar-acceso-320.png).
- `charts.pdf` y `print-page-1.png` a `print-page-5.png`: impresión sintética revisada. No representan un informe financiero productivo.

La ejecución completa deja capturas por tamaño en `test-results/public-responsive/` y `test-results/charts-final/` (ignorados por Git y regenerables). Se conserva una selección estable para evitar versionar todas las capturas repetidas.

## Reproducción y cierre pendiente

```powershell
npm test
npm run lint
npm run build
npm run test:charts
npx playwright test tests/visual/responsive.spec.ts tests/visual/login.spec.ts --output=test-results/public-responsive
```

Los fixtures se sirven con Vite en `127.0.0.1:3100`; no añaden ninguna ruta de diagnóstico a producción. Requieren Chromium instalado para Playwright. En este entorno hubo que permitir procesos auxiliares fuera del sandbox por `spawn EPERM`.

Para ejecutar la parte privada, configurar `PLAYWRIGHT_BASE_URL`, `E2E_TEST_ENVIRONMENT=true`, `E2E_TEST_EMAIL` y `E2E_TEST_PASSWORD` **exclusivamente con entorno/cuenta de prueba**. Añadir `E2E_PROJECT_ID` y `E2E_QUOTE_ID` de fixtures; sin ellos los detalles siguen pendientes. Usar cuenta administradora para la matriz completa y probar permisos de gerencia aparte. El helper espera terminar el inicio de sesión y utiliza el botón actual «Iniciar sesión».

Ejecutar las suites `responsive`, `shell`, `analytics` y `quotes`, inspeccionar las capturas y completar los casos P antes de declarar cumplido el criterio de cierre para toda la aplicación. Las pruebas existentes de editor pueden guardar borradores: no apuntarlas a producción.
