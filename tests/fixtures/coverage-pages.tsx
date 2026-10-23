import { createRoot } from 'react-dom/client';
import Dashboard from '../../app/(protected)/panel/page';
import Projects from '../../app/(protected)/proyectos/page';
import Report from '../../app/(report)/analisis/informe/page';
import { AnalyticsWorkspace } from '../../components/analytics/AnalyticsWorkspace';
import { getFilterOptions, getManagement } from './coverage-data';
import '../../app/globals.css';

async function main() {
  const view = new URLSearchParams(location.search).get('view');
  const content = view === 'projects' ? await Projects({ searchParams: Promise.resolve({}) })
    : view === 'report' ? await Report({ searchParams: Promise.resolve({}) })
    : view === 'analytics' ? <AnalyticsWorkspace tab="management" data={await getManagement()} options={await getFilterOptions()} />
    : await Dashboard();
  createRoot(document.getElementById('root')!).render(<main style={{ padding: 16 }}>{content}</main>);
}
void main();
