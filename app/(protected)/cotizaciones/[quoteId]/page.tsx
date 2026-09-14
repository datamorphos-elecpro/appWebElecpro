import { notFound } from 'next/navigation';
import { QuoteEditor } from '../../../../components/quotes/QuoteEditor';
import { getActiveQuoteOptions, getCompanySettings } from '../../../../lib/data';
import { createClient } from '../../../../lib/supabase/server';

export default async function QuoteDetail({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const supabase = await createClient();
  const [quoteResult, options, company] = await Promise.all([
    supabase.from('quotes').select('*,quote_items(*),clients(id,name,contact_name,email,address)').eq('id', quoteId).order('position', { referencedTable: 'quote_items' }).single(),
    getActiveQuoteOptions(),
    getCompanySettings(),
  ]);
  if (quoteResult.error?.code === 'PGRST116') notFound();
  if (quoteResult.error) throw new Error(`No fue posible cargar la cotización: ${quoteResult.error.message}`);
  if (!quoteResult.data) notFound();
  const currentClient = quoteResult.data.clients as { id: string; name: string; contact_name?: string | null; email?: string | null; address?: string | null } | null;
  const activeClients = options.clients as Array<{ id: string; name: string; contact_name?: string | null; email?: string | null; address?: string | null }>;
  const clients = currentClient && !activeClients.some((client) => client.id === currentClient.id) ? [currentClient, ...activeClients] : activeClients;
  return <QuoteEditor quote={quoteResult.data as any} clients={clients as any} catalog={options.catalog as any} company={normalizeCompany(company)} />;
}

function normalizeCompany(company: Awaited<ReturnType<typeof getCompanySettings>>) {
  return { ...company, professional_card: company.professional_card ?? '', phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '' };
}
