import { icon } from '../components/icons.js';
import {
  money, formatDateLong, relativeTime, percentChange, formatPercent, escapeHtml,
} from '../core/utils.js';
import {
  metrics, filterPaidOrders, yesterdayMetrics, salesSeries, paymentDistribution, lowStockItems,
} from '../core/analytics.js';
import { state } from '../core/state.js';
import { createSalesChart, createPaymentsChart, destroyCharts } from '../core/charts.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName() {
  return state.user ? String(state.user.name || '').split(' ')[0] : 'Carlos';
}

function trendSpan(value) {
  const positive = Number(value) >= 0;
  return `<span class="trend">${icon(positive ? 'arrow-up-right' : 'arrow-down-right', 13)} ${formatPercent(value)}</span>`;
}

function statCard({ iconName, label, value, trend, hint, color }) {
  return `<div class="stat-card">
    <div class="stat-icon ${color}">${icon(iconName, 18)}</div>
    <div class="stat-label">${label}${trend == null ? '' : trendSpan(trend)}</div>
    <strong>${value}</strong>
    <small>${hint}</small>
  </div>`;
}

function statusBadge(status) {
  const cls = ['Nueva', 'Preparando', 'Lista', 'Entregada', 'Anulada'].includes(status) ? status.toLowerCase() : 'nueva';
  return `<span class="status ${cls}"><i></i>${escapeHtml(status)}</span>`;
}

function orderRow(order) {
  const iconClass = order.status === 'Nueva' ? 'new' : order.status === 'Preparando' ? 'prep' : 'ready';
  return `<div class="order-row">
    <div class="order-icon ${iconClass}">${icon('clipboard-list', 17)}</div>
    <div class="order-info">
      <b>${escapeHtml(order.code)} <span>${escapeHtml(order.customer)}</span></b>
      <small>${escapeHtml(order.items_text)}</small>
    </div>
    <div class="order-time">${icon('clock-3', 13)} ${relativeTime(order.created_at)}</div>
    ${statusBadge(order.status)}
  </div>`;
}

function stockRow(item) {
  return `<div class="stock-row">
    <div class="stock-icon">${icon('package', 16)}</div>
    <div><b>${escapeHtml(item.name)}</b><small>Stock mínimo: ${escapeHtml(item.min)} ${escapeHtml(item.unit)}</small></div>
    <strong>${escapeHtml(item.stock)} ${escapeHtml(item.unit)}</strong>
    <span class="warning-dot">${icon('bell', 12)}</span>
  </div>`;
}

