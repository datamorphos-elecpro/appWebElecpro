'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '../../app/actions/auth';
import { Icon, type IconName } from '../ui/Icon';
import { roleText } from '../../lib/presentation';
import styles from './AppShell.module.css';

const links: { href: string; label: string; icon: IconName }[] = [
  { href: '/panel', label: 'Panel general', icon: 'dashboard' },
  { href: '/analisis', label: 'Análisis', icon: 'query_stats' },
  { href: '/proyectos', label: 'Proyectos', icon: 'folder_open' },
  { href: '/cotizaciones', label: 'Cotizaciones', icon: 'request_quote' },
  { href: '/catalogo', label: 'Productos y servicios', icon: 'inventory_2' },
  { href: '/proveedores', label: 'Proveedores', icon: 'local_shipping' },
  { href: '/clientes', label: 'Clientes', icon: 'groups' },
  { href: '/alertas', label: 'Alertas', icon: 'notifications' },
];

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/panel': { title: 'Panel general', subtitle: 'Información consolidada y actualizada al consultar.' },
  '/analisis': { title: 'Análisis', subtitle: 'Indicadores de gerencia, operación y comercial.' },
  '/proyectos': { title: 'Proyectos', subtitle: 'Portafolio, presupuesto y ejecución.' },
  '/cotizaciones': { title: 'Cotizaciones', subtitle: 'Creación, cálculo y seguimiento de propuestas comerciales.' },
  '/catalogo': { title: 'Productos y servicios', subtitle: 'Catálogo de materiales y mano de obra.' },
  '/proveedores': { title: 'Proveedores', subtitle: 'Directorio de aliados y proveedores.' },
  '/clientes': { title: 'Clientes', subtitle: 'Fichas reutilizables para cotizaciones y proyectos.' },
  '/alertas': { title: 'Alertas', subtitle: 'Alertas internas calculadas al consultar.' },
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EP';

export function AppShell({ children, name, role }: { children: React.ReactNode; name: string; role: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const path = usePathname();

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      if (accountRef.current?.open) accountRef.current.open = false;
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const active = (href: string) => href === '/panel' ? path === '/panel' : path.startsWith(href);
  const quoteEditor = path === '/cotizaciones/nueva' || /^\/cotizaciones\/[^/]+$/.test(path);
  const section = quoteEditor
    ? { title: 'Editor de cotización', subtitle: 'Documento comercial con cálculo automático.' }
    : Object.entries(pageTitles).find(([href]) => href === '/panel' ? path === '/panel' : path.startsWith(href))?.[1] ?? { title: 'Elecpro', subtitle: 'Control de proyectos, cotizaciones y rentabilidad.' };
  const roleLabel = roleText(role);
  const closeMenu = () => { setMobileOpen(false); if (accountRef.current) accountRef.current.open = false; };

  return <div className={`${styles.app} ${collapsed ? styles.collapsed : ''}`}>
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`} aria-label="Navegación principal">
        <div className={styles.sidebarHead}>
          <div className={styles.logo}><Image src="/images/elecpro-logo.png" width={176} height={80} priority alt="Elecpro Ingeniería Eléctrica" /></div>
          <button className={styles.sidebarToggle} type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-pressed={collapsed}><Icon name={collapsed ? 'left_panel_open' : 'left_panel_close'} /></button>
        </div>
        <nav className={styles.nav}>{links.map((link) => <Link key={link.href} href={link.href} onClick={closeMenu} aria-current={active(link.href) ? 'page' : undefined} title={collapsed ? link.label : undefined}><span className={styles.navIcon}><Icon name={link.icon} /></span><span className={styles.navLabel}>{link.label}</span></Link>)}</nav>
        <div className={styles.sidebarFoot}><strong>Elecpro</strong><span>Control de proyectos y rentabilidad</span></div>
      </aside>
      {mobileOpen && <button type="button" className={styles.backdrop} aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} />}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarStart}><button className={styles.menuToggle} type="button" aria-label="Abrir navegación" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Icon name="menu_open" /></button><div className={styles.topbarTitle}><h1>{section.title}</h1><p>{section.subtitle}</p></div></div>
          <details ref={accountRef} className={styles.account}><summary aria-label="Abrir menú de cuenta"><span className={styles.accountText}><strong>{name || 'Usuario Elecpro'}</strong><small>{roleLabel}</small></span><span className={styles.avatar} aria-hidden="true">{initials(name || 'Elecpro')}</span></summary><div className={styles.accountMenu}><strong>{name || 'Usuario Elecpro'}</strong><span>{roleLabel}</span>{role === 'administrator' && <Link href="/administracion/usuarios" onClick={closeMenu}><Icon name="admin_panel_settings" />Administración</Link>}<form action={signOut}><button type="submit"><Icon name="logout" />Cerrar sesión</button></form></div></details>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  </div>;
}
