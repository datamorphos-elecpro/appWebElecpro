import { notFound } from 'next/navigation';
import { Page } from '../../../../components/ui/Page';
import { ProjectWorkspace } from '../../../../components/projects/ProjectWorkspace';
import { createClient } from '../../../../lib/supabase/server';

export default async function ProjectDetail({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: clients }, { data: summary }, { data: payments }, { data: expenses }, { data: budgets }, { data: shares }] = await Promise.all([
    supabase.from('projects').select('*,clients(name)').eq('id', projectId).single(),
    supabase.from('clients').select('id,name,address').eq('is_active', true).order('name'),
    supabase.from('project_financial_summary').select('*').eq('id', projectId).single(),
    supabase.from('project_payments').select('*').eq('project_id', projectId).order('payment_date', { ascending: false }),
    supabase.from('project_expenses').select('*').eq('project_id', projectId).order('expense_date', { ascending: false }),
    supabase.from('project_budgets').select('*').eq('project_id', projectId).order('position'),
    supabase.from('project_shares').select('*').eq('project_id', projectId).order('created_at'),
  ]);
  if (!project) notFound();
  return <Page title={project.title} description={`${project.clients?.name ?? 'Cliente'} · ${project.status}`}><ProjectWorkspace project={project} clients={(clients ?? []) as any[]} summary={summary} payments={(payments ?? []) as any[]} expenses={(expenses ?? []) as any[]} budgets={(budgets ?? []) as any[]} shares={(shares ?? []) as any[]} /></Page>;
}
