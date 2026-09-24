'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '../../app/actions/auth';
import { roleText } from '../../lib/presentation';
import { Icon, type IconName } from '../ui/Icon';
import styles from './AppShell.module.css';

const mobileNavigationQuery = '(max-width: 900px)';

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
  const [isMobile, setIsMobile] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const path = usePathname();

  useEffect(() => {
    const media = window.matchMedia(mobileNavigationQuery);
    const updateViewport = () => {
      setIsMobile(media.matches);
      setMobileOpen(false);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      if (accountRef.current?.open) accountRef.current.open = false;
      if (isMobile) requestAnimationFrame(() => menuToggleRef.current?.focus());
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (isMobile && mobileOpen) sidebarToggleRef.current?.focus();
  }, [isMobile, mobileOpen]);

  const active = (href: string) => href === '/panel' ? path === '/panel' : path.startsWith(href);
  const quoteEditor = path === '/cotizaciones/nueva' || /^\/cotizaciones\/[^/]+$/.test(path);
  const section = quoteEditor
    ? { title: 'Editor de cotización', subtitle: 'Documento comercial con cálculo automático.' }
    : Object.entries(pageTitles).find(([href]) => href === '/panel' ? path === '/panel' : path.startsWith(href))?.[1] ?? { title: 'Elecpro', subtitle: 'Control de proyectos, cotizaciones y rentabilidad.' };
  const roleLabel = roleText(role);
  const closeMenu = () => {
    setMobileOpen(false);
    if (accountRef.current) accountRef.current.open = false;
  };
  const closeMobileMenu = () => {
    setMobileOpen(false);
    requestAnimationFrame(() => menuToggleRef.current?.focus());
  };
  const toggleNavigation = () => {
    if (isMobile) {
      if (mobileOpen) closeMobileMenu();
      else setMobileOpen(true);
      return;
    }
    setCollapsed((value) => !value);
  };

  const desktopCollapsed = !isMobile && collapsed;
  const navigationLabel = mobileOpen ? 'Cerrar navegación' : 'Abrir navegación';
  const sidebarLabel = isMobile ? 'Cerrar navegación' : (collapsed ? 'Expandir menú' : 'Contraer menú');

  return <div className={`${styles.app} ${desktopCollapsed ? styles.collapsed : ''}`}>
    <div className={styles.layout} data-app-shell>
      <aside id="app-sidebar" className={`${styles.sidebar} ${isMobile && mobileOpen ? styles.mobileOpen : ''}`} aria-label="Navegación principal" aria-hidden={isMobile && !mobileOpen ? true : undefined} inert={isMobile && !mobileOpen ? true : undefined}>
        <div className={styles.sidebarHead}>
          <div className={styles.logo}><Image src="/images/elecpro-logo.png" width={238} height={104} sizes="176px" preload alt="Elecpro Ingeniería Eléctrica" /></div>
          <button ref={sidebarToggleRef} className={styles.sidebarToggle} type="button" onClick={toggleNavigation} aria-controls="app-sidebar" aria-label={sidebarLabel} aria-expanded={isMobile ? mobileOpen : !collapsed} aria-pressed={isMobile ? undefined : collapsed}><Icon name={isMobile ? 'close' : (collapsed ? 'left_panel_open' : 'left_panel_close')} /></button>
        </div>
        <nav className={styles.nav}>{links.map((link) => <Link key={link.href} href={link.href} onClick={closeMenu} aria-current={active(link.href) ? 'page' : undefined} title={desktopCollapsed ? link.label : undefined}><span className={styles.navIcon}><Icon name={link.icon} /></span><span className={styles.navLabel}>{link.label}</span></Link>)}</nav>
        <div className={styles.sidebarFoot}><strong>Elecpro</strong><span>Control de proyectos y rentabilidad</span></div>
      </aside>
      {isMobile && mobileOpen && <button type="button" className={styles.backdrop} data-navigation-backdrop aria-label="Cerrar navegación" onClick={closeMobileMenu} />}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarStart}><button ref={menuToggleRef} className={styles.menuToggle} type="button" aria-controls="app-sidebar" aria-label={navigationLabel} aria-expanded={mobileOpen} onClick={toggleNavigation}><Icon name={mobileOpen ? 'close' : 'menu_open'} /></button><div className={styles.topbarTitle}><h1>{section.title}</h1><p>{section.subtitle}</p></div></div>
          <details ref={accountRef} className={styles.account}><summary aria-label="Abrir menú de cuenta"><span className={styles.accountText}><strong>{name || 'Usuario Elecpro'}</strong><small>{roleLabel}</small></span><span className={styles.avatar} aria-hidden="true">{initials(name || 'Elecpro')}</span></summary><div className={styles.accountMenu}><strong>{name || 'Usuario Elecpro'}</strong><span>{roleLabel}</span>{role === 'administrator' && <Link href="/administracion/usuarios" onClick={closeMenu}><Icon name="admin_panel_settings" />Administración</Link>}<form action={signOut}><button type="submit"><Icon name="logout" />Cerrar sesión</button></form></div></details>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  </div>;
}
