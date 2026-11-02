import { icon } from '../components/icons.js';
import { escapeHtml, money, normalize } from '../core/utils.js';
import { state, setFilter } from '../core/state.js';
import { CATEGORIES } from '../data/seed.js';
import { toggleProduct, deleteProduct } from '../core/repo.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

function categoryOptions() {
  const values = Array.from(new Set([...CATEGORIES.filter(item => item !== 'Todos'), ...state.products.map(product => product.category)]));
  return values.map(value => `<option value="${escapeHtml(value)}" ${state.filters.productsCategory === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function productRow(product) {
  return `<tr>
    <td><div class="table-product"><div class="mini-product ${escapeHtml(product.color)}">${escapeHtml(product.emoji)}</div><b>${escapeHtml(product.name)}</b></div></td>
    <td>${escapeHtml(product.category)}</td>
    <td><strong>${money(product.price)}</strong></td>
    <td>${money(product.cost)}</td>
    <td>${product.available !== false ? '<span class="active-pill"><i></i> Disponible</span>' : '<span class="inactive-pill"><i></i> No disponible</span>'}</td>
    <td>
      <div class="table-actions">
        <button class="dots-btn" data-menu-toggle="menu-product-${escapeHtml(product.id)}" aria-label="Acciones de ${escapeHtml(product.name)}">${icon('more-horizontal', 18)}</button>
        <div class="action-menu" id="menu-product-${escapeHtml(product.id)}">
          <button data-nav="productos/editar/${encodeURIComponent(product.id)}">${icon('pencil', 15)} Editar producto</button>
          <button data-action="toggle-product" data-id="${escapeHtml(product.id)}">${icon(product.available !== false ? 'eye-off' : 'eye', 15)} ${product.available !== false ? 'Desactivar' : 'Activar'}</button>
          <button class="danger" data-action="delete-product" data-id="${escapeHtml(product.id)}">${icon('trash-2', 15)} Eliminar</button>
        </div>
      </div>
    </td>
  </tr>`;
}

export function renderProducts() {
  const search = normalize(state.filters.productsSearch);
  const category = state.filters.productsCategory;
  const filtered = state.products.filter(product => (category === 'Todos' || product.category === category)
    && (!search || normalize(product.name).includes(search)));
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">CATÁLOGO</p>
      <h1>Productos</h1>
      <p class="muted">Administra el menú y los precios de tu food truck.</p>
    </div>
    <button class="primary-btn" data-nav="productos/nuevo">${icon('plus', 17)} Nuevo producto</button>
  </div>
  <section class="panel table-panel">
    <div class="table-toolbar">
      <div class="search-box">${icon('search', 17)}<input id="products-search" placeholder="Buscar en productos..." value="${escapeHtml(state.filters.productsSearch)}" autocomplete="off"></div>
      <select class="secondary-btn" id="products-category" aria-label="Filtrar por categoría">
        <option value="Todos" ${category === 'Todos' ? 'selected' : ''}>Todas las categorías</option>
        ${categoryOptions()}
      </select>
    </div>
    <table>
      <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Costo estimado</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filtered.length ? filtered.map(productRow).join('') : '<tr><td colspan="6" class="table-empty">No hay productos que coincidan con el filtro.</td></tr>'}</tbody>
    </table>
  </section>`;
}

export function bindProducts(root) {
  const search = root.querySelector('#products-search');
  if (search) {
    search.addEventListener('input', event => {
      clearTimeout(search.__timer);
      search.__timer = setTimeout(() => setFilter('productsSearch', event.target.value), 160);
    });
  }
  const category = root.querySelector('#products-category');
  if (category) category.addEventListener('change', event => setFilter('productsCategory', event.target.value));

  root.querySelectorAll('[data-action="toggle-product"]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        const product = await toggleProduct(button.getAttribute('data-id'));
        showToast(`${product.name}: ${product.available ? 'disponible' : 'no disponible'}`, 'success');
      } catch (error) {
        toastError(error);
      }
    });
  });

  root.querySelectorAll('[data-action="delete-product"]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      const product = state.products.find(row => String(row.id) === String(id));
      confirmAction({
        title: 'Eliminar producto',
        description: `¿Seguro que quieres eliminar "${product ? product.name : 'este producto'}"? Se quitará del catálogo y del punto de venta.`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteProduct(id);
          showToast('Producto eliminado correctamente', 'success');
        },
      });
    });
  });
}
