import { icon, renderIcons } from './icons.js';

let keyHandler = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
}

export function openModal(config) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  closeModal();
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
  };
  document.addEventListener('keydown', keyHandler);

  form.addEventListener('submit', async event => {
    event.preventDefault();
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

  const firstField = form.querySelector('input, select, textarea');
  if (firstField) setTimeout(() => firstField.focus(), 30);
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

export function openCheckoutModal({ total, defaultCustomer = 'Mostrador', onConfirm }) {
  openModal({
    eyebrow: 'FORMULARIO OPERATIVO',
    title: 'Completar orden',
    description: 'Confirma el método de pago.',
    body: `
      <label>Cliente<input name="customer" required placeholder="Ej. Mostrador" value="${defaultCustomer}"></label>
      <label>Método de pago
        <select name="payment_method">
          <option>Efectivo</option>
          <option>Tarjeta</option>
          <option>Transferencia</option>
        </select>
      </label>
      <div class="chart-legend"><span>Total a cobrar</span><strong>${total}</strong></div>`,
    confirmLabel: 'Cobrar orden',
    onConfirm: (data, form) => {
      const customer = String(data.get('customer') || '').trim();
      if (!customer) throw new Error('Indica el cliente o mostrador.');
      return onConfirm({ customer, paymentMethod: String(data.get('payment_method') || 'Efectivo') }, form);
    },
  });
}
