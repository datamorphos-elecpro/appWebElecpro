import { redirect } from 'next/navigation';
import { SHOW_ANALYTICS_DISTRIBUTIONS } from '../../../../lib/features';

export default async function DistributionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!SHOW_ANALYTICS_DISTRIBUTIONS) redirect('/analisis');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (key.startsWith('distribution_') && typeof value === 'string') params.set(key, value);
  params.set('tab', 'distribution');
  redirect(`/analisis?${params}`);
}
