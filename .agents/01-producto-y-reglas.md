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
- Ítem de catálogo: código, descripción, unidad, precio base y categoría Material, Diseño, Visita Técnica, Servicio MO, Todocosto o Transporte. Código, descripción, unidad, precio y categoría son obligatorios; el precio no puede ser negativo.
- Eliminar clientes con cotizaciones o proyectos, catálogo usado o proveedores asociados a datos futuros debe quedar bloqueado o usar un campo `is_active`; la primera implementación debe preferir desactivación para conservar historial.

### Proyectos

Campos: tipo/título, cliente, valor, estado, prioridad, responsable, lugar de ejecución, fecha inicial, fecha final prevista, fecha final real, observaciones, modelo de ganancia y ganancia inicial manual.

- `profit_mode = value`: ganancia = valor del proyecto − gastos reales.
- `profit_mode = manual`: ganancia = ganancia inicial manual − gastos reales.
- La ganancia proyectada sustituye gastos reales por presupuesto total.
- Anticipo: fecha, monto positivo, medio de pago y observación.
- Gasto: fecha, categoría, monto positivo, medio de pago y descripción.
- Categorías de gasto: selector con búsqueda y texto nuevo; ofrece únicamente Materiales, Mano de obra, Transporte, Terceros, Equipos, Alquiler de equipos, Herramientas, Viáticos y alimentación, Ingeniería y diseño, Permisos y certificaciones y Varios, en ese orden. Permite guardar texto libre sin incorporarlo a las sugerencias ni modificar registros anteriores.
- Retención: fecha, tipo (Retención en la fuente, ReteIVA, ReteICA u Otra retención), valor positivo manual y observación obligatoria para Otra. Se registra por proyecto, reduce cartera y no altera caja, gastos ni ganancia. No puede superar el saldo disponible. Se corrige anulando con motivo y registrando otra, conservando auditoría.
- Presupuesto manual: categoría, monto positivo y descripción. El presupuesto creado desde una cotización conserva precio base, precio final, cantidad, subtotal base y subtotal comercial.
- Participación de proyecto: participante, modo `percent` o `fixed`, valor no negativo, base (`project_value` o `real_profit`), estado pagado y fecha de pago opcional.

### Cotizaciones

Campos principales: número, cliente, título, emisión, vigencia, estado, saludo, descripción, objetivo, notas, alcance, beneficios, exclusiones, condiciones de pago, tiempo de ejecución y entregable.

Cada ítem tiene código, descripción, categoría, cantidad, unidad, precio base, IVA (%) opcional y referencia opcional al catálogo. IVA inicia en 0; vacío equivale a 0 y admite hasta dos decimales entre 0 y 100. Se define por cotización, no en catálogo, y no se desglosa en el documento del cliente. La categoría es obligatoria antes de aplicar incremento a materiales. El código y descripción se pueden conservar como texto aunque el ítem proceda del catálogo, para mantener la instantánea.

Una cotización aprobada se convierte una sola vez. Después de hacerlo queda bloqueada para edición comercial y el botón abre el proyecto vinculado.

El resumen incluye Mostrar AIU (inicialmente sí), Aplicar IVA al costo directo y Aplicar descuento al costo directo (ambos inicialmente no). Al ocultar AIU, solo el documento agrupa costo directo neto y A/I/U como Subtotal del servicio, conservando impuestos separados y el mismo total. Los campos económicos siguen siendo obligatorios en el editor. IVA sobre costo directo tiene tasa editable inicial 19 %, de 0 a 100 con dos decimales; se suma al IVA sobre utilidad. Las opciones se bloquean al convertir. Cotizaciones anteriores conservan sus importes sin recalcularlos.

El descuento usa el costo directo actual, incluidos IVA por ítem e incremento. Permite porcentaje (0–100) o valor fijo (0–costo directo), hasta dos decimales, con valores iniciales 0 e independientes que se conservan al cambiar de tipo, desactivar, guardar o recuperar borrador. Desactivarlo excluye el descuento; AIU y ambos impuestos se calculan sobre el neto cuando está activo. Un exceso fijo tras modificar ítems exige corrección o desactivación y bloquea guardado, vista previa, impresión y conversión. El documento muestra importe anterior, descuento negativo identificado por tipo y subtotal neto, incluso si el descuento es 0. Con AIU oculto, el importe anterior es costo directo original más AIU recalculado. Los precios de ítems y el presupuesto de costos conservan su fórmula; solo se reduce el ingreso comercial del proyecto. Ver [contrato y despliegue](../docs/QUOTE-DIRECT-DISCOUNT.md).

## Fórmulas

Para cada ítem `i`:

