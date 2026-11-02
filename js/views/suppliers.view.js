import { icon } from '../components/icons.js';
import { escapeHtml } from '../core/utils.js';
import { state } from '../core/state.js';
import { toggleSupplier, deleteSupplier } from '../core/repo.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

function supplierRow(supplier) {
  return `<tr>
    <td><div class="table-product"><div class="inventory-icon">${icon('truck', 16)}</div><span><b>${escapeHtml(supplier.name)}</b><small style="display:block;color:var(--muted);font-size:9px;margin-top:3px">${escapeHtml(supplier.notes || '')}</small></span></div></td>
    <td>${escapeHtml(supplier.contact || '—')}</td>
    <td>${escapeHtml(supplier.phone || '—')}</td>
    <td>${escapeHtml(supplier.email || '—')}</td>
    <td>${supplier.active !== false ? '<span class="active-pill"><i></i> Activo</span>' : '<span class="inactive-pill"><i></i> Inactivo</span>'}</td>
    <td>
      <div class="table-actions">
        <button class="dots-btn" data-menu-toggle="menu-supplier-${escapeHtml(supplier.id)}" aria-label="Acciones de ${escapeHtml(supplier.name)}">${icon('more-horizontal', 18)}</button>
        <div class="action-menu" id="menu-supplier-${escapeHtml(supplier.id)}">
          <button data-nav="proveedores/editar/${encodeURIComponent(supplier.id)}">${icon('pencil', 15)} Editar proveedor</button>
          <button data-action="toggle-supplier" data-id="${escapeHtml(supplier.id)}">${icon(supplier.active !== false ? 'eye-off' : 'eye', 15)} ${supplier.active !== false ? 'Desactivar' : 'Activar'}</button>
          <button class="danger" data-action="delete-supplier" data-id="${escapeHtml(supplier.id)}">${icon('trash-2', 15)} Eliminar</button>
        </div>
      </div>
    </td>
  </tr>`;
}

export function renderSuppliers() {
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">GESTIÓN · CADENA DE SUMINISTRO</p>
      <h1>Proveedores</h1>
      <p class="muted">Administra los contactos que abastecen tu operación.</p>
    </div>
    <button class="primary-btn" data-nav="proveedores/nuevo">${icon('plus', 17)} Nuevo proveedor</button>
  </div>
  <section class="panel table-panel">
    <table>
      <thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${state.suppliers.length ? state.suppliers.map(supplierRow).join('') : '<tr><td colspan="6" class="table-empty">No hay proveedores registrados.</td></tr>'}</tbody>
    </table>
  </section>`;
}

export function bindSuppliers(root) {
  root.querySelectorAll('[data-action="toggle-supplier"]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        const supplier = await toggleSupplier(button.getAttribute('data-id'));
        showToast(`${supplier.name}: ${supplier.active ? 'activo' : 'inactivo'}`, 'success');
      } catch (error) {
        toastError(error);
      }
    });
  });

  root.querySelectorAll('[data-action="delete-supplier"]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const supplier = state.suppliers.find(row => String(row.id) === String(id));
      confirmAction({
        title: 'Eliminar proveedor',
        description: `¿Seguro que quieres eliminar a "${supplier ? supplier.name : 'este proveedor'}"?`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteSupplier(id);
          showToast('Proveedor eliminado correctamente', 'success');
        },
      });
    });
  });
}
