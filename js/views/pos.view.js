import { icon } from '../components/icons.js';
import { escapeHtml, money, calcTax, round2, normalize, nextOrderCode } from '../core/utils.js';
import { state, setCart, setFilter } from '../core/state.js';
import { CATEGORIES } from '../data/seed.js';
import { createOrder } from '../core/repo.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';
import { openCheckoutModal } from '../components/modal.js';
import { renderCashSession, bindCashSession } from '../components/cash-session.js';
import { currentCashSession } from '../core/cash.js';
import { localEnabled } from '../core/local-client.js';

function cartTotals() {
  const subtotal = round2((state.cart || []).reduce((total, item) => total + Number(item.price) * Number(item.qty || 1), 0));
  const rate = Number(state.settings.tax_rate ?? 0.18);
  const tax = calcTax(subtotal, rate);
  return { subtotal, tax, total: round2(subtotal + tax), rate };
}

function productCard(product) {
  return `<button class="product-card" data-add-product="${escapeHtml(product.id)}">
    <div class="product-image ${escapeHtml(product.color)}">
      <span>${escapeHtml(product.emoji)}</span>
      <small>+ Añadir</small>
    </div>
    <div>
      <b>${escapeHtml(product.name)}</b>
      <small>${escapeHtml(product.category)}</small>
      <strong>${money(product.price)}</strong>
    </div>
  </button>`;
}

function cartItem(item, index) {
  return `<div class="cart-item">
    <div class="mini-product ${escapeHtml(item.color)}">${escapeHtml(item.emoji)}</div>
    <div><b>${escapeHtml(item.name)}</b><small>Sin indicaciones</small></div>
    <div class="qty">
      <button data-cart-dec="${index}" aria-label="Quitar uno">−</button>
      <span>${item.qty || 1}</span>
      <button data-cart-inc="${index}" aria-label="Agregar uno">+</button>
    </div>
    <strong>${money(Number(item.price) * Number(item.qty || 1))}</strong>
  </div>`;
}

