'use client';

import { useRef, useState } from 'react';
import { inviteUser, setUserAccess } from '../../app/actions/admin';
import styles from '../business/manager.module.css';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { Dialog } from '../ui/Dialog';
import { Pagination } from '../ui/Pagination';
import type { PageInfo } from '../../lib/pagination';
import { useNativeFormDraft } from '../../lib/local-draft';

type User = { id: string; full_name: string; role: 'administrator' | 'management'; is_active: boolean };
type Change = { user: User; role: User['role']; isActive: boolean };
export function UserManager({ users, page }: { users: User[]; page?: PageInfo }) {
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState(''); const [inviteError, setInviteError] = useState(''); const [change, setChange] = useState<Change | null>(null); const [pendingInvite, setPendingInvite] = useState<FormData | null>(null); const first = useRef<HTMLInputElement>(null);
  const { formRef, available, capture, restore, discard, clearFields, clearDraft } = useNativeFormDraft('invite', 'new');
  async function confirmAccess() { if (!change) return; try { await setUserAccess({ id: change.user.id, role: change.role, isActive: change.isActive }); setChange(null); setMessage('Acceso actualizado.'); } catch (error) { throw new Error(error instanceof Error ? error.message : 'No fue posible actualizar el acceso.'); } }
  function submitInvite(form: FormData) { setPendingInvite(form); }
  async function confirmInvite() { if (!pendingInvite) return; setPending(true); try { setInviteError(''); await inviteUser({ email: pendingInvite.get('email'), fullName: pendingInvite.get('fullName'), role: pendingInvite.get('role') }); clearDraft(); setPendingInvite(null); setOpen(false); setMessage('Invitación enviada.'); } finally { setPending(false); } }
  const title = change?.isActive === false ? 'Desactivar usuario' : change?.user.is_active === false ? 'Reactivar usuario' : 'Cambiar rol';
  const description = change?.isActive === false ? 'Se cerrarán sus sesiones y perderá acceso hasta que un administrador lo reactive.' : change?.user.is_active === false ? 'El usuario podrá volver a acceder con el rol indicado.' : `El acceso cambiará a ${change?.role === 'administrator' ? 'Administrador' : 'Gerencia'}.`;
  return <><div className={styles.toolbar}><span>Solo administradores pueden gestionar acceso.</span><button className={styles.primary} onClick={() => setOpen(true)}>Invitar usuario</button></div>{message && <p role="status">{message}</p>}
    <Dialog open={open} title="Invitar usuario" onClose={() => setOpen(false)} initialFocusRef={first} locked={pending}><form ref={formRef} onInput={capture} onChange={capture} onSubmit={(event) => { event.preventDefault(); submitInvite(new FormData(event.currentTarget)); }} className={styles.form}>{available && <p role="status">Borrador local disponible <button type="button" onClick={restore}>Recuperar</button><button type="button" onClick={discard}>Descartar</button></p>}<label>Nombre completo<input ref={first} name="fullName" required /></label><label>Correo<input name="email" type="email" required /></label><label>Rol<select name="role"><option value="management">Gerencia</option><option value="administrator">Administrador</option></select></label>{inviteError && <p role="alert" className={styles.error}>{inviteError}</p>}<footer><button type="button" className={styles.cancel} disabled={pending} onClick={() => setOpen(false)}>Cancelar</button><button type="button" onClick={clearFields}>Limpiar campos</button><button className={styles.primary} disabled={pending}>{pending ? 'Enviando…' : 'Enviar invitación'}</button></footer></form></Dialog>
    {pendingInvite && <ConfirmationDialog open title="Confirmar invitación" description="Se enviará una invitación con el rol seleccionado." recordName={String(pendingInvite.get('email') ?? '')} confirmLabel="Enviar invitación" onClose={() => setPendingInvite(null)} onConfirm={confirmInvite} />}
    <div className={styles.tableWrap}><table><caption className="sr-only">Usuarios de Elecpro</caption><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td>{user.full_name}</td><td><select aria-label={`Rol de ${user.full_name}`} value={change?.user.id === user.id ? change.role : user.role} disabled={pending || !user.is_active} onChange={(event) => setChange({ user, role: event.target.value as User['role'], isActive: true })}><option value="administrator">Administrador</option><option value="management">Gerencia</option></select></td><td>{user.is_active ? 'Activo' : 'Inactivo'}</td><td><button className={styles.link} disabled={pending} onClick={() => setChange({ user, role: user.role, isActive: !user.is_active })}>{user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>) : <tr><td colSpan={4}>No hay usuarios con estos filtros.</td></tr>}</tbody></table></div>{page && <Pagination page={page} />}
    {change && <ConfirmationDialog open title={title} description={description} recordName={change.user.full_name} confirmLabel={change.isActive === false ? 'Desactivar' : change.user.is_active === false ? 'Reactivar' : 'Cambiar rol'} variant="danger" onClose={() => setChange(null)} onConfirm={confirmAccess} />}
  </>;
}
