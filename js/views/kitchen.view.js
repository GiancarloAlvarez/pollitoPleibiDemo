import { icon } from '../components/icons.js';
import { escapeHtml, relativeTime } from '../core/utils.js';
import { state } from '../core/state.js';
import { kitchenOrders } from '../core/analytics.js';
import { advanceOrder } from '../core/repo.js';
import { showToast, toastError } from '../components/toast.js';

const COLUMNS = ['Nueva', 'Preparando', 'Lista', 'Entregada'];

function clockText() {
  return new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

function kitchenCard(order) {
  const status = String(order.status || 'Nueva');
  const labels = {
    Nueva: 'Comenzar preparación',
    Preparando: 'Marcar lista',
    Lista: 'Entregar orden',
  };
  return `<article class="kitchen-card ${status.toLowerCase()}">
    <div class="kitchen-card-top">
      <b>${escapeHtml(order.code)}</b>
      <span>${icon('clock-3', 13)} ${escapeHtml(relativeTime(order.created_at).replace('Hace ', ''))}</span>
    </div>
    <p>${escapeHtml(order.customer)}</p>
    <div class="kitchen-items"><span>🍗</span><b>${escapeHtml(order.items_text)}</b></div>
    ${status !== 'Entregada' ? `<button class="advance-btn" data-advance="${escapeHtml(order.id)}">${labels[status] || 'Avanzar'} ${icon('chevron-right', 15)}</button>` : ''}
  </article>`;
}

export function renderKitchen() {
  const orders = kitchenOrders(state.orders);
  const average = orders.length ? Math.round(orders.reduce((total, order) => total + (Date.now() - new Date(order.created_at).getTime()), 0) / orders.length / 60000) : 0;
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">OPERACIÓN · VISTA DE PRODUCCIÓN</p>
      <h1>Comandera de cocina</h1>
      <p class="muted">Órdenes activas y tiempos de preparación.</p>
    </div>
    <div class="kitchen-clock" id="kitchen-clock">${icon('clock-3', 16)} ${clockText()}</div>
  </div>
  <div class="kitchen-note">${icon('sparkles', 17)}<span><b>Buen ritmo, equipo.</b> Tiempo promedio de preparación: ${average} min.</span></div>
  <div class="kitchen-board">
    ${COLUMNS.map(status => {
      const list = orders.filter(order => order.status === status);
      return `<section class="kitchen-column">
        <div class="column-heading">
          <span class="column-dot ${status.toLowerCase()}"></span>
          <h3>${status}</h3>
          <b>${list.length}</b>
        </div>
        ${list.length ? list.map(kitchenCard).join('') : `<div class="table-empty">Sin órdenes</div>`}
      </section>`;
    }).join('')}
  </div>`;
}

export function bindKitchen(root) {
  root.querySelectorAll('[data-advance]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        const order = await advanceOrder(button.getAttribute('data-advance'));
        showToast(`Orden ${order.code}: ${order.status}`, 'success');
      } catch (error) {
        toastError(error);
      }
    });
  });
  if (window.__kitchenClock) clearInterval(window.__kitchenClock);
  window.__kitchenClock = setInterval(() => {
    const clock = document.getElementById('kitchen-clock');
    if (!clock) {
      clearInterval(window.__kitchenClock);
      return;
    }
    clock.innerHTML = `${icon('clock-3', 16)} ${clockText()}`;
    if (window.lucide) window.lucide.createIcons();
  }, 30000);
}
