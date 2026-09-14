import { QuoteEditor } from '../../../../components/quotes/QuoteEditor';
import { getActiveQuoteOptions, getCompanySettings } from '../../../../lib/data';

export default async function NewQuote() {
  const [{ clients, catalog }, company] = await Promise.all([getActiveQuoteOptions(), getCompanySettings()]);
  return <QuoteEditor clients={clients as any} catalog={catalog as any} company={normalizeCompany(company)} />;
}

function normalizeCompany(company: Awaited<ReturnType<typeof getCompanySettings>>) {
  return { ...company, professional_card: company.professional_card ?? '', phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '' };
}
