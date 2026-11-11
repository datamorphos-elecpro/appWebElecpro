# Ganancia e informes de Gerencia

Aplicar `20261111110000_direct_cost_profit_reports.sql` después de `20261111100000_project_reporting_details.sql` y antes de desplegar la aplicación. No requiere variables nuevas.

Ganancia actual = costo directo neto - gastos reales - distribuciones pagadas de proyectos. Ganancia proyectada = costo directo neto - presupuesto. El costo directo conserva incrementos e IVA por ítem, descuenta la rebaja y excluye AIU e IVA adicional sobre costo directo. Sin cotización usa valor del proyecto y AIU cero. El modo manual antiguo deja de intervenir; se conservan sus datos. Los pagos congelados no cambian y se permiten resultados negativos derivados del recálculo.

Ejemplo: costo directo $10.000.000, gastos $7.000.000 y distribuciones pagadas $1.000.000 producen ganancia $2.000.000. Las distribuciones generales usan esa ganancia neta, sin volver a descontar pagos de proyecto.

El RPC analytics_management_report agrega projects al contrato existente. Incluye todos los proyectos financieros filtrados aunque el detalle de cartera/gastos no tenga movimientos. Para Gastos agrega ítems originales, descuento, movimientos y pagos de distribuciones. Todas las lecturas obedecen RLS; los importes viajan como cadenas decimales. El periodo solo filtra caja.

Verificación: npm test; npm run lint; npx tsc --noEmit; npm run build. Ejecutar supabase/tests/direct_cost_profit_reports.sql solamente en una base aislada migrada (fixtures con ROLLBACK). Las pruebas de navegador analytics-improvements, management-report y project-coverage cubren informes completos, PDF y adaptabilidad.

Validación local: 281 pruebas unitarias aprobadas y una integración opcional omitida; lint, TypeScript y build aprobados. Migración y pruebas SQL aprobadas en PostgreSQL 16 aislado. Prueba concurrente: un pago confirmado y otro rechazado al exceder la ganancia; importes finales correctos. Cinco informes completos con 135 registros y anticipos en 380/680/900/1440 px verificados en navegador. Supabase remoto y despliegue pendientes.
