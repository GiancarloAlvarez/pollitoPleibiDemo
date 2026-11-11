import { icon, renderIcons } from './icons.js';
import { escapeHtml, money } from '../core/utils.js';

let keyHandler = null;
let returnFocus = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

export function openModal(config) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  closeModal();
  returnFocus = document.activeElement;
  const {
    eyebrow = 'FORMULARIO OPERATIVO',
    title = 'Formulario',
    description = '',
    body = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
    onConfirm = () => true,
  } = config;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'presentation');
  backdrop.innerHTML = `
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-heading">
        <div>
          <p class="eyebrow">${eyebrow}</p>
          <h2 id="modal-title">${title}</h2>
          <p>${description}</p>
        </div>
        <button class="icon-btn" type="button" data-modal-close aria-label="Cerrar formulario">${icon('x', 19)}</button>
      </div>
      <form novalidate>
        ${body}
        <div class="modal-error" role="alert" hidden></div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" data-modal-close>${cancelLabel}</button>
          <button class="primary-btn${danger ? ' danger-btn' : ''}" type="submit">${confirmLabel}</button>
        </div>
      </form>
    </section>`;
  root.appendChild(backdrop);
  renderIcons(backdrop);

  const form = backdrop.querySelector('form');
  const errorBox = backdrop.querySelector('.modal-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  const close = () => closeModal();
  backdrop.querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click', close));
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop) close();
  });
  keyHandler = event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const fields = [...backdrop.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  document.addEventListener('keydown', keyHandler);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    errorBox.hidden = true;
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Guardando…';
    try {
      const result = await onConfirm(new FormData(form), form);
      if (result !== false) close();
    } catch (error) {
      errorBox.hidden = false;
      errorBox.className = 'modal-error form-error';
      errorBox.textContent = error && error.message ? error.message : 'Ocurrió un error. Intenta de nuevo.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });

  const firstField = form.querySelector('input, select, textarea, button');
  if (firstField) firstField.focus();
}

export function confirmAction(config) {
  return openModal({
    eyebrow: config.eyebrow || 'CONFIRMACIÓN',
    title: config.title || '¿Confirmar acción?',
    description: config.description || '',
    body: '',
    confirmLabel: config.confirmLabel || 'Confirmar',
    cancelLabel: 'Cancelar',
    danger: Boolean(config.danger),
    onConfirm: config.onConfirm,
  });
}

export function openCheckoutModal({ total, totalAmount, defaultCustomer = 'Mostrador', onConfirm }) {
  openModal({
    eyebrow: 'FORMULARIO OPERATIVO',
    title: 'Completar orden',
    description: 'Confirma el método de pago.',
    body: `
      <label>Cliente<input name="customer" required placeholder="Ej. Mostrador" value="${escapeHtml(defaultCustomer)}"></label>
      <label>Método de pago
        <select name="payment_method">
          <option>Efectivo</option>
          <option>Tarjeta</option>
          <option>Transferencia</option>
        </select>
      </label>
      <label data-cash-field>Efectivo recibido (RD$)<input name="amount_received" type="number" min="0" step="0.01" value="${Number(totalAmount) || 0}"></label>
      <p data-change-output aria-live="polite"></p>
      <div class="chart-legend"><span>Total a cobrar</span><strong>${total}</strong></div>`,
    confirmLabel: 'Cobrar orden',
    onConfirm: (data, form) => {
      const customer = String(data.get('customer') || '').trim();
      if (!customer) throw new Error('Indica el cliente o mostrador.');
      const paymentMethod = String(data.get('payment_method') || 'Efectivo');
      const amountReceived = paymentMethod === 'Efectivo' ? Number(data.get('amount_received')) : null;
      if (paymentMethod === 'Efectivo' && (!Number.isFinite(amountReceived) || amountReceived < totalAmount)) throw new Error('El efectivo recibido no cubre el total.');
      return onConfirm({ customer, paymentMethod, amountReceived }, form);
    },
  });
  const form = document.querySelector('#modal-root form');
  const update = () => {
    const cash = form.elements.payment_method.value === 'Efectivo';
    form.querySelector('[data-cash-field]').hidden = !cash;
    const change = Number(form.elements.amount_received.value) - Number(totalAmount);
    form.querySelector('[data-change-output]').textContent = cash ? (change >= 0 ? `Cambio: ${money(change)}` : 'Efectivo insuficiente') : '';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}
