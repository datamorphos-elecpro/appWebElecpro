'use client';

import { useState, useTransition } from 'react';
import { inviteUser, setUserAccess } from '../../app/actions/admin';
import styles from '../business/manager.module.css';

export function UserManager({ users }: { users: any[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  function updateUser(id: string, role: 'administrator' | 'management', isActive: boolean) {
    start(async () => { try { await setUserAccess({ id, role, isActive }); setMessage('Acceso actualizado.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el acceso.'); } });
  }
  return <><div className={styles.toolbar}><span>Solo administradores pueden gestionar acceso.</span><button className={styles.primary} onClick={() => setOpen(true)}>Invitar usuario</button></div>{message && <p role="status">{message}</p>}
    {open && <dialog open className={styles.dialog}><form action={(form) => start(async () => { try { await inviteUser({ email: form.get('email'), fullName: form.get('fullName'), role: form.get('role') }); setOpen(false); setMessage('Invitación enviada.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo invitar.'); } })}><header><h2>Invitar usuario</h2><button type="button" onClick={() => setOpen(false)}>×</button></header><label>Nombre completo<input name="fullName" required /></label><label>Correo<input name="email" type="email" required /></label><label>Rol<select name="role"><option value="management">Gerencia</option><option value="administrator">Administrador</option></select></label><button className={styles.primary} disabled={pending}>{pending ? 'Enviando…' : 'Enviar invitación'}</button></form></dialog>}
    <div className={styles.tableWrap}><table><caption className="sr-only">Usuarios de Elecpro</caption><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.full_name}</td><td><select aria-label={`Rol de ${user.full_name}`} defaultValue={user.role} disabled={pending || !user.is_active} onChange={(event) => updateUser(user.id, event.target.value as 'administrator' | 'management', true)}><option value="administrator">Administrador</option><option value="management">Gerencia</option></select></td><td>{user.is_active ? 'Activo' : 'Inactivo'}</td><td><button className={styles.link} disabled={pending} onClick={() => updateUser(user.id, user.role, !user.is_active)}>{user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div></>;
}
