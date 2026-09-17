import Image from 'next/image';
import Link from 'next/link';
import styles from './AuthShell.module.css';

type AuthShellProps = {
  children: React.ReactNode;
  description: string;
  error?: string;
  footer: React.ReactNode;
  headingId: string;
  title: string;
};

export function AuthShell({ children, description, error, footer, headingId, title }: AuthShellProps) {
  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby={headingId}>
        <Link className={styles.brand} href="/" aria-label="Elecpro, volver al inicio">
          <Image src="/images/elecpro-logo.png" width={238} height={104} priority alt="Elecpro Ingeniería Eléctrica" />
        </Link>
        <header className={styles.header}>
          <h1 id={headingId}>{title}</h1>
          <p>{description}</p>
        </header>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {children}
        <footer className={styles.footer}>{footer}</footer>
      </section>
    </main>
  );
}
