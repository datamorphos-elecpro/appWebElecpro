'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import styles from './IconAction.module.css';

export function IconAction({ label, accessibleLabel = label, icon, onClick, href, danger = false }: { label: string; accessibleLabel?: string; icon: IconName; onClick?: () => void; href?: string; danger?: boolean }) {
  const tooltipId = useId(); const root = useRef<HTMLSpanElement>(null); const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  function cancelClose() { if (closeTimer.current) clearTimeout(closeTimer.current); }
  function show() {
    cancelClose(); const rect = root.current?.getBoundingClientRect(); if (!rect) return;
    const above = rect.bottom + 44 > window.innerHeight;
    setPosition({ left: Math.max(64, Math.min(window.innerWidth - 64, rect.left + rect.width / 2)), top: above ? rect.top - 8 : rect.bottom + 8, above });
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, true); window.addEventListener('resize', dismiss); window.addEventListener('keydown', dismissOnEscape);
    return () => { window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); window.removeEventListener('keydown', dismissOnEscape); };
  }, [position]);
  const controlProps = { className: `${styles.iconAction}${danger ? ` ${styles.dangerAction}` : ''}`, 'aria-label': accessibleLabel, 'aria-describedby': position ? tooltipId : undefined };
  return <span ref={root} className={styles.actionItem} onMouseEnter={show} onMouseLeave={() => { cancelClose(); closeTimer.current = setTimeout(() => { if (!root.current?.contains(document.activeElement)) setPosition(null); }, 150); }} onFocus={() => { show(); requestAnimationFrame(() => { if (root.current?.contains(document.activeElement)) show(); }); }} onBlur={() => setPosition(null)} onClickCapture={() => setPosition(null)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); cancelClose(); setPosition(null); } }}>
    {href ? <a {...controlProps} href={href} target="_blank" rel="noopener noreferrer"><Icon name={icon} /></a> : <button {...controlProps} type="button" onClick={onClick}><Icon name={icon} /></button>}
    {position && createPortal(<span id={tooltipId} role="tooltip" className={styles.actionTooltip} style={{ left: position.left, top: position.top, transform: `translate(-50%, ${position.above ? '-100%' : '0'})` }} onMouseEnter={cancelClose} onMouseLeave={() => { if (!root.current?.contains(document.activeElement)) setPosition(null); }}>{label}</span>, document.body)}
  </span>;
}
