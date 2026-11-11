import { z } from 'zod';
import { createClient } from './supabase/server';

export type PreviewFile = { id: string; original_name: string; mime_type: string };
const amount = z.string().regex(/^-?\d+(\.\d+)?$/);
export const projectReportingSchema = z.object({
  id: z.string().uuid(), direct_cost: amount, total_aiu: amount,
  invoices: z.array(z.object({ id: z.string().uuid(), original_name: z.string().min(1), mime_type: z.string().min(1) })),
});
export type ProjectReportingDetails = z.infer<typeof projectReportingSchema>;

export async function getProjectReportingDetails(ids: string[]): Promise<Map<string, ProjectReportingDetails>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('project_reporting_details', { p_project_ids: [...new Set(ids)] });
  if (error) throw new Error(`No fue posible cargar los datos económicos y facturas: ${error.message}`);
  const parsed = z.array(projectReportingSchema).safeParse(data);
  if (!parsed.success) throw new Error('La respuesta de datos económicos y facturas no es válida.');
  const result = new Map(parsed.data.map((row) => [row.id, row]));
  if (ids.some((id) => !result.has(id))) throw new Error('Faltan datos económicos o facturas de un proyecto. Actualice la página.');
  return result;
}
