import Link from 'next/link';
import { resetPassword } from '../../actions/auth';
import styles from '../login/login.module.css';

export default function Recover() {
  async function submit(formData: FormData) { 'use server'; await resetPassword(formData); }
  return <main className={styles.main}><section className={styles.card}><div className={styles.logo}>⚡ Elecpro</div><h1>Recuperar acceso</h1><p>Te enviaremos un enlace seguro para restablecer tu contraseña.</p><form action={submit}><label>Correo electrónico<input name="email" type="email" required /></label><button>Enviar enlace</button></form><Link href="/login">Volver a iniciar sesión</Link></section></main>;
}