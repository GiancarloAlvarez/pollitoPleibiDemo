import { icon } from '../components/icons.js';
import { escapeHtml, money } from '../core/utils.js';
import { state } from '../core/state.js';
import { CATEGORIES, PRODUCT_COLORS } from '../data/seed.js';
import { saveProduct, deleteProduct } from '../core/repo.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';
import { confirmAction } from '../components/modal.js';

function categoryOptions(selected) {
  return CATEGORIES.filter(item => item !== 'Todos').map(item => `<option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
}

function previewMarkup(product) {
  return `<div class="product-preview">
    <div class="mini-product ${escapeHtml(product.color)}" id="preview-emoji">${escapeHtml(product.emoji)}</div>
    <div><b id="preview-name">${escapeHtml(product.name)}</b><small id="preview-category">${escapeHtml(product.category)}</small><strong id="preview-price">${money(product.price)}</strong></div>
  </div>`;
}

export function renderProductForm(mode, id) {
  const product = id ? state.products.find(row => String(row.id) === String(id)) : null;
  if (mode === 'edit' && !product) {
    return `<div class="welcome-row compact"><div><p class="eyebrow">CATÁLOGO</p><h1>Producto no encontrado</h1><p class="muted">El producto que buscas no existe o fue eliminado.</p></div><button class="secondary-btn" data-nav="productos">${icon('arrow-left', 16)} Volver al catálogo</button></div>`;
  }
  const data = product || {
    name: '',
    category: 'Combos',
    price: '',
    cost: '',
    emoji: '🍗',
    color: 'gold',
    available: true,
  };
  const isEdit = Boolean(product);
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">CATÁLOGO</p>
      <h1>${isEdit ? 'Editar producto' : 'Nuevo producto'}</h1>
      <p class="muted">${isEdit ? 'Actualiza la información del producto en el catálogo.' : 'Añade un producto al menú de tu food truck.'}</p>
    </div>
    <button class="secondary-btn" data-nav="productos">${icon('arrow-left', 16)} Volver al catálogo</button>
  </div>
  <section class="panel form-view">
    <div class="panel-heading">
      <div><h3>${isEdit ? 'Información del producto' : 'Datos del nuevo producto'}</h3><p>Los cambios se guardan en este dispositivo y se sincronizan con Supabase.</p></div>
    </div>
    <form id="product-form" novalidate>
      <div class="form-grid">
        <label>Nombre del producto<input name="name" required maxlength="80" placeholder="Ej. Combo familiar" value="${escapeHtml(data.name)}"></label>
        <label>Categoría<select name="category">${categoryOptions(data.category)}</select></label>
      </div>
      <div class="form-grid">
        <label>Precio (RD$)<input name="price" type="number" min="1" step="0.01" required placeholder="0.00" value="${escapeHtml(data.price)}"></label>
        <label>Costo estimado (RD$)<input name="cost" type="number" min="0" step="0.01" placeholder="Se calcula al 39% del precio" value="${data.cost === '' ? '' : escapeHtml(data.cost)}"></label>
      </div>
      <div class="form-grid">
        <label>Emoji<input name="emoji" maxlength="8" value="${escapeHtml(data.emoji)}"></label>
        <label>Color de la tarjeta
          <div class="swatch-row" id="swatch-row">
            ${PRODUCT_COLORS.map(color => `<button type="button" class="swatch ${data.color === color ? 'selected' : ''}" data-color="${color}" style="background:${colorHex(color)}" aria-label="Color ${color}"></button>`).join('')}
          </div>
          <input type="hidden" name="color" value="${escapeHtml(data.color)}">
        </label>
      </div>
      <label>Estado
        <select name="available">
          <option value="true" ${data.available !== false ? 'selected' : ''}>Disponible</option>
          <option value="false" ${data.available === false ? 'selected' : ''}>No disponible</option>
        </select>
      </label>
      <div id="product-preview-wrap">${previewMarkup(data)}</div>
      <div class="form-actions">
        ${isEdit ? `<button type="button" class="secondary-btn" data-action="delete-product-form">${icon('trash-2', 15)} Eliminar</button>` : ''}
        <button type="button" class="secondary-btn" data-nav="productos">Cancelar</button>
        <button class="primary-btn" type="submit">${icon('save', 16)} Guardar producto</button>
      </div>
    </form>
  </section>`;
}

function colorHex(color) {
  const map = {
    gold: '#ffe9a6', coral: '#ffd8cb', cream: '#f8ead0', yellow: '#fff3b9', blue: '#dce9ff',
    pink: '#f6dcea', green: '#d7efd8', purple: '#e9def8', lime: '#e4efb5', orange: '#ffe0c0',
    sky: '#dce9ff', tan: '#f8ead0',
  };
  return map[color] || '#ffe9a6';
}

export function bindProductForm(root, mode, id) {
  const form = root.querySelector('#product-form');
  if (!form) return;
  const existing = id ? state.products.find(row => String(row.id) === String(id)) : null;

  const updatePreview = () => {
    const data = new FormData(form);
    const previewWrap = root.querySelector('#product-preview-wrap');
    if (!previewWrap) return;
    previewWrap.innerHTML = previewMarkup({
      name: data.get('name') || 'Nuevo producto',
      category: data.get('category') || 'Combos',
      price: Number(data.get('price')) || 0,
      emoji: data.get('emoji') || '🍗',
      color: data.get('color') || 'gold',
    });
  };

  form.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('input', updatePreview);
    field.addEventListener('change', updatePreview);
  });

  form.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => {
      form.querySelectorAll('[data-color]').forEach(item => item.classList.remove('selected'));
      button.classList.add('selected');
      form.querySelector('input[name="color"]').value = button.getAttribute('data-color');
      updatePreview();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await saveProduct({
        id: existing ? existing.id : null,
        name: data.get('name'),
        category: data.get('category'),
        price: data.get('price'),
        cost: data.get('cost'),
        emoji: data.get('emoji'),
        color: data.get('color'),
        available: data.get('available') === 'true',
      });
      showToast(existing ? 'Producto actualizado correctamente' : 'Producto creado correctamente', 'success');
      navigate('productos');
    } catch (error) {
      toastError(error);
    }
  });

  const deleteButton = form.querySelector('[data-action="delete-product-form"]');
  if (deleteButton && existing) {
    deleteButton.addEventListener('click', () => {
      confirmAction({
        title: 'Eliminar producto',
        description: `¿Seguro que quieres eliminar "${existing.name}"? Esta acción lo quita del catálogo.`,
        confirmLabel: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          await deleteProduct(existing.id);
          showToast('Producto eliminado correctamente', 'success');
          navigate('productos');
        },
      });
    });
  }
}
