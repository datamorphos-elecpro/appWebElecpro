# Producto y reglas de negocio

## Propósito

Elecpro centraliza la operación comercial, técnica y financiera de proyectos de ingeniería eléctrica. La interfaz y los textos de `../index.html` son la referencia visual. La aplicación de producción reemplazará únicamente la persistencia local por Supabase y añadirá autenticación y permisos reales.

## Convenciones globales

- Idioma: español de Colombia. Moneda: pesos colombianos (`COP`), mostrados sin decimales con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
- Zona horaria de presentación: `America/Bogota`. Las fechas operativas se guardan como `date`; las marcas de auditoría como `timestamptz`.
- Empresa única: Elecpro. La configuración de empresa es una única fila editable y no se filtra por organización.
- Estados de proyecto: `Borrador`, `Cotizado`, `Aprobado`, `En proceso`, `Pausado`, `Finalizado`, `Cancelado`.
- Estados de cotización: `Borrador`, `Enviada`, `Aprobada`, `Rechazada`. Una cotización no decidida cuya `valid_until` sea anterior a hoy se muestra como `Vencida`, sin cambiar automáticamente el estado guardado.
- Prioridades: `Baja`, `Media`, `Alta`, `Crítica`.
- Roles: `administrator` y `management`. Ambos pueden crear, editar, eliminar y consultar datos de negocio. Solo `administrator` gestiona usuarios y roles.

## Módulos

| Módulo | Comportamiento requerido |
| --- | --- |
| Panel general | Métricas de portafolio, proyectos activos, retrasados y próximos a finalizar; tabla de proyectos, alertas prioritarias y accesos a crear/exportar. |
| Análisis | Tres vistas independientes: Gerencia y rentabilidad, Operación y Comercial. Cada una conserva sus propios filtros. Gerencia integra el consolidado financiero, caja, cartera, presupuesto, rentabilidad, distribuciones generales e impresión. |
| Proyectos | Tarjetas del portafolio y detalle con pestañas Resumen, Anticipos, Gastos y presupuesto, Distribución y Fechas y condiciones. Crear, editar y exportar CSV. |
| Cotizaciones | Lista, métricas por estado y editor a ancho completo. Permite buscar catálogo, añadir ítems, cambiar condiciones, vista previa, impresión/PDF y conversión a proyecto. |
| Productos y servicios | CRUD del catálogo con búsqueda y filtro de categoría. El código es único sin distinguir mayúsculas, minúsculas ni acentos. |
| Proveedores | CRUD, búsqueda por nombre, contacto o asesor, teléfono, correo, web o descripción. |
| Clientes | CRUD de la ficha reutilizable: nombre, tipo, contacto, teléfono, correo y dirección; muestra los proyectos asociados. |
| Alertas | Lista calculada al consultar; abre el proyecto asociado. No se persiste como una tabla de notificaciones en la primera versión. |

## Formularios y operaciones

### Clientes, proveedores y catálogo

- Cliente: nombre, tipo, contacto, teléfono, correo y dirección. El nombre es obligatorio.
- Proveedor: nombre, contacto o asesor opcional, teléfono, correo, sitio web y descripción. El nombre es obligatorio.
- Ítem de catálogo: código, descripción, unidad, precio base y categoría `Material` o `Mano de obra`. Código, descripción, unidad, precio y categoría son obligatorios; el precio no puede ser negativo.
- Eliminar clientes con cotizaciones o proyectos, catálogo usado o proveedores asociados a datos futuros debe quedar bloqueado o usar un campo `is_active`; la primera implementación debe preferir desactivación para conservar historial.

### Proyectos

Campos: tipo/título, cliente, valor, estado, prioridad, responsable, lugar de ejecución, fecha inicial, fecha final prevista, fecha final real, observaciones, modelo de ganancia y ganancia inicial manual.

