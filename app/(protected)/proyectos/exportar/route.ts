import { requireProfile } from '../../../../lib/auth';
import { decimal } from '../../../../lib/calculations';
import { excelCsv, projectCsvColumns } from '../../../../lib/csv';
import { projectStatusText } from '../../../../lib/presentation';

export async function GET() {
  const { supabase } = await requireProfile();
  const [projectsResult, summariesResult] = await Promise.all([
    supabase.from('projects').select('id,quote_number,title,status,project_value,clients(name)').order('created_at', { ascending: false }),
    supabase.from('project_financial_summary').select('id,paid,balance,expenses,real_profit'),
  ]);
  if (projectsResult.error) throw new Error(`No fue posible exportar los proyectos: ${projectsResult.error.message}`);
  if (summariesResult.error) throw new Error(`No fue posible exportar los resúmenes financieros: ${summariesResult.error.message}`);
  const summaries = new Map((summariesResult.data ?? []).map((summary) => [summary.id, summary]));
  const rows = (projectsResult.data ?? []).map((project) => {
    const summary = summaries.get(project.id);
    if (!summary) throw new Error(`El proyecto ${project.id} no tiene resumen financiero.`);
    const client = project.clients as { name?: string } | null;
    const amount = (value: string) => decimal(value).toDecimalPlaces(0).toFixed(0);
    return [project.quote_number, project.title, client?.name ?? 'Sin cliente', projectStatusText(project.status), amount(project.project_value), amount(summary.paid), amount(summary.balance), amount(summary.expenses), amount(summary.real_profit)];
  });
  return new Response(excelCsv([projectCsvColumns, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="elecpro-proyectos.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}
