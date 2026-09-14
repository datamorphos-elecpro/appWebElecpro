import { AnalyticsWorkspace } from '../../../components/analytics/AnalyticsWorkspace';
import { Page } from '../../../components/ui/Page';
import { getAnalyticsData } from '../../../lib/data';

export default async function AnalysisLayout({ children: _children }: { children: React.ReactNode }) {
  const data = await getAnalyticsData();
  return <Page title="Análisis interactivo" description="Indicadores consolidados con filtros independientes por vista."><AnalyticsWorkspace data={data} /></Page>;
}
