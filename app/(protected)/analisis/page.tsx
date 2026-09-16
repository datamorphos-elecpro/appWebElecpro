import { AnalyticsWorkspace } from '../../../components/analytics/AnalyticsWorkspace';
import { Page } from '../../../components/ui/Page';
import { getAnalyticsData } from '../../../lib/data';

export default async function AnalysisPage() {
  const data = await getAnalyticsData();
  return <Page title="Análisis" description="Indicadores de gerencia, operación y gestión comercial con filtros independientes por vista.">
    <AnalyticsWorkspace data={data} />
  </Page>;
}
