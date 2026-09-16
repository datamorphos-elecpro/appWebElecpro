import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Icon, type IconName } from '../../components/ui/Icon';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'Elecpro | Gestión de proyectos eléctricos',
  description: 'Centraliza cotizaciones, proyectos, finanzas y alertas internas para la operación de Elecpro.',
};

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: 'request_quote', title: 'Cotizaciones claras', description: 'Crea propuestas comerciales, calcula importes y conserva sus condiciones e ítems.' },
  { icon: 'folder_open', title: 'Proyectos bajo control', description: 'Da seguimiento al portafolio, anticipos, gastos, presupuestos y fechas clave.' },
  { icon: 'query_stats', title: 'Análisis financiero', description: 'Consulta indicadores de rentabilidad, cartera, presupuesto y ejecución.' },
  { icon: 'notifications', title: 'Alertas internas', description: 'Identifica retrasos, sobrecostos, cartera pendiente y finalizaciones próximas.' },
];

const benefits = [
  'Una operación conectada desde la cotización hasta el cierre del proyecto.',
  'Información comercial, técnica y financiera reunida en un solo lugar.',
  'Historial y valores de cada cotización conservados al convertirla en proyecto.',
];

export default function HomePage() {
  return <div className={styles.page} id="inicio">
    <header className={styles.header}>
      <Link className={styles.brand} href="#inicio" aria-label="Elecpro, volver al inicio">
        <Image src="/images/elecpro-logo.png" width={176} height={80} priority alt="Elecpro Ingeniería Eléctrica" />
      </Link>
      <nav className={styles.navigation} aria-label="Navegación de la página">
        <Link href="#inicio">Inicio</Link><Link href="#funcionalidades">Funcionalidades</Link><Link href="#beneficios">Beneficios</Link>
      </nav>
      <Link className={styles.loginLink} href="/login">Iniciar sesión</Link>
    </header>
    <main>
      <section className={styles.hero} aria-labelledby="titulo-principal">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Elecpro Ingeniería Eléctrica</p>
          <h1 id="titulo-principal">La operación de tus proyectos eléctricos, en un solo lugar.</h1>
          <p className={styles.lead}>Elecpro conecta cotizaciones, proyectos, finanzas y seguimiento operativo para tomar decisiones con información actualizada.</p>
          <div className={styles.heroActions}><Link className={styles.primaryAction} href="/login">Ingresar a Elecpro</Link><Link className={styles.secondaryAction} href="#funcionalidades">Conocer funcionalidades</Link></div>
        </div>
        <aside className={styles.summary} aria-label="Resumen de funcionalidades de Elecpro">
          <div className={styles.summaryTop}><span className={styles.pulse} aria-hidden="true" /><span>Operación conectada</span></div>
          <div className={styles.summaryRows}>
            <div><Icon name="request_quote" /><span><strong>Cotizaciones</strong><small>Propuestas y cálculos comerciales</small></span></div>
            <div><Icon name="folder_open" /><span><strong>Proyectos</strong><small>Presupuesto, gastos y avance</small></span></div>
            <div><Icon name="account_balance_wallet" /><span><strong>Finanzas</strong><small>Rentabilidad y cartera</small></span></div>
          </div>
        </aside>
      </section>
      <section className={styles.featureSection} id="funcionalidades" aria-labelledby="titulo-funcionalidades">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>Herramientas para la operación diaria</p><h2 id="titulo-funcionalidades">De la propuesta comercial al control del proyecto.</h2><p>Organiza la información que el equipo necesita para cotizar, ejecutar y revisar cada proyecto.</p></div>
        <div className={styles.featureGrid}>{features.map((feature) => <article className={styles.featureCard} key={feature.title}><span className={styles.iconWrap}><Icon name={feature.icon} /></span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
      </section>
      <section className={styles.benefitSection} id="beneficios" aria-labelledby="titulo-beneficios">
        <div><p className={styles.eyebrow}>Información que acompaña la decisión</p><h2 id="titulo-beneficios">Menos dispersión, más trazabilidad.</h2><p>Elecpro reúne el contexto comercial, técnico y financiero de cada proyecto sin depender de archivos separados.</p></div>
        <ul className={styles.benefitList}>{benefits.map((benefit) => <li key={benefit}><Icon name="check_circle" /><span>{benefit}</span></li>)}</ul>
      </section>
      <section className={styles.cta} aria-labelledby="titulo-acceso">
        <div><p className={styles.eyebrow}>Acceso para el equipo Elecpro</p><h2 id="titulo-acceso">¿Listo para revisar la operación?</h2><p>Inicia sesión para consultar y gestionar la información de la empresa.</p></div>
        <Link className={styles.ctaAction} href="/login">Iniciar sesión</Link>
      </section>
    </main>
    <footer className={styles.footer}><Image src="/images/elecpro-logo.png" width={132} height={60} alt="Elecpro Ingeniería Eléctrica" /><p>Control de proyectos, cotizaciones y rentabilidad.</p></footer>
  </div>;
}
