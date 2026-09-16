'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { pageSizeOptions, type PageInfo } from '../../lib/pagination';
import styles from './Pagination.module.css';

export function Pagination({ page, pageParam = 'page', pageSizeParam = 'pageSize' }: { page: PageInfo; pageParam?: string; pageSizeParam?: string }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const go = (number: number, size = page.pageSize) => { const params = new URLSearchParams(search.toString()); params.set(pageParam, String(number)); params.set(pageSizeParam, String(size)); router.replace(`${pathname}?${params}`, { scroll: false }); };
  if (!page.total) return <p className={styles.empty} role="status">No hay registros con estos filtros.</p>;
  return <nav className={styles.pager} aria-label="Paginación"><span>Mostrando {page.from}–{page.to} de {page.total}</span><label>Filas <select value={page.pageSize} onChange={(event) => go(1, Number(event.target.value) as typeof page.pageSize)}>{pageSizeOptions.map((size) => <option key={size}>{size}</option>)}</select></label><button type="button" disabled={!page.hasPrevious} onClick={() => go(page.page - 1)}>Anterior</button><span aria-current="page">Página {page.page} de {page.pageCount}</span><button type="button" disabled={!page.hasNext} onClick={() => go(page.page + 1)}>Siguiente</button></nav>;
}
