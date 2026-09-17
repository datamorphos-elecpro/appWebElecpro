'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { pageSizeOptions, type PageInfo } from '../../lib/pagination';
import styles from './Pagination.module.css';

export function Pagination({ page, pageParam = 'page', pageSizeParam = 'pageSize' }: { page: PageInfo; pageParam?: string; pageSizeParam?: string }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams(); const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { if (restoreFocus.current) { restoreFocus.current.focus(); restoreFocus.current = null; } }, [page.page, page.pageSize]);
  const go = (number: number, size = page.pageSize, target?: HTMLElement | null) => { restoreFocus.current = target ?? null; const params = new URLSearchParams(search.toString()); if (number === 1) params.delete(pageParam); else params.set(pageParam, String(number)); if (size === 20) params.delete(pageSizeParam); else params.set(pageSizeParam, String(size)); router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false }); };
  if (!page.total) return null;
  return <nav className={styles.pager} aria-label="Paginación"><span className="srOnly" aria-live="polite">Página {page.page} de {page.pageCount}. Mostrando {page.from} a {page.to} de {page.total} registros.</span><span className={styles.summary} aria-hidden="true">Mostrando {page.from}–{page.to} de {page.total}</span><label>Filas por página<select aria-label="Filas por página" value={page.pageSize} onChange={(event) => go(1, Number(event.target.value) as typeof page.pageSize, event.currentTarget)}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div className={styles.navigation}><button type="button" disabled={!page.hasPrevious} onClick={(event) => go(page.page - 1, page.pageSize, event.currentTarget)}>Anterior</button><span aria-current="page">Página {page.page} de {page.pageCount}</span><button type="button" disabled={!page.hasNext} onClick={(event) => go(page.page + 1, page.pageSize, event.currentTarget)}>Siguiente</button></div></nav>;
}
