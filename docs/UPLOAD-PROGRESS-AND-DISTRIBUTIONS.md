# Confirmación de archivos y visibilidad de Distribuciones

Seleccionar o arrastrar un archivo válido muestra un aviso azul de selección pendiente de guardar. La transferencia TUS comienza al confirmar Guardar. El modal visible muestra preparación, porcentaje real y guardado. Incluso al llegar al 100 % de transferencia, el estado sigue azul hasta que el servidor confirma el registro y la asociación del archivo.

El éxito muestra una barra verde y el botón **Listo**. Listo o cerrar el diálogo cierran ambos modales y actualizan el listado. Los errores aparecen en rojo y conservan los datos para reintentar, reutilizando la transferencia completada. Los anticipos sin soporte y los cambios de tipo de documento sin nuevo archivo conservan el cierre automático.

## Reactivar Distribuciones

En `lib/features.ts`, cambiar `SHOW_ANALYTICS_DISTRIBUTIONS` a `true` y desplegar de nuevo. La misma bandera controla la pestaña y las rutas `/analisis?tab=distribution` y `/analisis/distribuciones`. Desactivada, ambas rutas redirigen temporalmente a `/analisis` antes de consultar distribuciones. No requiere migraciones ni variables de entorno. Los datos, cálculos y distribuciones por proyecto se conservan.
