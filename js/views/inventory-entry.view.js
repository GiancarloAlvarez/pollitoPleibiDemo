import { icon } from '../components/icons.js';
import { escapeHtml, money, round2 } from '../core/utils.js';
import { state } from '../core/state.js';
import { addInventoryEntry, saveInventory } from '../core/repo.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';

function itemOptions() {
  return state.inventory.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (${item.stock} ${escapeHtml(item.unit)})</option>`).join('');
}

function supplierOptions() {
  return state.suppliers.filter(supplier => supplier.active !== false).map(supplier => `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join('');
}

export function renderInventoryEntry() {
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">OPERACIONES · ENTRADA DE INVENTARIO</p>
      <h1>Registrar entrada</h1>
      <p class="muted">Actualiza las existencias de un insumo y deja registro del movimiento.</p>
    </div>
    <button class="secondary-btn" data-nav="inventario">${icon('arrow-left', 16)} Volver al inventario</button>
  </div>
  <section class="panel form-view">
    <div class="panel-heading"><div><h3>Datos de la entrada</h3><p>La cantidad se sumará al stock actual del insumo.</p></div></div>
    <form id="inventory-entry-form" novalidate>
      <div class="form-row-inline" style="border-top:0;padding-top:0;margin-top:0">
        <span><b>¿El insumo ya existe?</b><small>Si es nuevo, activa la opción para crearlo.</small></span>
        <label class="check-label"><input type="checkbox" id="new-item-toggle"> Es un insumo nuevo</label>
      </div>
      <div id="existing-item-fields">
        <label>Insumo<select name="itemId">${itemOptions()}</select></label>
      </div>
      <div id="new-item-fields" hidden>
        <div class="form-grid">
          <label>Nombre del insumo<input name="new_name" placeholder="Ej. Queso cheddar"></label>
          <label>Categoría<input name="new_category" placeholder="Ej. Lácteos"></label>
        </div>
        <div class="form-grid">
          <label>Unidad<select name="new_unit"><option>kg</option><option>lts</option><option>und</option><option>lb</option></select></label>
          <label>Stock mínimo<input name="new_min" type="number" min="0" step="0.01" value="0"></label>
        </div>
      </div>
      <div class="form-grid">
        <label>Cantidad<input name="quantity" type="number" min="0.01" step="0.01" required placeholder="0"></label>
        <label>Unidad<select name="unit"><option>kg</option><option>lts</option><option>und</option><option>lb</option></select></label>
      </div>
      <div class="form-grid">
        <label>Costo unitario (RD$)<input name="unitCost" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <label>Proveedor<select name="supplierId"><option value="">Sin proveedor</option>${supplierOptions()}</select></label>
      </div>
      <label>Nota<input name="note" maxlength="120" placeholder="Ej. Compra semanal"></label>
      <p class="form-hint" id="item-hint"></p>
      <div class="form-actions">
        <button type="button" class="secondary-btn" data-nav="inventario">Cancelar</button>
        <button class="primary-btn" type="submit">${icon('save', 16)} Guardar entrada</button>
      </div>
    </form>
  </section>`;
}

export function bindInventoryEntry(root) {
  const form = root.querySelector('#inventory-entry-form');
  if (!form) return;
  const toggle = root.querySelector('#new-item-toggle');
  const existingFields = root.querySelector('#existing-item-fields');
  const newFields = root.querySelector('#new-item-fields');
  const itemSelect = form.querySelector('select[name="itemId"]');
  const unitField = form.querySelector('select[name="unit"]');
  const costField = form.querySelector('input[name="unitCost"]');
  const hint = root.querySelector('#item-hint');

  const updateHint = () => {
    const item = state.inventory.find(row => String(row.id) === String(itemSelect.value));
    if (!item) {
      hint.textContent = '';
      return;
    }
    unitField.value = item.unit;
    costField.value = item.unit_cost;
    const low = Number(item.stock) < Number(item.min);
    hint.textContent = `Stock actual: ${item.stock} ${item.unit} · Mínimo: ${item.min} ${item.unit} · Valor actual: ${money(round2(item.stock * item.unit_cost))}${low ? ' · Stock bajo' : ''}`;
  };

  itemSelect.addEventListener('change', updateHint);
  updateHint();

  toggle.addEventListener('change', () => {
    existingFields.hidden = toggle.checked;
    newFields.hidden = !toggle.checked;
    itemSelect.required = !toggle.checked;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      let itemId = data.get('itemId');
      if (toggle.checked) {
        const created = await saveInventory({
          name: data.get('new_name'),
          category: data.get('new_category') || 'Otros',
          stock: 0,
          unit: data.get('new_unit'),
          min: data.get('new_min'),
          unit_cost: data.get('unitCost') || 0,
        });
        itemId = created.id;
      }
      const result = await addInventoryEntry({
        itemId,
        quantity: data.get('quantity'),
        unit: data.get('unit'),
        unitCost: data.get('unitCost'),
        supplierId: data.get('supplierId') || null,
        note: data.get('note'),
      });
      showToast(`Entrada registrada: ${result.item.name}`, 'success');
      navigate('inventario');
    } catch (error) {
      toastError(error);
    }
  });
}