```text
costo_unitario_i = precio_base_i × (1 + iva_item_i / 100)
precio_final_i = costo_unitario_i × (1 + incremento_materiales / 100)  si categoría = Material
precio_final_i = costo_unitario_i                                    en otro caso
total_base_i = cantidad_i × precio_base_i
total_costo_i = cantidad_i × costo_unitario_i
subtotal_i = cantidad_i × precio_final_i
costo_directo = Σ subtotal_i
descuento = costo_directo × descuento_pct / 100 o valor_fijo, si está activado; 0 en otro caso
costo_directo_neto = costo_directo − descuento
administración = costo_directo_neto × administración_pct / 100
imprevistos = costo_directo_neto × imprevistos_pct / 100
utilidad = costo_directo_neto × utilidad_pct / 100
iva_utilidad = utilidad × iva_utilidad_pct / 100
iva_costo_directo = costo_directo_neto × iva_costo_directo_pct / 100 si está activado; 0 en otro caso
total_cotización = costo_directo_neto + administración + imprevistos + utilidad + iva_utilidad + iva_costo_directo
```

El incremento solo se aplica una vez sobre el costo con IVA de cada material. AIU y el IVA adicional usan el costo directo neto; el IVA sobre utilidad usa solo utilidad. Usar valores `numeric` y redondear para presentación, no entre pasos de la fórmula.

Para un proyecto:

```text
pagado = Σ anticipos
retenido = Σ retenciones no anuladas
cubierto = pagado + retenido
saldo = max(0, valor_proyecto − cubierto)
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
4. Copiar cada ítem como presupuesto con importes base y finales ya calculados, porcentaje de IVA y `cost_total`; el monto presupuestado incluye IVA y excluye incremento comercial. No apuntar al precio actual del catálogo.
5. Vincular proyecto y cotización, registrar auditoría y devolver el proyecto creado.
6. Si el proyecto ya existe, devolver ese mismo proyecto sin crear otro.

## Alertas internas

- Cartera: saldo mayor que cero, excepto borradores y cancelados; descuenta anticipos y retenciones vigentes.
- Sobrecosto: gastos superiores a un presupuesto positivo; desaparece al finalizar o cancelar.
- Retraso: solo aprobados, en proceso o pausados con fecha prevista anterior a hoy.
- Finalización próxima: esos mismos estados, entre hoy y los próximos 15 días, inclusive.

Finalizados conservan solo cartera y cancelados no generan alertas. Las reglas se centralizan en una vista SQL con security_invoker y usan la fecha de Bogotá. Panel y listado comparten tarjeta con código, cliente, título, estado y desglose verificable. Se consulta al entrar, guardar cambios relevantes, volver a la pestaña o pulsar Actualizar; sin temporizadores, Realtime, correos ni tareas programadas. Ver [reglas, diagnóstico y despliegue](../docs/CURRENT-ALERTS.md).

Los fondos financieros comparan decimales originales: resultados/márgenes negativos rojos, positivos verdes, cero neutro; cartera positiva ámbar; gastos rojos solo sobre presupuesto positivo; ejecución roja solo por encima de 100 %. Importes descriptivos, movimientos y deducciones contables permanecen neutros. Compartir reglas y etiquetas accesibles, incluido el informe impreso, sin leyenda visible; conservar cotizaciones sin estos colores.

## Desglose de métricas de Análisis

Las 14 tarjetas de Gerencia, Comercial y Distribuciones abren tablas en modal. Gastos lista cada movimiento; resultados muestran por proyecto la base según modelo y el gasto o presupuesto aplicado. Los totales y fórmulas corresponden al conjunto completo, con paginación de 20/50/100 filas. Se conservan los filtros de cada vista: el periodo de Gerencia solo filtra caja y el resultado de Distribuciones siempre usa el portafolio completo. Los gráficos siguen filtrando al pulsarlos. Ver [contratos, migración y pruebas](../docs/FINANCE-IMPROVEMENTS.md).

## Diseño y accesibilidad

Conservar de `index.html` la paleta verde, superficies claras, logo, barra lateral colapsable y diálogo de vista previa. En móvil la navegación se abre como panel superpuesto. Los controles deben tener etiquetas, foco visible y activación por teclado; los gráficos se implementarán con etiquetas equivalentes y datos tabulares accesibles. La impresión debe ocultar la aplicación y emitir solo el documento de cotización.

## Distribuciones pagadas por proyecto

Las nuevas distribuciones, incluidas las generales, son valores fijos manuales. Ganancia actual = base del modelo menos gastos reales menos importes congelados de distribuciones pagadas por proyecto. Pendientes y distribuciones generales no descuentan. El pago no puede superar la ganancia disponible; reabrir restaura el importe. Se conservan caja, presupuesto y resultado proyectado. Ver [contrato y despliegue](../docs/PAID-PROJECT-DISTRIBUTIONS.md).
