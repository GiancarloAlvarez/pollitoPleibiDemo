import { icon } from '../components/icons.js';
import { escapeHtml } from '../core/utils.js';
import { state } from '../core/state.js';
import { saveSupplier, deleteSupplier } from '../core/repo.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

export function renderSupplierForm(mode, id) {
  const supplier = id ? state.suppliers.find(row => String(row.id) === String(id)) : null;
  if (mode === 'edit' && !supplier) {
    return `<div class="welcome-row compact"><div><p class="eyebrow">GESTIÓN · PROVEEDORES</p><h1>Proveedor no encontrado</h1><p class="muted">El proveedor que buscas no existe o fue eliminado.</p></div><button class="secondary-btn" data-nav="proveedores">${icon('arrow-left', 16)} Volver a proveedores</button></div>`;
  }
  const data = supplier || { name: '', contact: '', phone: '', email: '', notes: '', active: true };
  const isEdit = Boolean(supplier);
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">GESTIÓN · PROVEEDORES</p>
      <h1>${isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h1>
      <p class="muted">${isEdit ? 'Actualiza los datos de contacto del proveedor.' : 'Registra un nuevo contacto para tus compras.'}</p>
    </div>
    <button class="secondary-btn" data-nav="proveedores">${icon('arrow-left', 16)} Volver a proveedores</button>
  </div>
  <section class="panel form-view">
    <div class="panel-heading"><div><h3>Datos del proveedor</h3><p>Esta información se usa en las entradas de inventario.</p></div></div>
    <form id="supplier-form" novalidate>
      <div class="form-grid">
        <label>Nombre del proveedor<input name="name" required maxlength="80" placeholder="Ej. Distribuidora del Caribe" value="${escapeHtml(data.name)}"></label>
        <label>Persona de contacto<input name="contact" maxlength="80" placeholder="Ej. Carlos Jiménez" value="${escapeHtml(data.contact)}"></label>
      </div>
      <div class="form-grid">
        <label>Teléfono<input name="phone" maxlength="30" placeholder="809-555-0000" value="${escapeHtml(data.phone)}"></label>
        <label>Correo electrónico<input name="email" type="email" placeholder="compras@proveedor.do" value="${escapeHtml(data.email)}"></label>
      </div>
      <label>Notas<input name="notes" maxlength="140" placeholder="Días de despacho, condiciones de pago…" value="${escapeHtml(data.notes)}"></label>
      <label>Estado
        <select name="active">
          <option value="true" ${data.active !== false ? 'selected' : ''}>Activo</option>
          <option value="false" ${data.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </label>
      <div class="form-actions">
        ${isEdit ? `<button type="button" class="secondary-btn" data-action="delete-supplier-form">${icon('trash-2', 15)} Eliminar</button>` : ''}
        <button type="button" class="secondary-btn" data-nav="proveedores">Cancelar</button>
        <button class="primary-btn" type="submit">${icon('save', 16)} Guardar proveedor</button>
      </div>
    </form>
  </section>`;
}

export function bindSupplierForm(root, mode, id) {
  const form = root.querySelector('#supplier-form');
  if (!form) return;
  const existing = id ? state.suppliers.find(row => String(row.id) === String(id)) : null;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await saveSupplier({
        id: existing ? existing.id : null,
        name: data.get('name'),
        contact: data.get('contact'),
        phone: data.get('phone'),
        email: data.get('email'),
        notes: data.get('notes'),
        active: data.get('active') === 'true',
      });
      showToast(existing ? 'Proveedor actualizado correctamente' : 'Proveedor creado correctamente', 'success');
      navigate('proveedores');
    } catch (error) {
      toastError(error);
    }
  });
  const deleteButton = form.querySelector('[data-action="delete-supplier-form"]');
  if (deleteButton && existing) {
    deleteButton.addEventListener('click', () => {
      confirmAction({
        title: 'Eliminar proveedor',
        description: `¿Seguro que quieres eliminar a "${existing.name}"?`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteSupplier(existing.id);
          showToast('Proveedor eliminado correctamente', 'success');
          navigate('proveedores');
        },
      });
    });
  }
}
