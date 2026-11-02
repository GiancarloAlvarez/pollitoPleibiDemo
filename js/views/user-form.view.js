import { icon } from '../components/icons.js';
import { escapeHtml } from '../core/utils.js';
import { state } from '../core/state.js';
import { saveUser, deleteUser } from '../core/repo.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

export function renderUserForm(mode, id) {
  const user = id ? state.users.find(row => String(row.id) === String(id)) : null;
  if (mode === 'edit' && !user) {
    return `<div class="welcome-row compact"><div><p class="eyebrow">EQUIPO Y PERMISOS</p><h1>Usuario no encontrado</h1><p class="muted">El usuario que buscas no existe o fue eliminado.</p></div><button class="secondary-btn" data-nav="usuarios">${icon('arrow-left', 16)} Volver a usuarios</button></div>`;
  }
  const data = user || { name: '', email: '', role: 'cajero', active: true };
  const isEdit = Boolean(user);
  const isSelf = Boolean(user && state.user && state.user.id === user.id);
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">EQUIPO Y PERMISOS</p>
      <h1>${isEdit ? 'Editar usuario' : 'Crear usuario'}</h1>
      <p class="muted">${isEdit ? 'Actualiza los datos y permisos del miembro del equipo.' : 'Invita a un miembro del equipo a usar el sistema.'}</p>
    </div>
    <button class="secondary-btn" data-nav="usuarios">${icon('arrow-left', 16)} Volver a usuarios</button>
  </div>
  <section class="panel form-view">
    <div class="panel-heading"><div><h3>${isEdit ? 'Datos del usuario' : 'Nuevo miembro del equipo'}</h3><p>La contraseña permite el acceso offline en este dispositivo.</p></div></div>
    <form id="user-form" novalidate>
      <div class="form-grid">
        <label>Nombre completo<input name="name" required maxlength="80" placeholder="Ej. Ana Rodríguez" value="${escapeHtml(data.name)}"></label>
        <label>Correo electrónico<input name="email" type="email" required placeholder="correo@ejemplo.com" value="${escapeHtml(data.email)}"></label>
      </div>
      <div class="form-grid">
        <label>Rol
          <select name="role">
            <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Administrador</option>
            <option value="cajero" ${data.role === 'cajero' ? 'selected' : ''}>Cajero</option>
            <option value="cocina" ${data.role === 'cocina' ? 'selected' : ''}>Cocinero</option>
          </select>
        </label>
        <label>Estado
          <select name="active" ${isSelf ? 'disabled' : ''}>
            <option value="true" ${data.active !== false ? 'selected' : ''}>Activo</option>
            <option value="false" ${data.active === false ? 'selected' : ''}>Inactivo</option>
          </select>
        </label>
      </div>
      <label>${isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}
        <input name="password" type="password" minlength="6" autocomplete="new-password" placeholder="${isEdit ? 'Dejar en blanco para conservar la actual' : 'Mínimo 6 caracteres'}">
      </label>
      <p class="form-hint">${isEdit ? 'Solo se actualiza la contraseña si escribes una nueva.' : 'El usuario podrá iniciar sesión offline con este correo y contraseña.'}</p>
      <div class="form-actions">
        ${isEdit && !isSelf ? `<button type="button" class="secondary-btn" data-action="delete-user-form">${icon('trash-2', 15)} Eliminar</button>` : ''}
        <button type="button" class="secondary-btn" data-nav="usuarios">Cancelar</button>
        <button class="primary-btn" type="submit">${icon('save', 16)} Guardar usuario</button>
      </div>
    </form>
  </section>`;
}

export function bindUserForm(root, mode, id) {
  const form = root.querySelector('#user-form');
  if (!form) return;
  const existing = id ? state.users.find(row => String(row.id) === String(id)) : null;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await saveUser({
        id: existing ? existing.id : null,
        name: data.get('name'),
        email: data.get('email'),
        role: data.get('role'),
        active: data.get('active') === 'true',
        password: data.get('password'),
      });
      showToast(existing ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
      navigate('usuarios');
    } catch (error) {
      toastError(error);
    }
  });

  const deleteButton = form.querySelector('[data-action="delete-user-form"]');
  if (deleteButton && existing) {
    deleteButton.addEventListener('click', () => {
      confirmAction({
        title: 'Eliminar usuario',
        description: `¿Seguro que quieres eliminar a "${existing.name}"? No podrá iniciar sesión nuevamente.`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteUser(existing.id);
          showToast('Usuario eliminado correctamente', 'success');
          navigate('usuarios');
        },
      });
    });
  }
}
