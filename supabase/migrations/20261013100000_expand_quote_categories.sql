-- Confirmar esta migración antes de ejecutar la siguiente: PostgreSQL no permite
-- usar valores nuevos del enum dentro de la transacción que los agrega.
begin;
alter type public.catalog_category add value if not exists 'all_inclusive';
alter type public.catalog_category add value if not exists 'transport';
commit;
