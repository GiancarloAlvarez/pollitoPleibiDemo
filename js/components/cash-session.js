import { openModal } from './modal.js';
import {
  openCashSession, currentCashSession, refreshCashSessions, cashSummary,
  closeCashSession, registerCashMovement, registerCashExpense,
} from '../core/cash.js';
import { showCashClose } from './receipt.js';
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
    <button class="secondary-btn" data-action="open-cash">${cash ? 'Consultar caja' : 'Abrir caja'}</button>
    ${cash ? `
      <button class="secondary-btn" data-action="cash-movement">Movimiento</button>
      <button class="primary-btn" data-action="close-cash">Cerrar caja</button>
    ` : ''}
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
    if (!Number.isFinite(value)) {
      output.textContent = 'Diferencia: indica un monto válido.';
      return;
    }
    const difference = round2(value - Number(expected || 0));
    output.textContent = difference === 0 ? 'Diferencia: RD$ 0.00 · cuadra' : `Diferencia: ${money(difference)}`;
    output.classList.toggle('danger-text', difference !== 0);
  };
  declared.addEventListener('input', update);
  update();
}

async function openArqueoModal(cash) {
  try {
    const summary = await cashSummary(cash);
    openModal({
      title: cash.demo ? 'Arqueo de caja demo' : 'Arqueo de caja',
      confirmLabel: 'Entendido',
      description: 'Vista previa del efectivo esperado. Aún no cierra la sesión.',
      body: `${arqueoMarkup(summary)}
        <p>Responsable: ${escapeHtml(state.user.name)}<br>
          Apertura: ${escapeHtml(new Date(summary.fecha_apertura || cash.fecha_apertura).toLocaleString('es-DO'))}</p>`,
    });
  } catch (error) {
    toastError(error);
  }
}

async function openCloseModal(cash) {
  try {
    const summary = await cashSummary(cash);
    openModal({
      title: 'Cerrar caja',
      confirmLabel: 'Confirmar cierre',
      danger: true,
      description: 'Cuenta el efectivo físico e indica el monto declarado. El cierre queda registrado y no se edita.',
      body: `${arqueoMarkup(summary)}
        <label>Efectivo declarado (RD$)<input name="declared" type="number" min="0" max="99999999.99" step="0.01" value="${Number(summary.esperado) || 0}" required></label>
        <p data-cash-difference class="form-hint" aria-live="polite"></p>
        <label>Notas del cierre (opcional)<textarea name="cash_notes" maxlength="500" rows="2" placeholder="Observaciones del arqueo"></textarea></label>`,
      onConfirm: async data => {
        const declared = String(data.get('declared') || '').trim();
        if (!declared) throw new Error('Indica el efectivo declarado.');
        const result = await closeCashSession({ declared: Number(declared), notes: data.get('cash_notes') });
        await reload();
        showToast('Cierre de caja registrado', 'success');
        setTimeout(() => {
          showCashClose(result.row, result.summary, state.settings, state.user?.name);
        }, 40);
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
  root.querySelector('[data-action="close-cash"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (!cash) {
      showToast('No hay una caja abierta para cerrar.', 'warning');
      return;
    }
    openCloseModal(cash);
  });
  root.querySelector('[data-action="cash-movement"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (!cash) {
      showToast('Abre tu caja antes de registrar movimientos.', 'warning');
      return;
    }
    openMovementModal(cash);
  });
  root.querySelector('[data-action="open-cash"]')?.addEventListener('click', () => {
    const cash = currentCashSession();
    if (cash) {
      openArqueoModal(cash);
      return;
    }
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
