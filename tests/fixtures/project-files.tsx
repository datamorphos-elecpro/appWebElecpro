import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectWorkspace } from '../../components/projects/ProjectWorkspace';
import { fixtureFiles } from './project-file-actions';
import { pagination } from '../../lib/pagination';
import type { ProjectFile } from '../../lib/project-files';
import '../../app/globals.css';

const project = { id: '33333333-3333-4333-8333-333333333333', title: 'Instalación eléctrica', quote_number: 'PRY-TEST', client_id: '22222222-2222-4222-8222-222222222222', clients: { name: 'Cliente' }, project_value: '100000', status: 'approved', priority: 'medium', responsible: 'Ana', address: 'Bogotá', profit_mode: 'value', initial_profit: '0', start_date: '2026-10-22', expected_end_date: '2026-11-22' };
const types = ['Factura Electrónica', 'Planos', 'Informe'].map((name, index) => ({ id: `type-${index}`, name }));
function Fixture() {
  const [files, setFiles] = useState<ProjectFile[]>(fixtureFiles); const [savedPayment, setSavedPayment] = useState(false);
  useEffect(() => { const refresh = () => { setFiles(fixtureFiles()); setSavedPayment(Boolean(localStorage.getItem('elecpro:test:project-record'))); }; window.addEventListener('fixture:refresh', refresh); return () => window.removeEventListener('fixture:refresh', refresh); }, []);
  const records = files.filter((file) => file.kind === 'attachment');
  const section = new URLSearchParams(location.search).get('section') === 'payments' ? 'payments' : 'attachments';
  const payments = [{ id: 'payment-old', payment_date: '2026-10-22', amount: '1000', payment_method: 'Transferencia', note: 'Anticipo anterior' }, ...(savedPayment ? [{ id: 'payment-new', payment_date: '2026-10-29', amount: '2000', payment_method: 'Transferencia', note: '' }] : [])];
  return <main style={{ padding: 12 }}><ProjectWorkspace project={project} section={section} receipts={files.filter((file) => file.kind === 'receipt')} attachments={{ records, page: pagination(records.length, 1, 20) }} attachmentTypes={[...types, ...records.map((file) => file.project_attachment_types!).filter((type) => !types.some((item) => item.name === type.name))]} payments={{ records: payments, page: pagination(payments.length, 1, 20) }} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
