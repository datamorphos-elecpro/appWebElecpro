import { createRoot } from 'react-dom/client';
import { QuoteEditor } from '../../components/quotes/QuoteEditor';
import { fixtureQuoteKey } from './quote-actions';
import '../../app/globals.css';

const stored = localStorage.getItem(fixtureQuoteKey);
const quote = stored ? JSON.parse(stored) : {
  id: '33333333-3333-4333-8333-333333333333', number: 'COT-20261013000099', title: 'Instalación de prueba',
  client_id: '22222222-2222-4222-8222-222222222222', issued_on: '2026-10-13', valid_until: '2026-10-28',
  material_increase_pct: '10', administration_pct: '0', contingency_pct: '0', utility_pct: '0', vat_utility_pct: '19',
  quote_items: [{ code: 'MO-001', description: 'Instalaciones solares y eléctricas del proyecto', unit: 'UND', category: 'material', quantity: '2', base_unit_price: '100000' }],
};
createRoot(document.getElementById('root')!).render(<QuoteEditor quote={quote}
  initialClient={{ id: '22222222-2222-4222-8222-222222222222', name: 'Cliente de prueba' }}
  userId="11111111-1111-4111-8111-111111111111"
  company={{ legal_name: 'Elecpro', manager_name: 'Gerencia Elecpro', manager_role: 'Gerente', professional_card: '', phone: '', email: '', address: '', timezone: 'America/Bogota', currency_code: 'COP' }} />);
