import { icon } from '../components/icons.js';
import { escapeHtml, money, percentChange, formatPercent, formatDateTime } from '../core/utils.js';
import { state, setFilter, store } from '../core/state.js';
import { periodRange, filterPaidOrders, metrics } from '../core/analytics.js';
import { exportReport } from '../core/excel.js';
import { openModal } from '../components/modal.js';
import { showToast, toastError } from '../components/toast.js';

const PERIODS = [
  ['today', 'Hoy'],
  ['yesterday', 'Ayer'],
  ['week', 'Esta semana'],
  ['month', 'Este mes'],
  ['custom', 'Rango personalizado'],
];

const REPORTS = [
  ['Ventas y órdenes', 'sales'],
  ['Productos más vendidos', 'top'],
  ['Inventario y movimientos', 'inventory'],
  ['Compras y entradas', 'movements'],
  ['Gastos y mermas', 'movements'],
  ['Vendedores y métodos de pago', 'payments'],
];

function safeRange() {
  try {
    return periodRange(state.filters.reportPeriod, state.filters.reportFrom, state.filters.reportTo);
  } catch (error) {
    return periodRange('today');
  }
}

function reportContext(orders, range) {
  return {
    orders,
    products: state.products,
    inventory: state.inventory,
    movements: state.movements.filter(movement => {
      const time = new Date(movement.created_at).getTime();
      return time >= range.from.getTime() && time <= range.to.getTime();
    }),
    users: state.users,
    suppliers: state.suppliers,
    settings: state.settings,
    range,
  };
}

export function renderReports() {
  const range = safeRange();
  const orders = filterPaidOrders(state.orders, range.from, range.to);
  const previous = filterPaidOrders(state.orders, range.previousFrom, range.previousTo);
  const current = metrics(orders);
  const prev = metrics(previous);
  const salesTrend = percentChange(current.sales, prev.sales);
  const ordersTrend = percentChange(current.count, prev.count);
  const updatedAt = new Date();
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">ANÁLISIS Y RESULTADOS</p>
      <h1>Reportes</h1>
      <p class="muted">Información para tomar mejores decisiones.</p>
    </div>
    <button class="primary-btn" data-action="export-all">${icon('file-bar-chart', 17)} Exportar a Excel</button>
  </div>
  <div class="report-tabs">
    ${PERIODS.map(([value, label]) => `<button class="${state.filters.reportPeriod === value ? 'selected' : ''}" data-period="${value}">${label}</button>`).join('')}
  </div>
  <div class="report-grid">
    <div class="report-card">
      <span class="stat-icon yellow">${icon('circle-dollar-sign', 18)}</span>
      <p>Ventas netas</p><strong>${money(current.sales)}</strong>
      <small class="${salesTrend >= 0 ? 'positive' : ''}">${icon(salesTrend >= 0 ? 'arrow-up-right' : 'arrow-down-right', 13)} ${formatPercent(salesTrend)} vs. período anterior</small>
    </div>
    <div class="report-card">
      <span class="stat-icon blue">${icon('clipboard-list', 18)}</span>
      <p>Órdenes</p><strong>${current.count}</strong>
      <small class="${ordersTrend >= 0 ? 'positive' : ''}">${icon(ordersTrend >= 0 ? 'arrow-up-right' : 'arrow-down-right', 13)} ${formatPercent(ordersTrend)} vs. período anterior</small>
    </div>
    <div class="report-card">
      <span class="stat-icon green">${icon('bar-chart-3', 18)}</span>
      <p>Utilidad estimada</p><strong>${money(current.profit)}</strong>
      <small>Margen del ${current.margin.toFixed(1)}%</small>
    </div>
  </div>
  <section class="panel report-list">
    <div class="panel-heading"><div><h3>Reportes disponibles</h3><p>Genera vistas detalladas por área · ${escapeHtml(range.label)}</p></div></div>
    ${REPORTS.map(([label, type], index) => `<div class="report-row">
      <div class="report-row-icon c${index}">${icon('file-bar-chart', 17)}</div>
      <span><b>${escapeHtml(label)}</b><small>Última actualización: ${formatDateTime(updatedAt)}</small></span>
      <button class="secondary-btn" data-report="${type}">Ver reporte ${icon('chevron-right', 15)}</button>
    </div>`).join('')}
  </section>`;
}

function openCustomRange() {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    eyebrow: 'ANÁLISIS Y RESULTADOS',
    title: 'Rango personalizado',
    description: 'Selecciona el período que quieres analizar.',
    body: `<div class="form-grid">
      <label>Desde<input type="date" name="from" value="${escapeHtml(state.filters.reportFrom || today)}" required></label>
      <label>Hasta<input type="date" name="to" value="${escapeHtml(state.filters.reportTo || today)}" required></label>
    </div>`,
    confirmLabel: 'Aplicar rango',
    onConfirm: data => {
      const from = String(data.get('from') || '');
      const to = String(data.get('to') || '');
      try {
        periodRange('custom', from, to);
      } catch (error) {
        throw new Error(error.message);
      }
      state.filters = { ...state.filters, reportPeriod: 'custom', reportFrom: from, reportTo: to };
      store.setState({ filters: state.filters });
      showToast('Rango aplicado correctamente', 'success');
    },
  });
}

export function bindReports(root) {
  root.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      const period = button.getAttribute('data-period');
      if (period === 'custom') {
        openCustomRange();
        return;
      }
      setFilter('reportPeriod', period);
    });
  });

  const range = safeRange();
  const orders = filterPaidOrders(state.orders, range.from, range.to);
  const context = reportContext(orders, range);

  root.querySelector('[data-action="export-all"]')?.addEventListener('click', () => {
    try {
      const result = exportReport('all', context);
      showToast(`Reporte exportado: ${result.filename}`, 'success', 3200);
    } catch (error) {
      toastError(error);
    }
  });

  root.querySelectorAll('[data-report]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.getAttribute('data-report');
      try {
        const result = exportReport(type, context);
        showToast(`Reporte exportado: ${result.filename}`, 'success', 3200);
      } catch (error) {
        toastError(error);
      }
    });
  });
}
