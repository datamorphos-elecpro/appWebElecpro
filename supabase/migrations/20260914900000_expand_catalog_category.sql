-- Fase 1: los valores nuevos del enum deben confirmarse antes de que otra
-- migración los use en filas, funciones o restricciones.
alter type public.catalog_category add value if not exists 'design';
alter type public.catalog_category add value if not exists 'technical_visit';