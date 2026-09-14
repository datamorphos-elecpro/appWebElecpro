import { revalidatePath } from 'next/cache';

const sharedPaths = ['/', '/proyectos', '/cotizaciones', '/finanzas', '/analisis', '/alertas'];
export function revalidateBusinessViews(projectId?: string) {
  for (const path of sharedPaths) revalidatePath(path);
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
}
export function revalidateQuoteViews(quoteId?: string) {
  revalidateBusinessViews();
  if (quoteId) revalidatePath(`/cotizaciones/${quoteId}`);
}
export function revalidateCatalogViews() {
  revalidatePath('/catalogo');
  revalidatePath('/cotizaciones');
}
export function revalidateClientViews() {
  revalidateBusinessViews();
  revalidatePath('/clientes');
}
