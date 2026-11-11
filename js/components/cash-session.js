import { openModal } from './modal.js';
import { openCashSession, currentCashSession, refreshCashSessions } from '../core/cash.js';
import { state } from '../core/state.js';
import { reload } from '../core/repo.js';
import { escapeHtml, money, uid } from '../core/utils.js';
import { showToast, toastError } from './toast.js';
import { localEnabled } from '../core/local-client.js';

export function renderCashSession() {
  if (localEnabled()) return '<div class="cash-status">Red local · apertura de caja pendiente de integración</div>';
  const cash = currentCashSession();
  return `<div class="cash-session-controls">
    <div class="cash-status">${cash ? `${cash.demo ? 'Caja demo' : 'Caja abierta'} · Fondo inicial <b>${money(cash.monto_inicial)}</b>` : 'Caja sin abrir'}</div>
    <small>${escapeHtml(state.user?.name || '')}</small>
    <button class="secondary-btn" data-action="open-cash">${cash ? 'Consultar caja' : 'Abrir caja'}</button>
    ${state.user?.remote_id ? '<button class="secondary-btn" data-action="refresh-cash">Actualizar caja</button>' : ''}
  </div>`;
}

export function bindCashSession(root) {
  root.querySelector('[data-action="refresh-cash"]')?.addEventListener('click', async () => {
    try { await refreshCashSessions(); await reload(); showToast('Caja actualizada', 'success'); }
    catch (error) { toastError(error); }
  });
  root.querySelector('[data-action="open-cash"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (cash) {
      openModal({ title: cash.demo ? 'Caja de demostración' : 'Sesión de caja', confirmLabel: 'Entendido',
        description: 'El fondo inicial no representa las ventas ni el efectivo esperado.',
        body: `<p>Responsable: ${escapeHtml(state.user.name)}</p><p>Fondo inicial: <b>${money(cash.monto_inicial)}</b></p>
          <p>Apertura: ${escapeHtml(new Date(cash.fecha_apertura).toLocaleString('es-DO'))}</p>
          <p>El cierre y arqueo se implementarán en el siguiente módulo.</p>` });
      return;
    }
    const operationId = uid(); // Se conserva si la respuesta se pierde y el modal reintenta.
    openModal({ title: 'Abrir caja', confirmLabel: 'Confirmar apertura',
      description: state.user.remote_id ? 'Se confirmará una sesión propia en Supabase.' : 'Cuenta demo: esta caja y sus ventas permanecerán locales.',
      body: `<p>Cajero: <b>${escapeHtml(state.user.name)}</b></p>
        <label>Fondo inicial (RD$)<input name="opening_amount" type="number" min="0" max="99999999.99" step="0.01" value="0" required></label>`,
      onConfirm: async data => {
        const input = String(data.get('opening_amount') || '').trim();
        if (!input) throw new Error('Indica el fondo inicial.');
        await openCashSession(input, operationId);
        await reload();
        showToast('Apertura registrada', 'success');
      },
    });
  });
}
