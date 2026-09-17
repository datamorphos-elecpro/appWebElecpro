import { QuoteEditor } from '../../../../components/quotes/QuoteEditor';
import { getCompanySettings } from '../../../../lib/data';

export default async function NewQuote() {
  const company = await getCompanySettings();
  return <QuoteEditor company={normalizeCompany(company)} />;
}
function normalizeCompany(company: Awaited<ReturnType<typeof getCompanySettings>>) { return { ...company, professional_card: company.professional_card ?? '', phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '' }; }
