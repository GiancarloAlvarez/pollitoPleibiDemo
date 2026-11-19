import { openModal, closeModal } from './modal.js';
import {
  openCashSession, currentCashSession, refreshCashSessions, cashSummary,
  closeCashSession, registerCashMovement, registerCashExpense,
} from '../core/cash.js';
import { cashCloseMarkup, printCashClose } from './receipt.js';
import { state } from '../core/state.js';
import { reload } from '../core/repo.js';
import { escapeHtml, money, uid, round2 } from '../core/utils.js';
import { showToast, toastError } from './toast.js';
import { localEnabled } from '../core/local-client.js';

const EXPENSE_CATEGORIES = ['Insumos', 'Nómina', 'Transporte', 'Servicios', 'Mantenimiento', 'Otros'];

function statusText(cash) {
  return cash
    ? `${cash.demo ? 'Caja demo' : 'Caja abierta'} · Fondo inicial <b>${money(cash.monto_inicial)}</b>`
    : 'Caja sin abrir';
}

export function renderCashSession() {
  if (localEnabled()) return '<div class="cash-status">Red local · apertura de caja pendiente de integración</div>';
  const cash = currentCashSession();
  return `<div class="cash-session-controls">
    <div class="cash-status">${statusText(cash)}</div>
    <small>${escapeHtml(state.user?.name || '')}</small>
    ${cash ? '<button type="button" class="secondary-btn" data-action="close-cash">Cerrar caja</button>'
      : '<button type="button" class="secondary-btn" data-action="open-cash">Abrir caja</button>'}
    ${cash ? '<button class="secondary-btn" data-action="cash-movement">Movimiento</button>' : ''}
    ${state.user?.remote_id ? '<button class="secondary-btn" data-action="refresh-cash">Actualizar caja</button>' : ''}
  </div>`;
}

