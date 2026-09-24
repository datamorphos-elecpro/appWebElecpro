import { QuoteEditor } from '../../../../components/quotes/QuoteEditor';
import { getCompanySettings } from '../../../../lib/data';
import { requireProfile } from '../../../../lib/auth';

export default async function NewQuote() {
  const [{ profile }, company] = await Promise.all([requireProfile(), getCompanySettings()]);
  return <QuoteEditor company={normalizeCompany(company)} userId={profile.id} />;
}
function normalizeCompany(company: Awaited<ReturnType<typeof getCompanySettings>>) { return { ...company, professional_card: company.professional_card ?? '', phone: company.phone ?? '', email: company.email ?? '', address: company.address ?? '' }; }
