import Link from 'next/link';
import styles from './ListFilters.module.css';
export function ListFilters({ filters }: { filters: Array<{ label: string; href: string }> }) {
  if (!filters.length) return null;
  return <div className={styles.filters} aria-label="Filtros aplicados">{filters.map((filter) => <span key={filter.label}>Filtro: {filter.label} <Link href={filter.href} aria-label={`Quitar filtro: ${filter.label}`}>Quitar filtro</Link></span>)}</div>;
}