export function renderPos() {
  const filters = state.filters;
  const search = normalize(filters.posSearch);
  const category = filters.posCategory;
  const filtered = state.products.filter(product => product.available !== false
    && (category === 'Todos' || product.category === category)
    && (!search || normalize(product.name).includes(search)));
  const totals = cartTotals();
  const nextCode = nextOrderCode(state.orders);

  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">OPERACIÓN · PUNTO DE VENTA</p>
      <h1>Punto de venta</h1>
      <p class="muted">Registra una nueva orden para tu cliente.</p>
    </div>
    ${renderCashSession()}
  </div>
  <div class="pos-layout">
    <section class="pos-products panel">
      <div class="pos-toolbar">
        <div class="search-box">
          ${icon('search', 17)}
          <input id="pos-search" placeholder="Buscar producto..." value="${escapeHtml(filters.posSearch)}" autocomplete="off">
          <kbd>⌘ K</kbd>
        </div>
      </div>
      <div class="category-tabs">
        ${CATEGORIES.map(item => `<button class="${category === item ? 'selected' : ''}" data-pos-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
      </div>
      <div class="product-grid">
        ${filtered.length ? filtered.map(productCard).join('') : '<div class="table-empty">No hay productos que coincidan con tu búsqueda.</div>'}
      </div>
    </section>
    <aside class="cart panel">
      <div class="cart-heading">
        <div><h3>Orden nueva</h3><span>${nextCode} · Ahora</span></div>
        <div class="table-actions">
          <button class="dots-btn" data-menu-toggle="menu-cart" aria-label="Más opciones">${icon('more-horizontal', 20)}</button>
          <div class="action-menu" id="menu-cart">
            <button data-action="clear-cart" class="${state.cart.length ? 'danger' : ''}">${icon('trash-2', 15)} Vaciar carrito</button>
          </div>
        </div>
      </div>
      <div class="cart-items">
        ${state.cart.length ? state.cart.map(cartItem).join('') : `<div class="empty-state">${icon('shopping-cart', 25)}<p>Tu carrito está vacío</p><small>Selecciona productos para comenzar</small></div>`}
      </div>
      <div class="cart-summary">
        <div><span>Subtotal</span><b>${money(totals.subtotal)}</b></div>
        <div><span>ITBIS <small>(${Math.round(totals.rate * 100)}%)</small></span><b>${money(totals.tax)}</b></div>
        <div class="total-line"><span>Total</span><strong>${money(totals.total)}</strong></div>
        <button class="primary-btn" data-action="send-kitchen" ${state.cart.length ? '' : 'disabled'}>Enviar a cocina ${icon('chef-hat', 17)}</button>
        <button class="secondary-btn full" data-action="checkout">Cobrar ahora ${icon('credit-card', 17)}</button>
      </div>
    </aside>
  </div>`;
}

function addToCart(productId) {
  const product = state.products.find(row => String(row.id) === String(productId));
  if (!product) return;
  const cart = [...state.cart];
  const existing = cart.find(item => String(item.id) === String(product.id));
  if (existing) existing.qty = (existing.qty || 1) + 1;
  else cart.push({ ...product, qty: 1 });
  setCart(cart);
  showToast(`${product.name} agregado al carrito`, 'success', 1700);
}

export function bindPos(root) {
  bindCashSession(root);
  let submitting = false;
  const checkCash = () => {
    if (!localEnabled() && !currentCashSession()) {
      showToast('Abre tu caja antes de registrar la orden.', 'warning');
      return false;
    }
    return true;
  };
  const searchInput = root.querySelector('#pos-search');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      const value = event.target.value;
      clearTimeout(searchInput.__timer);
      searchInput.__timer = setTimeout(() => setFilter('posSearch', value), 160);
    });
  }

  root.querySelectorAll('[data-pos-category]').forEach(button => {
    button.addEventListener('click', () => setFilter('posCategory', button.getAttribute('data-pos-category')));
  });

  root.querySelectorAll('[data-add-product]').forEach(button => {
    button.addEventListener('click', () => addToCart(button.getAttribute('data-add-product')));
  });

  root.querySelectorAll('[data-cart-inc]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-cart-inc'));
      const cart = state.cart.map((item, i) => (i === index ? { ...item, qty: (item.qty || 1) + 1 } : item));
      setCart(cart);
    });
  });

  root.querySelectorAll('[data-cart-dec]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-cart-dec'));
      const current = state.cart[index];
      if (!current) return;
      let cart;
      if ((current.qty || 1) > 1) {
        cart = state.cart.map((item, i) => (i === index ? { ...item, qty: item.qty - 1 } : item));
      } else {
        cart = state.cart.filter((item, i) => i !== index);
      }
      setCart(cart);
    });
  });

  root.querySelector('[data-action="clear-cart"]')?.addEventListener('click', () => {
    if (!state.cart.length) {
      showToast('El carrito ya está vacío', 'warning');
      return;
    }
    setCart([]);
    showToast('Carrito vaciado', 'success');
  });

  root.querySelector('[data-action="send-kitchen"]')?.addEventListener('click', async () => {
    if (!state.cart.length || submitting || !checkCash()) return;
    submitting = true;
    try {
      const order = await createOrder({
        items: state.cart,
        customer: 'Para llevar · Mostrador',
        channel: 'Mostrador',
        paymentMethod: 'Pendiente',
        paid: false,
        status: 'Nueva',
        cashSession: currentCashSession(),
      });
      setCart([]);
      showToast(`Orden ${order.code} enviada a cocina`, 'success');
      navigate('cocina');
    } catch (error) {
      toastError(error);
    } finally { submitting = false; }
  });

  root.querySelector('[data-action="checkout"]')?.addEventListener('click', () => {
    if (!checkCash()) return;
    if (!state.cart.length) {
      showToast('Agrega productos antes de cobrar', 'warning');
      return;
    }
    const totals = cartTotals();
    openCheckoutModal({
      total: money(totals.total),
      totalAmount: totals.total,
      onConfirm: async ({ customer, paymentMethod, amountReceived }) => {
        const order = await createOrder({
          items: state.cart,
          customer,
          channel: customer.split('·')[0].trim() || 'Mostrador',
          paymentMethod,
          paid: true,
          status: 'Nueva',
          cashSession: currentCashSession(),
          amountReceived,
        });
        setCart([]);
        showToast(`Cobro ${order.code} guardado. La sincronización se confirma por separado.`, 'success');
        navigate('ordenes');
      },
    });
  });

  root.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput?.focus();
    }
  });
}
