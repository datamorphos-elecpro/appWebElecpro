'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './SearchList.module.css';

export type SearchOption = { value: string; label: string; description?: string };
type Props = {
  label: string; values: string[]; options: SearchOption[]; onChange: (values: string[]) => void;
  multiple?: boolean; query?: string; onQueryChange?: (query: string) => void; placeholder?: string;
  loading?: boolean; error?: string; disabled?: boolean; unresolved?: boolean; emptyLabel?: string;
};

export function SearchList({ label, values, options, onChange, multiple = false, query, onQueryChange, placeholder = 'Buscar…', loading = false, error, disabled = false, unresolved = false, emptyLabel = 'Todos' }: Props) {
  const id = useId(); const root = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false); const [localQuery, setLocalQuery] = useState(''); const [active, setActive] = useState(0);
  const search = query ?? localQuery;
  const visible = onQueryChange ? options : options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('es-CO').includes(search.toLocaleLowerCase('es-CO')));
  const selected = options.filter((option) => values.includes(option.value));
  const summary = values.length ? selected.length === 1 ? selected[0].label : `${values.length} seleccionados` : emptyLabel;
  const setSearch = (value: string) => { if (onQueryChange) onQueryChange(value); else setLocalQuery(value); setActive(0); };
  const show = () => { if (disabled) return; document.dispatchEvent(new CustomEvent('elecpro:searchlist-open', { detail: id })); setOpen(true); };
  const choose = (option: SearchOption) => { onChange(multiple ? values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value] : [option.value]); if (!multiple) { setOpen(false); setSearch(''); } };
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    const outside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('elecpro:searchlist-open', other); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('elecpro:searchlist-open', other); document.removeEventListener('pointerdown', outside); };
  }, [id]);
  return <div ref={root} className={styles.root}>
    <button type="button" className={styles.trigger} aria-label={`${label}: ${values.length ? `${values.length} seleccionados` : 'Todos'}`} aria-expanded={open} aria-controls={`${id}-list`} disabled={disabled} onClick={() => { if (open) setOpen(false); else { show(); requestAnimationFrame(() => input.current?.focus()); } }}><span>{unresolved ? 'Cliente no disponible · seleccione otro' : summary}</span><span aria-hidden="true">⌄</span></button>
    {open && <div className={styles.popup}>
      <input ref={input} className={styles.search} value={search} placeholder={placeholder} aria-label={`Buscar ${label.toLocaleLowerCase('es-CO')}`} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={visible[active] ? `${id}-option-${active}` : undefined} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); root.current?.querySelector('button')?.focus(); } else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((current) => Math.max(0, Math.min(current + 1, visible.length - 1))); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); } else if (event.key === 'Enter' && visible[active]) { event.preventDefault(); choose(visible[active]); } }} />
      <div className={styles.list} id={`${id}-list`} role="listbox" aria-multiselectable={multiple || undefined}>
        {multiple && <button type="button" role="option" aria-selected={!values.length} className={styles.option} onClick={() => onChange([])}>Todos / limpiar selección</button>}
        {!multiple && values.length > 0 && <button type="button" role="option" aria-selected="false" className={styles.option} onClick={() => { onChange([]); setOpen(false); }}>Limpiar selección</button>}
        {loading ? <p role="status">Buscando…</p> : error ? <p role="alert">{error}</p> : visible.length ? visible.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={values.includes(option.value)} key={option.value} className={`${styles.option} ${active === index ? styles.active : ''}`} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>{multiple && <span aria-hidden="true" className={`${styles.check} ${values.includes(option.value) ? styles.checked : ''}`}>{values.includes(option.value) ? '✓' : ''}</span>}<span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></button>) : <p>Sin resultados.</p>}
      </div>
    </div>}
  </div>;
}
