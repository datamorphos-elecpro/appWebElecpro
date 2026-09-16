import { redirect } from 'next/navigation';

export default function FinanceRedirect() {
  redirect('/analisis?tab=management');
}
