'use client';

import { useRef, useState, useTransition } from 'react';
import { inviteUser, setUserAccess } from '../../app/actions/admin';
import styles from '../business/manager.module.css';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { Dialog } from '../ui/Dialog';
import { Pagination } from '../ui/Pagination';
import type { PageInfo } from '../../lib/pagination';

type User = { id: string; full_name: string; role: 'administrator' | 'management'; is_active: boolean };
type Change = { user: User; role: User['role']; isActive: boolean };
export function UserManager({ users, page }: { users: User[]; page?: PageInfo }) {
  const [open, setOpen] = useState(false); const [pending, start] = useTransition(); const [message, setMessage] = useState(''); const [inviteError, setInviteError] = useState(''); const [change, setChange] = useState<Change | null>(null); const first = useRef<HTMLInputElement>(null);
  async function confirmAccess() { if (!change) return; try { await setUserAccess({ id: change.user.id, role: change.role, isActive: change.isActive }); setChange(null); setMessage('Acceso actualizado.'); } catch (error) { throw new Error(error instanceof Error ? error.message : 'No fue posible actualizar el acceso.'); } }
  function submitInvite(form: FormData) { start(async () => { try { setInviteError(''); await inviteUser({ email: form.get('email'), fullName: form.get('fullName'), role: form.get('role') }); setOpen(false); setMessage('Invitación enviada.'); } catch (error) { setInviteError(error instanceof Error ? error.message : 'No se pudo invitar.'); } }); }
  const title = change?.isActive === false ? 'Desactivar usuario' : change?.user.is_active === false ? 'Reactivar usuario' : 'Cambiar rol';
  const description = change?.isActive === false ? 'Se cerrarán sus sesiones y perderá acceso hasta que un administrador lo reactive.' : change?.user.is_active === false ? 'El usuario podrá volver a acceder con el rol indicado.' : `El acceso cambiará a ${change?.role === 'administrator' ? 'Administrador' : 'Gerencia'}.`;
  return <><div className={styles.toolbar}><span>Solo administradores pueden gestionar acceso.</span><button className={styles.primary} onClick={() => setOpen(true)}>Invitar usuario</button></div>{message && <p role="status">{message}</p>}
    <Dialog open={open} title="Invitar usuario" onClose={() => setOpen(false)} initialFocusRef={first} locked={pending}><form action={submitInvite} className={styles.form}><label>Nombre completo<input ref={first} name="fullName" required /></label><label>Correo<input name="email" type="email" required /></label><label>Rol<select name="role"><option value="management">Gerencia</option><option value="administrator">Administrador</option></select></label>{inviteError && <p role="alert" className={styles.error}>{inviteError}</p>}<footer><button type="button" className={styles.cancel} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button><button className={styles.primary} disabled={pending}>{pending ? 'Enviando…' : 'Enviar invitación'}</button></footer></form></Dialog>
    <div className={styles.tableWrap}><table><caption className="sr-only">Usuarios de Elecpro</caption><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td>{user.full_name}</td><td><select aria-label={`Rol de ${user.full_name}`} value={change?.user.id === user.id ? change.role : user.role} disabled={pending || !user.is_active} onChange={(event) => setChange({ user, role: event.target.value as User['role'], isActive: true })}><option value="administrator">Administrador</option><option value="management">Gerencia</option></select></td><td>{user.is_active ? 'Activo' : 'Inactivo'}</td><td><button className={styles.link} disabled={pending} onClick={() => setChange({ user, role: user.role, isActive: !user.is_active })}>{user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>) : <tr><td colSpan={4}>No hay usuarios con estos filtros.</td></tr>}</tbody></table></div>{page && <Pagination page={page} />}
    {change && <ConfirmationDialog open title={title} description={description} recordName={change.user.full_name} confirmLabel={change.isActive === false ? 'Desactivar' : change.user.is_active === false ? 'Reactivar' : 'Cambiar rol'} variant="danger" onClose={() => setChange(null)} onConfirm={confirmAccess} />}
  </>;
}
