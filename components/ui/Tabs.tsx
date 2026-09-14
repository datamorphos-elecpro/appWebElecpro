'use client';
import { useRef } from 'react';
import styles from './Tabs.module.css';
export type TabItem = { id: string; label: string };
export function Tabs({ items, value, onChange, label = 'Secciones' }: { items: TabItem[]; value: string; onChange: (id: string) => void; label?: string }) {
 const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const move=(direction:number)=>{const index=items.findIndex(({id})=>id===value);const next=(index+direction+items.length)%items.length;onChange(items[next].id);requestAnimationFrame(()=>refs.current[next]?.focus());};
 return <div className={styles.tabs} role="tablist" aria-label={label}>{items.map((item,index)=><button ref={(node)=>{refs.current[index]=node;}} key={item.id} id={`tab-${item.id}`} role="tab" type="button" aria-selected={item.id===value} tabIndex={item.id===value?0:-1} className={item.id===value?styles.active:''} onClick={()=>onChange(item.id)} onKeyDown={(event)=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}}}>{item.label}</button>)}</div>;
}
