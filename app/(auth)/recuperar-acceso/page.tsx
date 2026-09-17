import Link from 'next/link';
import { resetPassword } from '../../actions/auth';
import { AuthShell } from '../../../components/auth/AuthShell';

export default function Recover() {
  async function submit(formData: FormData) { 'use server'; await resetPassword(formData); }
  return <AuthShell
    description="Te enviaremos un enlace seguro para restablecer tu contraseña."
    footer={<Link href="/login">Volver a iniciar sesión</Link>}
    headingId="titulo-recuperar-acceso"
    title="Recuperar acceso"
  >
    <form action={submit}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
      <button type="submit">Enviar enlace</button>
    </form>
  </AuthShell>;
}