export function renderDashboard() {
  const now = new Date();
  const todayOrders = filterPaidOrders(state.orders, new Date(new Date().setHours(0, 0, 0, 0)), now);
  const today = metrics(todayOrders);
  const yesterday = yesterdayMetrics(state.orders);
  const series = salesSeries(state.orders, 7);
  const weekAgo = Date.now() - 7 * 86400000;
  const previousWeek = state.orders.filter(order => order.paid && new Date(order.created_at).getTime() < weekAgo && new Date(order.created_at).getTime() >= weekAgo - 7 * 86400000);
  const previousWeekSales = metrics(previousWeek).sales;
  const payments = paymentDistribution(todayOrders.length ? todayOrders : filterPaidOrders(state.orders, new Date(weekAgo), now));
  const alerts = lowStockItems(state.inventory).slice(0, 3);
  const recent = state.orders.slice(0, 3);

  return `<div class="welcome-row">
    <div>
      <p class="eyebrow">${formatDateLong(now)}</p>
      <h1>${greeting()}, ${escapeHtml(firstName())} <span>👋</span></h1>
      <p class="muted">Aquí tienes el resumen de tu operación hoy.</p>
    </div>
    <button class="secondary-btn" data-nav="reportes">${icon('calendar-days', 17)} Este mes ${icon('chevron-down', 15)}</button>
  </div>
  <div class="stat-grid">
    ${statCard({ iconName: 'circle-dollar-sign', label: 'Ventas de hoy', value: money(today.sales), trend: percentChange(today.sales, yesterday.sales), hint: 'vs. ayer', color: 'yellow' })}
    ${statCard({ iconName: 'clipboard-list', label: 'Órdenes hoy', value: String(today.count), trend: percentChange(today.count, yesterday.count), hint: 'vs. ayer', color: 'blue' })}
    ${statCard({ iconName: 'wallet-cards', label: 'Ticket promedio', value: money(today.ticket), trend: percentChange(today.ticket, yesterday.ticket), hint: 'vs. semana pasada', color: 'green' })}
    ${statCard({ iconName: 'flame', label: 'Productos vendidos', value: String(today.units), trend: percentChange(today.units, yesterday.units), hint: 'vs. ayer', color: 'coral' })}
  </div>
  <div class="content-grid">
    <section class="panel sales-panel">
      <div class="panel-heading">
        <div><h3>Rendimiento de ventas</h3><p>Ventas netas de los últimos 7 días</p></div>
        <div class="table-actions">
          <button class="dots-btn" data-menu-toggle="menu-sales" aria-label="Más opciones">${icon('more-horizontal', 20)}</button>
          <div class="action-menu" id="menu-sales">
            <button data-nav="reportes">${icon('file-bar-chart', 15)} Ver reportes</button>
            <button data-action="refresh-dashboard">${icon('refresh-cw', 15)} Actualizar datos</button>
          </div>
        </div>
      </div>
      <div class="chart-legend">
        <span><i class="legend-yellow"></i> Ventas</span>
        <strong>${money(series.total)} <small>${formatPercent(percentChange(series.total, previousWeekSales))}</small></strong>
      </div>
      <div class="chart-wrap"><canvas id="sales-chart" aria-label="Gráfico de ventas de los últimos 7 días" role="img"></canvas></div>
    </section>
    <section class="panel payments-panel">
      <div class="panel-heading">
        <div><h3>Métodos de pago</h3><p>Distribución de ventas</p></div>
        <div class="table-actions">
          <button class="dots-btn" data-menu-toggle="menu-payments" aria-label="Más opciones">${icon('more-horizontal', 20)}</button>
          <div class="action-menu" id="menu-payments">
            <button data-nav="reportes">${icon('file-bar-chart', 15)} Ver reportes</button>
            <button data-action="export-payments">${icon('download', 15)} Exportar métodos</button>
          </div>
        </div>
      </div>
      <div class="donut-wrap">
        <div class="donut-canvas">
          <canvas id="payments-chart" aria-label="Distribución por método de pago" role="img"></canvas>
          <div class="donut-center"><strong>${today.count}</strong><small>órdenes</small></div>
        </div>
        <div class="payment-list">
          ${payments.rows.map(row => `<span><i class="dot" style="background:${row.color}"></i> ${row.method} <b>${row.percent.toFixed(0)}%</b></span>`).join('')}
        </div>
      </div>
    </section>
  </div>
  <div class="content-grid lower">
    <section class="panel">
      <div class="panel-heading">
        <div><h3>Órdenes recientes</h3><p>Actividad de tu equipo en tiempo real</p></div>
        <button class="link-btn" data-nav="cocina">Ver todas ${icon('chevron-right', 15)}</button>
      </div>
      <div class="order-list">${recent.length ? recent.map(orderRow).join('') : '<div class="table-empty">Todavía no hay órdenes registradas.</div>'}</div>
    </section>
    <section class="panel stock-panel">
      <div class="panel-heading">
        <div><h3>Alertas de inventario</h3><p>Requieren tu atención</p></div>
        <button class="link-btn" data-nav="inventario">Ver inventario ${icon('chevron-right', 15)}</button>
      </div>
      ${alerts.length ? alerts.map(stockRow).join('') : '<div class="table-empty">Todo el inventario está en buen nivel.</div>'}
    </section>
  </div>`;
}

export function bindDashboard(root) {
  destroyCharts();
  const series = salesSeries(state.orders, 7);
  const now = new Date();
  const todayOrders = filterPaidOrders(state.orders, new Date(new Date().setHours(0, 0, 0, 0)), now);
  const payments = paymentDistribution(todayOrders.length ? todayOrders : state.orders.filter(order => order.paid));
  const salesCanvas = root.querySelector('#sales-chart');
  const paymentsCanvas = root.querySelector('#payments-chart');
  if (salesCanvas && window.Chart) createSalesChart(salesCanvas, series);
  if (paymentsCanvas && window.Chart) createPaymentsChart(paymentsCanvas, payments.rows);
  if (salesCanvas && !window.Chart) {
    salesCanvas.parentElement.outerHTML = `<div class="fake-chart"><div class="bars">${series.values.map((value, i) => `<div class="bar-col"><div class="bar" style="height:${Math.max(4, (value / Math.max(...series.values, 1)) * 100)}%"></div><small>${series.labels[i]}</small></div>`).join('')}</div></div>`;
  }
}
