import { icon } from '../components/icons.js';
import { escapeHtml, money, normalize, round2 } from '../core/utils.js';
import { state, setFilter } from '../core/state.js';
import { inventoryValue, lowStockItems } from '../core/analytics.js';

function inventoryRow(item) {
  const low = Number(item.stock) < Number(item.min);
  return `<tr>
    <td><div class="table-product"><div class="inventory-icon">${icon('package', 16)}</div><b>${escapeHtml(item.name)}</b></div></td>
    <td>${escapeHtml(item.category)}</td>
    <td><strong>${item.stock} ${escapeHtml(item.unit)}</strong></td>
    <td>${item.min} ${escapeHtml(item.unit)}</td>
    <td>${low ? '<span class="low-pill"><i></i> Stock bajo</span>' : '<span class="active-pill"><i></i> En buen nivel</span>'}</td>
    <td>${money(round2(Number(item.stock) * Number(item.unit_cost)))}</td>
  </tr>`;
}

export function renderInventory() {
  const search = normalize(state.filters.inventorySearch);
  const filtered = state.inventory.filter(item => !search || normalize(item.name).includes(search) || normalize(item.category).includes(search));
  const alerts = lowStockItems(state.inventory);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const movements = state.movements.filter(movement => new Date(movement.created_at) >= start);
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">OPERACIONES · CONTROL DE EXISTENCIAS</p>
      <h1>Inventario</h1>
      <p class="muted">Monitorea insumos, costos y niveles mínimos.</p>
    </div>
    <button class="primary-btn" data-nav="inventario/entrada">${icon('plus', 17)} Registrar entrada</button>
  </div>
  <div class="inventory-stats">
    <div>${icon('package', 20)}<span>Valor del inventario<strong>${money(inventoryValue(state.inventory))}</strong></span></div>
    <div>${icon('bell', 20)}<span>Alertas de stock<strong class="danger-text">${alerts.length} ${alerts.length === 1 ? 'requiere atención' : 'requieren atención'}</strong></span></div>
    <div>${icon('arrow-up-right', 20)}<span>Movimientos del mes<strong>${movements.length} registrados</strong></span></div>
  </div>
  <section class="panel table-panel">
    <div class="table-toolbar">
      <h3>Existencias actuales</h3>
      <div class="search-box">${icon('search', 17)}<input id="inventory-search" placeholder="Buscar insumo..." value="${escapeHtml(state.filters.inventorySearch)}" autocomplete="off"></div>
    </div>
    <table>
      <thead><tr><th>Insumo</th><th>Categoría</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Valor</th></tr></thead>
      <tbody>${filtered.length ? filtered.map(inventoryRow).join('') : '<tr><td colspan="6" class="table-empty">No hay insumos que coincidan con la búsqueda.</td></tr>'}</tbody>
    </table>
  </section>`;
}

export function bindInventory(root) {
  const search = root.querySelector('#inventory-search');
  if (!search) return;
  search.addEventListener('input', event => {
    clearTimeout(search.__timer);
    search.__timer = setTimeout(() => setFilter('inventorySearch', event.target.value), 160);
  });
}
