# Soportes y archivos de proyectos

## Despliegue

1. Aplicar `supabase/migrations/20261029100000_project_files.sql` **después de `20261023100000_current_alerts.sql` y antes de desplegar la aplicación**. Usar el historial normal de Supabase CLI o ejecutar el archivo completo una sola vez desde SQL Editor. La migración es transaccional y crea el bucket privado, catálogo, metadatos, RPC, auditoría y políticas; no recalcula importes anteriores.
2. La migración comprueba que exista `storage.allow_any_operation(text[])`. Si falta, actualizar Supabase Storage antes de repetirla. Esta función permite autorizar la limpieza de archivos retirados sin permitir descargarlos. En Supabase alojado, consultar soporte si el esquema de Storage está desactualizado; no crear imitaciones del helper en producción.
3. En **Storage → Settings**, comprobar que **Global file size limit** sea al menos **52.428.800 bytes (50 MiB)**. La migración configura ese límite en el bucket, pero no modifica el límite global del servicio. En pantalla se presenta como 50 MB; soportes: 10.485.760 bytes, presentados como 10 MB.
4. Verificar que `project-files` sea privado y que no haya políticas generales de otros desarrollos que permitan acceso anónimo o escritura sin restricciones sobre ese bucket. Las políticas nuevas tienen prefijo `project_files_storage_`.
5. Desplegar la aplicación con las variables de Supabase ya utilizadas: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Esta funcionalidad usa la sesión autenticada y no requiere `service_role`.
6. Con cada rol activo, registrar un anticipo sin soporte y otro con PDF, adjuntar un archivo general y probar vista previa, descarga, reemplazo y retiro. Verificar las carpetas por código en Storage.

Las carpetas son prefijos virtuales. Solo aparecen cuando contienen objetos:

```text
project-files/<projects.quote_number>/soportes-de-pago/<uuid>-<nombre-saneado>.pdf
project-files/<projects.quote_number>/archivos-adjuntos/<uuid>-<nombre-saneado>.<extensión>
```

El código se obtiene en PostgreSQL y no se acepta una ruta suministrada por el navegador. Los códigos vacíos, duplicados o fuera de `^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$` bloquean nuevas cargas con un mensaje de corrección. No se renumeran históricos. Un proyecto con metadatos de archivos no puede cambiar de código. Para diagnosticar datos anteriores:

```sql
select id, quote_number
from public.projects
where quote_number is null
   or quote_number !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
   or quote_number in (
     select quote_number from public.projects group by quote_number having count(*) > 1
   );
```

## Comportamiento y recuperación

- Soportes: un PDF opcional por anticipo, hasta 10 MB, gestionado exclusivamente desde Anticipos. Adjuntos: un archivo por registro, hasta 50 MB; PDF, JPG/JPEG, PNG, DOC/DOCX, XLS/XLSX, DWG, DXF y ZIP. Se valida extensión, tamaño y MIME canónico; no se realiza análisis antivirus ni validación semántica del contenido del documento.
- Ambos roles activos pueden consultar y gestionar archivos. Los anónimos y perfiles inactivos quedan bloqueados por RLS. Los enlaces firmados duran 60 segundos y no se guardan en base de datos; una URL emitida antes de cerrar sesión puede seguir siendo válida hasta su expiración. La vista previa permite actualizar el enlace.
- El selector crea tipos globales al finalizar el documento. La unicidad ignora mayúsculas, tildes y espacios redundantes. Hay 14 categorías iniciales, sin pantalla de administración ni versiones anteriores descargables.
- La carga directa usa TUS, bloques de 6 MiB y reintentos. No se envían archivos grandes por Server Actions. El navegador conserva el archivo seleccionado en memoria; no se incorpora al borrador local. Después de recargar la página debe seleccionarse de nuevo.
- `prepare_project_file` reserva la ruta y toma una instantánea de la revisión del archivo anterior. `finish_project_file` comprueba que Storage tenga el objeto completo, tamaño y MIME esperados, y sustituye la referencia dentro de una transacción. Las revisiones desactualizadas son rechazadas.
- `save_project_payment_with_file` crea el anticipo y activa el soporte en una sola transacción, usando el bloqueo de proyecto ya utilizado por retenciones. `request_id` evita duplicados al reintentar. Si el archivo seleccionado no termina de cargar, el movimiento no se crea; puede reintentarse o retirarse la selección y guardar sin soporte.
- Retirar o reemplazar marca el archivo anterior como `deleted`, con auditoría. La API de Storage elimina el contenido físico y luego se marca `cleanup_complete`. Nunca se borran filas de `storage.objects` mediante SQL en producción.
- Al consultar Anticipos o Archivos Adjuntos, o al completar una modificación, se reintenta la limpieza. Las cargas pendientes abandonadas vencen a las 24 horas y se retiran en la siguiente consulta. Cada solicitud limpia hasta 100 objetos; si queda trabajo o falla Storage se ofrece **Reintentar limpieza**. No hay trabajos programados.
- Los metadatos retirados permanecen como auditoría. No eliminar filas manualmente: conservan relaciones, trazabilidad y la identificación de objetos pendientes de limpieza.

Si falla repetidamente la limpieza, comprobar las políticas de Storage y la disponibilidad de su API; después usar **Reintentar limpieza**. Un administrador de infraestructura también puede listar las rutas pendientes:

```sql
select id, project_id, object_path, status, created_at
from public.project_files
where status = 'deleted' and not cleanup_complete
order by updated_at;
```

Eliminar esas rutas mediante el Dashboard/API de Storage y volver a pulsar el botón de limpieza. La aplicación solo marcará completadas las filas cuyos objetos ya no existan. Para cargas pendientes de menos de 24 horas, esperar su vencimiento; no retirar cargas de otras sesiones que puedan estar en curso.

## Validaciones reproducibles

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx playwright test --config playwright.charts.config.ts tests/charts/project-files.spec.ts tests/charts/project-coverage.spec.ts
```

En una base **de pruebas** migrada, ejecutar con SQL Editor o psql:

```powershell
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/project_files.sql
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/project_coverage.sql
psql "$env:TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/paid_project_distributions.sql
```

`project_files.sql` termina en ROLLBACK y verifica RPC/RLS con metadatos de Storage simulados. Si se ejecuta contra un Supabase real, su protección contra DELETE directo de `storage.objects` requiere permitirlo **solo en esa transacción de pruebas** con `set_config('storage.allow_delete_query','true',true)`, que el script establece antes de simular la limpieza. No utilizar este mecanismo para administrar archivos reales.

La integración real de TUS/Storage es optativa y requiere un proyecto Supabase de pruebas, un usuario activo y un proyecto de negocio dedicado. Configurar `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_EMAIL`, `TEST_SUPABASE_PASSWORD` y `TEST_SUPABASE_PROJECT_ID` como variables de entorno, nunca en archivos versionados, y ejecutar:

```powershell
npx vitest run tests/project-files-storage.test.ts
```

Esta prueba carga un PDF de 7 MiB mediante TUS, lo finaliza como Informe, prueba descarga autenticada y rechazo anónimo, lo retira y elimina el objeto vía API. Conserva metadatos/auditoría en el proyecto de pruebas. Si una carga falla antes de finalizar, su reserva se recupera por el vencimiento normal de 24 horas. Sin esas variables, la prueba se omite explícitamente.

Referencias: [cargas reanudables](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [límites de archivos](https://supabase.com/docs/guides/storage/uploads/file-limits), [políticas por operación](https://supabase.com/docs/guides/storage/schema/helper-functions), [eliminación por API](https://supabase.com/docs/guides/storage/management/delete-objects).
