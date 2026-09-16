import Link from 'next/link';
import { signIn } from '../../actions/auth';
import styles from './login.module.css';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className={styles.main}>
    <section className={styles.card} aria-labelledby="titulo-inicio-sesion">
      <div className={styles.logo}>⚡ Elecpro</div>
      <h1 id="titulo-inicio-sesion">Bienvenido</h1>
      <p>Ingresa a la operación de Elecpro.</p>
      {params.error && <p role="alert" className={styles.error}>{params.error}</p>}
      <form action={signIn}>
        <label>Correo electrónico<input required type="email" name="email" autoComplete="email" /></label>
        <label>Contraseña<input required type="password" name="password" autoComplete="current-password" /></label>
        <button>Iniciar sesión</button>
      </form>
      <div className={styles.links}><Link href="/recuperar-acceso">¿Olvidaste tu contraseña?</Link><Link href="/">Volver al inicio</Link></div>
    </section>
  </main>;
}
