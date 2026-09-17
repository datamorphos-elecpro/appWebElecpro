import { redirect } from 'next/navigation';

export default async function DistributionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (key.startsWith('distribution_') && typeof value === 'string') params.set(key, value);
  params.set('tab', 'distribution');
  redirect(`/analisis?${params}`);
}