function summaryRows(summary) {
  const rows = [
    ['Fondo inicial', summary.monto_inicial],
    ['Cobros en efectivo', summary.cobros_efectivo],
    ['Entradas de efectivo', summary.entradas],
    ['Retiros', `− ${money(summary.retiros)}`],
    ['Gastos pagados de caja', `− ${money(summary.gastos_caja)}`],
  ];
  return rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${typeof value === 'string' ? value : money(value)}</td></tr>`).join('');
}

function arqueoMarkup(summary) {
  return `<div class="cash-arqueo">
    <table class="cash-arqueo-table"><tbody>${summaryRows(summary)}</tbody>
      <tfoot><tr><td>Efectivo esperado</td><td><b>${money(summary.esperado)}</b></td></tr></tfoot>
    </table>
    ${summary.propinas_efectivo ? `<p class="form-hint">Propinas en efectivo incluidas en los cobros: ${money(summary.propinas_efectivo)}.</p>` : ''}
    <p class="form-hint">Los cobros se toman de la tabla de pagos en efectivo (sin sumar dos veces el total de la orden). Las ventas anuladas no entran al arqueo.</p>
  </div>`;
}

function bindDifference(form, expected) {
  const declared = form.querySelector('[name="declared"]');
  const output = form.querySelector('[data-cash-difference]');
  if (!declared || !output) return;
  const update = () => {
    const value = Number(declared.value);
    if (!declared.value || !Number.isFinite(value) || !declared.validity.valid) {
      output.textContent = 'Diferencia: indica el efectivo contado.';
      output.classList.remove('danger-text');
      return;
    }
    const difference = round2(value - Number(expected || 0));
    output.textContent = difference === 0 ? 'Diferencia: RD$ 0.00 · cuadra' : `Diferencia: ${money(difference)}`;
    output.classList.toggle('danger-text', difference !== 0);
  };
  declared.addEventListener('input', update);
  update();
}

function renderClosedCashState(form, result) {
  if (!form?.isConnected) return;
  const arqueoView = form.querySelector('[data-cash-view="arqueo"]');
  const zView = form.querySelector('[data-cash-view="z"]');
  if (!zView) return;
  const markup = cashCloseMarkup(
    { ...result.row, business: state.settings },
    result.summary,
    state.user?.name,
  );
  zView.innerHTML = `<p class="form-hint">Cierre confirmado. Revisa el comprobante, imprime el Z o cierra esta ventana.</p>
    <label>Formato<select name="z_paper"><option value="80">Ticket 80 mm</option><option value="58">Ticket 58 mm</option><option value="a4">A4</option></select></label>
    <div class="cash-close-preview">${markup}</div>
    <div class="cash-close-actions">
      <button type="button" class="secondary-btn" data-action="dismiss-cash-close">Cerrar</button>
      <button type="button" class="primary-btn" data-action="print-cash-close">Imprimir Z</button>
    </div>`;
  if (arqueoView) arqueoView.hidden = true;
  zView.hidden = false;
  const actions = form.querySelector(':scope > .modal-actions');
  if (actions) {
    actions.hidden = true;
    actions.style.display = 'none';
  }
  const heading = form.closest('.modal-card')?.querySelector('.modal-heading');
  if (heading) {
    const title = heading.querySelector('h2');
    const description = heading.querySelector('p:not(.eyebrow)');
    if (title) title.textContent = 'Cierre de caja (Z)';
    if (description) description.textContent = 'El cierre quedó registrado. Revisa e imprime el comprobante.';
  }
  zView.querySelector('[data-action="print-cash-close"]')?.addEventListener('click', () => {
    const paper = String(zView.querySelector('[name="z_paper"]')?.value || '80');
    printCashClose(markup, paper);
  });
  zView.querySelector('[data-action="dismiss-cash-close"]')?.addEventListener('click', closeModal);
  zView.querySelector('[data-action="print-cash-close"]')?.focus();
}

async function openCashModal(cash) {
  try {
    const summary = await cashSummary(cash);
    openModal({
      title: cash.demo ? 'Cerrar caja demo' : 'Cerrar caja',
      confirmLabel: 'Confirmar cierre',
      danger: true,
      description: 'Revisa el arqueo, cuenta el efectivo físico e indica el monto declarado. El cierre queda registrado y no se edita.',
      body: `<div data-cash-view="arqueo">${arqueoMarkup(summary)}
        <p>Responsable: ${escapeHtml(state.user.name)}<br>
          Apertura: ${escapeHtml(new Date(summary.fecha_apertura || cash.fecha_apertura).toLocaleString('es-DO'))}</p>
        <label>Efectivo contado (RD$)<input name="declared" type="number" min="0" max="99999999.99" step="0.01" required></label>
        <p data-cash-difference class="form-hint" aria-live="polite"></p>
        <label>Notas del cierre (opcional)<textarea name="cash_notes" maxlength="500" rows="2" placeholder="Observaciones del arqueo"></textarea></label>
      </div>
      <div data-cash-view="z" hidden></div>`,
      onConfirm: async (data, form) => {
        const declared = String(data.get('declared') || '').trim();
        if (!declared) throw new Error('Indica el efectivo declarado.');
        const result = await closeCashSession({ sessionId: cash.id, declared: Number(declared), notes: data.get('cash_notes') });
        try {
          await reload();
        } catch (error) {
          showToast(`Cierre registrado, pero no se pudo actualizar la vista: ${error.message}`, 'warning');
        }
        showToast('Cierre de caja registrado', 'success');
        setTimeout(() => renderClosedCashState(form, result), 0);
        return false;
      },
    });
    const form = document.querySelector('#modal-root form');
    if (form) bindDifference(form, summary.esperado);
  } catch (error) {
    toastError(error);
  }
}

function openMovementModal(cash) {
  openModal({
    title: 'Movimiento de caja',
    confirmLabel: 'Registrar',
    description: 'Registra una entrada, un retiro o un gasto pagado con efectivo de esta caja.',
    body: `<label>Tipo<select name="movement_type">
        <option value="entrada">Entrada de efectivo</option>
        <option value="retiro">Retiro de efectivo</option>
        <option value="gasto">Gasto pagado de caja</option>
      </select></label>
      <label data-cash-category hidden>Categoría del gasto<select name="category">${EXPENSE_CATEGORIES.map(item => `<option>${escapeHtml(item)}</option>`).join('')}</select></label>
      <label>Monto (RD$)<input name="movement_amount" type="number" min="0.01" max="99999999.99" step="0.01" required></label>
      <label data-cash-concept-label>Concepto<textarea name="movement_concept" maxlength="200" rows="2" required placeholder="Ej. Cambio adicional para caja"></textarea></label>`,
    onConfirm: async data => {
      const type = String(data.get('movement_type') || 'entrada');
      const amount = Number(data.get('movement_amount'));
      const concept = String(data.get('movement_concept') || '').trim();
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Indica un monto mayor que cero.');
      if (!concept) throw new Error('Indica el concepto del movimiento.');
      if (type === 'gasto') {
        await registerCashExpense({ category: String(data.get('category') || 'Otros'), amount, description: concept });
      } else {
        await registerCashMovement({ type, amount, concept });
      }
      await reload();
      showToast(type === 'gasto' ? 'Gasto registrado en la caja' : 'Movimiento registrado en la caja', 'success');
    },
  });
  const form = document.querySelector('#modal-root form');
  if (!form) return;
  const typeField = form.querySelector('[name="movement_type"]');
  const categoryField = form.querySelector('[data-cash-category]');
  const conceptLabel = form.querySelector('[data-cash-concept-label]');
  const update = () => {
    const isExpense = typeField.value === 'gasto';
    categoryField.hidden = !isExpense;
    conceptLabel.firstChild.textContent = isExpense ? 'Descripción del gasto' : 'Concepto';
  };
  typeField.addEventListener('change', update);
  update();
}

export function bindCashSession(root) {
  root.querySelector('[data-action="refresh-cash"]')?.addEventListener('click', async () => {
    try { await refreshCashSessions(); await reload(); showToast('Caja actualizada', 'success'); }
    catch (error) { toastError(error); }
  });
  root.querySelector('[data-action="cash-movement"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (!cash) {
      showToast('Abre tu caja antes de registrar movimientos.', 'warning');
      return;
    }
    openMovementModal(cash);
  });
  root.querySelector('[data-action="close-cash"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (cash) openCashModal(cash);
    else showToast('No hay una caja abierta para cerrar.', 'warning');
  });
  root.querySelector('[data-action="open-cash"]')?.addEventListener('click', () => {
    const operationId = uid();
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
