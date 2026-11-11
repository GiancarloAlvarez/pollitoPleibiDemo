import { state } from '../core/state.js';
import { escapeHtml, money, formatDateTime } from '../core/utils.js';
import { showReceipt } from '../components/receipt.js';
import { toastError } from '../components/toast.js';

function sellerFor(order) {
  return order.seller_name || state.users.find(user => user.id === order.user_id || user.remote_id === order.remote_user_id)?.name || 'Sin atribución histórica';
}

export function renderOrders() {
  const orders = state.orders.filter(order => state.role === 'admin'
    || order.user_id === state.user.id || (state.user.remote_id && order.remote_user_id === state.user.remote_id));
  return `<div class="welcome-row compact"><div><p class="eyebrow">VENTAS Y COMPROBANTES</p><h1>Órdenes</h1>
    <p class="muted">Consulta los importes históricos e imprime una copia sin duplicar la venta.</p></div></div>
    <section class="panel orders-receipts"><label>Buscar orden o cliente<input type="search" data-order-search placeholder="Número o cliente"></label>
    <div class="table-scroll"><table><thead><tr><th>Orden / fecha</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th>Pago / cocina</th><th>Comprobante</th></tr></thead>
    <tbody>${orders.map(order => `<tr data-order-row data-search="${escapeHtml(`${order.code} ${order.customer}`.toLowerCase())}">
      <td>${escapeHtml(order.code)}<br><small>${escapeHtml(formatDateTime(order.created_at))}</small></td><td>${escapeHtml(order.customer)}</td>
      <td>${escapeHtml(sellerFor(order))}</td><td>${money(order.total)}</td><td>${order.paid ? 'Pago registrado' : 'Pendiente'}<br>${escapeHtml(order.status)}</td>
      <td><button class="secondary-btn" data-receipt="${escapeHtml(order.id)}">Ver / imprimir</button></td></tr>`).join('') || '<tr><td colspan="6">Sin órdenes para este usuario.</td></tr>'}</tbody></table></div></section>`;
}

export function bindOrders(root) {
  root.querySelector('[data-order-search]')?.addEventListener('input', event => {
    const search = event.target.value.toLowerCase().trim();
    root.querySelectorAll('[data-order-row]').forEach(row => { row.hidden = !row.dataset.search.includes(search); });
  });
  root.querySelectorAll('[data-receipt]').forEach(button => button.addEventListener('click', () => {
    const order = state.orders.find(row => row.id === button.dataset.receipt);
    try { showReceipt(order, sellerFor(order)); } catch (error) { toastError(error); }
  }));
}
