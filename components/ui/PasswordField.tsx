'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';
import styles from './PasswordField.module.css';

export function PasswordField({ id }: { id: string }) {
  const [visible, setVisible] = useState(false); const input = useRef<HTMLInputElement>(null);
  return <span className={styles.field}><input id={id} ref={input} required type={visible ? 'text' : 'password'} name="password" autoComplete="current-password" /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => { setVisible(!visible); input.current?.focus(); }}><Icon name={visible ? 'visibility_off' : 'visibility'} /></button></span>;
}
