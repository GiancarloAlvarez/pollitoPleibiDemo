import { icon } from '../components/icons.js';
import { escapeHtml, relativeTime, initials } from '../core/utils.js';
import { state } from '../core/state.js';
import { toggleUser, deleteUser } from '../core/repo.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

function userRow(user) {
  const isSelf = state.user && state.user.id === user.id;
  return `<tr>
    <td><div class="user-table"><div class="avatar">${escapeHtml(initials(user.name))}</div><span><b>${escapeHtml(user.name)}${isSelf ? ' (tú)' : ''}</b><small>${escapeHtml(user.email)}</small></span></div></td>
    <td><span class="role-pill">${escapeHtml(user.role_name || user.role)}</span></td>
    <td>${user.last_access ? escapeHtml(relativeTime(user.last_access)) : 'Nunca'}</td>
    <td>${user.active !== false ? '<span class="active-pill"><i></i> Activo</span>' : '<span class="inactive-pill"><i></i> Inactivo</span>'}</td>
    <td>
      <div class="table-actions">
        <button class="dots-btn" data-menu-toggle="menu-user-${escapeHtml(user.id)}" aria-label="Acciones de ${escapeHtml(user.name)}">${icon('more-horizontal', 18)}</button>
        <div class="action-menu" id="menu-user-${escapeHtml(user.id)}">
          <button data-nav="usuarios/editar/${encodeURIComponent(user.id)}">${icon('pencil', 15)} Editar usuario</button>
          <button data-action="toggle-user" data-id="${escapeHtml(user.id)}">${icon(user.active !== false ? 'eye-off' : 'eye', 15)} ${user.active !== false ? 'Desactivar' : 'Activar'}</button>
          <button class="danger" data-action="delete-user" data-id="${escapeHtml(user.id)}" ${isSelf ? 'disabled' : ''}>${icon('trash-2', 15)} Eliminar</button>
        </div>
      </div>
    </td>
  </tr>`;
}

export function renderUsers() {
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">EQUIPO Y PERMISOS</p>
      <h1>Usuarios</h1>
      <p class="muted">Administra quién puede acceder al sistema.</p>
    </div>
    <button class="primary-btn" data-nav="usuarios/nuevo">${icon('plus', 17)} Crear usuario</button>
  </div>
  <section class="panel table-panel">
    <table>
      <thead><tr><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
      <tbody>${state.users.length ? state.users.map(userRow).join('') : '<tr><td colspan="5" class="table-empty">No hay usuarios registrados.</td></tr>'}</tbody>
    </table>
  </section>`;
}

export function bindUsers(root) {
  root.querySelectorAll('[data-action="toggle-user"]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        const user = await toggleUser(button.getAttribute('data-id'));
        showToast(`${user.name}: ${user.active ? 'activo' : 'inactivo'}`, 'success');
      } catch (error) {
        toastError(error);
      }
    });
  });

  root.querySelectorAll('[data-action="delete-user"]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const user = state.users.find(row => String(row.id) === String(id));
      confirmAction({
        title: 'Eliminar usuario',
        description: `¿Seguro que quieres eliminar a "${user ? user.name : 'este usuario'}"? No podrá iniciar sesión nuevamente.`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteUser(id);
          showToast('Usuario eliminado correctamente', 'success');
        },
      });
    });
  });
}
