import Link from 'next/link';
import { signIn } from '../../actions/auth';
import { AuthShell } from '../../../components/auth/AuthShell';
import { PasswordField } from '../../../components/ui/PasswordField';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <AuthShell
    description="Ingresa a la operación de Elecpro."
    error={params.error}
    footer={<><Link href="/recuperar-acceso">¿Olvidaste tu contraseña?</Link><Link href="/">Volver al inicio</Link></>}
    headingId="titulo-inicio-sesion"
    title="Bienvenido"
  >
      <form action={signIn}>
        <label>Correo electrónico<input required type="email" name="email" autoComplete="email" /></label>
        <div><label htmlFor="password">Contraseña</label><PasswordField id="password" /></div>
        <button type="submit">Iniciar sesión</button>
      </form>
  </AuthShell>;
}
