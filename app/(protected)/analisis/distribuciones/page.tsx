import { DistributionWorkspace } from '../../../../components/analytics/DistributionWorkspace';
import { getDistributionPage } from '../../../../lib/distributions-data';
import { parsePageSize, parsePositiveInteger } from '../../../../lib/pagination';
import { Page } from '../../../../components/ui/Page';

export default async function DistributionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const value = (key: string) => Array.isArray(params[key]) ? params[key][0] : params[key];
  const data = await getDistributionPage({ q: value('distribution_q') ?? '', activity: value('distribution_activity'), payment: value('distribution_payment'), page: parsePositiveInteger(value('distribution_page'), 1), pageSize: parsePageSize(value('distribution_pageSize')) });
  return <Page title="Distribuciones generales" description="Reglas sobre la ganancia real consolidada, con pagos congelados y trazabilidad."><DistributionWorkspace records={data.records} page={data.page} metrics={data.metrics} /></Page>;
}