- `profit_mode = value`: ganancia = valor del proyecto − gastos reales.
- `profit_mode = manual`: ganancia = ganancia inicial manual − gastos reales.
- La ganancia proyectada sustituye gastos reales por presupuesto total.
- Anticipo: fecha, monto positivo, medio de pago y observación.
- Gasto: fecha, categoría, monto positivo, medio de pago y descripción.
- Presupuesto manual: categoría, monto positivo y descripción. El presupuesto creado desde una cotización conserva precio base, precio final, cantidad, subtotal base y subtotal comercial.
- Participación de proyecto: participante, modo `percent` o `fixed`, valor no negativo, base (`project_value` o `real_profit`), estado pagado y fecha de pago opcional.

### Cotizaciones

Campos principales: número, cliente, título, emisión, vigencia, estado, saludo, descripción, objetivo, notas, alcance, beneficios, exclusiones, condiciones de pago, tiempo de ejecución y entregable.

Cada ítem tiene código, descripción, categoría, cantidad, unidad, precio base y referencia opcional al catálogo. La categoría es obligatoria antes de aplicar incremento a materiales. El código y descripción se pueden conservar como texto aunque el ítem proceda del catálogo, para mantener la instantánea.

Una cotización aprobada se convierte una sola vez. Después de hacerlo queda bloqueada para edición comercial y el botón abre el proyecto vinculado.

## Fórmulas

Para cada ítem `i`:

```text
precio_final_i = precio_base_i × (1 + incremento_materiales / 100)  si categoría = Material
precio_final_i = precio_base_i                                en otro caso
subtotal_i = cantidad_i × precio_final_i
costo_directo = Σ subtotal_i
administración = costo_directo × administración_pct / 100
imprevistos = costo_directo × imprevistos_pct / 100
utilidad = costo_directo × utilidad_pct / 100
iva_utilidad = utilidad × iva_utilidad_pct / 100
total_cotización = costo_directo + administración + imprevistos + utilidad + iva_utilidad
```

El incremento solo se aplica una vez sobre el precio base de cada material. AIU y el IVA se calculan sobre el costo directo, salvo el IVA que se calcula únicamente sobre utilidad. Usar valores `numeric` y redondear para presentación, no entre pasos de la fórmula.

Para un proyecto:

```text
pagado = Σ anticipos
saldo = max(0, valor_proyecto − pagado)
gastos = Σ gastos_reales
presupuesto = Σ presupuestos
ganancia_actual = valor_proyecto − gastos                  (modo value)
ganancia_actual = ganancia_inicial_manual − gastos         (modo manual)
```

Una participación porcentual se calcula sobre la base configurada; una fija usa su propio valor. Las distribuciones generales usan la ganancia consolidada del portafolio.

## Conversión cotización → proyecto

La operación debe ejecutarse en una única transacción en base de datos.

1. Bloquear la cotización y verificar que no tiene proyecto vinculado.
2. Verificar que está en estado `Aprobada` o aprobarla como parte de la misma operación explícita.
3. Crear el proyecto con cliente, título, total comercial, descripción, responsable configurado, dirección del cliente, fechas predeterminadas y modo de ganancia `value`.
4. Copiar cada ítem como presupuesto con importes base y finales ya calculados; no apuntar al precio actual del catálogo.
5. Vincular proyecto y cotización, registrar auditoría y devolver el proyecto creado.
6. Si el proyecto ya existe, devolver ese mismo proyecto sin crear otro.

## Alertas internas

- Retraso: proyecto no cancelado, borrador ni cotizado cuya fecha prevista ya pasó; para finalizados se compara con su fecha real.
- Sobrecosto: gastos reales mayores que presupuesto y presupuesto mayor que cero.
- Cartera: saldo mayor que cero en proyectos distintos de borrador o cancelado.
- Finalización próxima: proyecto activo con fecha prevista entre hoy y los próximos 15 días.

Las alertas se calculan con la fecha actual de Bogotá. No implican correos ni tareas programadas. Una fase futura podrá añadir el resumen semanal y recordatorios externos sin modificar las reglas anteriores.

## Diseño y accesibilidad

Conservar de `index.html` la paleta verde, superficies claras, logo, barra lateral colapsable y diálogo de vista previa. En móvil la navegación se abre como panel superpuesto. Los controles deben tener etiquetas, foco visible y activación por teclado; los gráficos se implementarán con etiquetas equivalentes y datos tabulares accesibles. La impresión debe ocultar la aplicación y emitir solo el documento de cotización.
