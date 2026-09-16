alter table public.suppliers add column contact_name text;

comment on column public.suppliers.contact_name is
  'Nombre opcional de la persona de contacto o asesor del proveedor.';
