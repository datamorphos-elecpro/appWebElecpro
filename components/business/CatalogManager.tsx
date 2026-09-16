'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { deactivateBusiness, saveBusiness } from '../../app/actions/business';
import { money } from '../../lib/money';
import { categoryOptions, categoryText } from '../../lib/presentation';
import { Dialog } from '../ui/Dialog';
import styles from './manager.module.css';

type Row = Record<string, any>;
type Kind = 'clients' | 'suppliers' | 'catalog_items';
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO');
const labels: Record<string, string> = { name: 'Nombre', client_type: 'Tipo de cliente', contact_name: 'Contacto / asesor', phone: 'Teléfono', email: 'Correo', address: 'Dirección', website: 'Sitio web', description: 'Descripción', code: 'Código', unit: 'Unidad', base_unit_price: 'Precio base', category: 'Categoría' };

export function CatalogManager({ kind, rows }: { kind: Kind; rows: Row[] }) {
  const [query, setQuery] = useState(''); const [editing, setEditing] = useState<Row | null>(null); const [pending, start] = useTransition(); const first = useRef<HTMLInputElement>(null);
  const keys = kind === 'clients' ? ['name', 'client_type', 'contact_name', 'phone', 'email', 'address'] : kind === 'suppliers' ? ['name', 'contact_name', 'phone', 'email', 'website', 'description'] : ['code', 'description', 'unit', 'base_unit_price', 'category'];
  const filtered = useMemo(() => rows.filter(row => norm(Object.values(row).join(' ')).includes(norm(query))), [rows, query]);
  const required = ['name', 'client_type', 'description', 'unit', 'base_unit_price'];
  function submit(data: FormData) { start(async () => { try { await saveBusiness(kind, Object.fromEntries(data)); setEditing(null); } catch (e) { alert(e instanceof Error ? e.message : 'No fue posible guardar'); } }); }
  function deactivate(id: string) { if (!confirm('Se desactivará el registro para conservar el historial.')) return; start(async () => { try { await deactivateBusiness(kind, id); } catch (e) { alert(e instanceof Error ? e.message : 'No fue posible desactivar'); } }); }
  return <>
    <div className={styles.toolbar}><input aria-label="Buscar" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por cualquier dato..." /><button className={styles.primary} onClick={() => setEditing({})}>+ Crear</button></div>
    {kind === 'clients' ? <div className={styles.clientGrid}>{filtered.map(row => <article className={styles.client} key={row.id}><div className={styles.avatar}>{String(row.name).split(' ').slice(0,2).map((v: string) => v[0]).join('')}</div><div><strong>{row.name}</strong><small>{row.client_type}</small></div><p>{row.contact_name || 'Sin contacto'}<br />{row.phone || 'Sin teléfono'}<br />{row.email || 'Sin correo'}</p><footer><span>{row.is_active === false ? 'Inactivo' : 'Activo'}</span><button className={styles.link} onClick={() => setEditing(row)}>Editar</button>{row.is_active !== false && <button className={styles.link} onClick={() => deactivate(row.id)} disabled={pending}>Desactivar</button>}</footer></article>)}</div> : <div className={styles.tableWrap}><table><caption className="sr-only">Listado</caption><thead><tr>{keys.map(key => <th key={key}>{labels[key]}</th>)}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>{keys.map(key => <td key={key}>{key === 'base_unit_price' ? money(row[key]) : key === 'category' ? categoryText(row[key]) : key === 'website' && row[key] ? <a href={row[key]} target="_blank" rel="noreferrer">{row[key]}</a> : row[key] || '—'}</td>)}<td>{row.is_active === false ? 'Inactivo' : 'Activo'}</td><td><button className={styles.link} onClick={() => setEditing(row)}>Editar</button>{row.is_active !== false && <button className={styles.link} onClick={() => deactivate(row.id)} disabled={pending}>Desactivar</button>}</td></tr>)}</tbody></table></div>}
    {!filtered.length && <p className={styles.empty}>Aún no hay registros que coincidan.</p>}
    <Dialog open={editing !== null} title={editing?.id ? 'Editar registro' : 'Nuevo registro'} onClose={() => setEditing(null)} initialFocusRef={first}><form action={submit} className={styles.form}>{editing?.id && <input type="hidden" name="id" value={editing.id} />}{keys.map((key, i) => <label key={key}>{labels[key]}{key === 'category' ? <select name={key} defaultValue={editing?.[key] ?? 'material'}>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : key === 'client_type' ? <select name={key} defaultValue={editing?.[key] ?? 'Empresa'}><option>Empresa</option><option>Persona natural</option><option>Entidad pública</option></select> : key === 'description' && kind === 'suppliers' ? <textarea name={key} defaultValue={editing?.[key] ?? ''} /> : <input ref={i === 0 ? first : undefined} name={key} value={!editing?.id && key === 'code' ? 'Se asignará al guardar' : undefined} defaultValue={editing?.id || key !== 'code' ? editing?.[key] ?? '' : undefined} readOnly={key === 'code'} required={required.includes(key)} type={key === 'email' ? 'email' : key === 'website' ? 'url' : key === 'base_unit_price' ? 'number' : 'text'} min={key === 'base_unit_price' ? '0' : undefined} step={key === 'base_unit_price' ? '0.01' : undefined} />}</label>)}<footer><button type="button" className={styles.cancel} onClick={() => setEditing(null)}>Cancelar</button><button disabled={pending} className={styles.primary}>{pending ? 'Guardando…' : 'Guardar'}</button></footer></form></Dialog>
  </>;
}
