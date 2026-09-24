# Mejoras de cotizaciones, proyectos y Análisis

La migración `supabase/migrations/20260924100000_quotes_projects_analytics_multi.sql` se aplica después de `20260923100000_locations_shares_numbers.sql` y antes de desplegar esta versión de la aplicación. En un proyecto ya configurado, ejecutarla una sola vez en SQL Editor. No altera números históricos.

Los documentos nuevos usan `COT-AAAAMMDDXXXXXX` y `PRY-AAAAMMDDXXXXXX`, con fecha de Bogotá y un consecutivo compartido bajo bloqueo transaccional. El proyecto convertido reutiliza el sufijo de su cotización; `projects.source_quote_number` conserva el número de origen y `quote_id` mantiene la relación. Los proyectos manuales reservan otro sufijo del mismo contador. Las cotizaciones antiguas conservan su número y su proyecto convertido recibe uno nuevo cuando el sufijo no cumple el patrón.

Los filtros categóricos de Análisis y Distribuciones aceptan varios valores mediante parámetros URL repetidos. Las funciones RPC con sufijo `_multi` combinan los valores de un mismo filtro con OR y filtros diferentes con AND. Una lista vacía equivale a Todos. Las funciones anteriores permanecen para compatibilidad. Los informes consultan los conjuntos completos filtrados; la paginación de gráficos solo afecta la pantalla.

Los borradores del editor de cotizaciones se guardan por usuario y registro en este navegador. Contienen campos, ítems, etapa, secciones y posición. Recuperar o descartar se decide en el modal; un cambio posterior del registro en el servidor muestra una advertencia. No se sincronizan borradores entre dispositivos.
