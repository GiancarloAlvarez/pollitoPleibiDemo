import { money, compactMoney } from './utils.js';

const instances = new Set();

function cssVar(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

function palette() {
  return {
    primary: cssVar('--primary', '#fbb017'),
    primarySoft: '#ffd75b',
    info: cssVar('--info', '#3e7bd9'),
    success: cssVar('--success', '#2e9e6b'),
    muted: cssVar('--muted', '#5b6082'),
    border: cssVar('--border', '#eee3ca'),
    surface: cssVar('--surface', '#ffffff'),
    text: cssVar('--text', '#1f2447'),
  };
}

export function destroyCharts() {
  for (const chart of instances) {
    try {
      chart.destroy();
    } catch (error) {
      continue;
    }
  }
  instances.clear();
}

export function createSalesChart(canvas, series) {
  if (!canvas || !window.Chart) return null;
  const colors = palette();
  const existing = window.Chart.getChart(canvas);
  if (existing) existing.destroy();
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Ventas',
        data: series.values,
        backgroundColor: colors.primary,
        hoverBackgroundColor: colors.primarySoft,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 30,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.text,
          titleColor: colors.surface,
          bodyColor: colors.surface,
          padding: 10,
          displayColors: false,
          callbacks: { label: ctx => money(ctx.parsed.y) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.muted, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.border, drawTicks: false },
          border: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 9 },
            padding: 6,
            callback: value => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value))),
          },
        },
      },
    },
  });
  instances.add(chart);
  return chart;
}

export function createPaymentsChart(canvas, rows) {
  if (!canvas || !window.Chart) return null;
  const colors = palette();
  const existing = window.Chart.getChart(canvas);
  if (existing) existing.destroy();
  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(row => row.method),
      datasets: [{
        data: rows.map(row => row.amount),
        backgroundColor: rows.map(row => row.color),
        borderColor: colors.surface,
        borderWidth: 3,
        hoverOffset: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.text,
          titleColor: colors.surface,
          bodyColor: colors.surface,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: ctx => `${money(ctx.parsed)}`,
          },
        },
      },
    },
  });
  instances.add(chart);
  return chart;
}

export function chartFallback(series) {
  const max = Math.max(...series.values, 1);
  return `<div class="chart-wrap" style="display:flex;align-items:flex-end;gap:10px;padding:10px 0">
    ${series.values.map((value, index) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;height:100%"><div style="width:100%;max-width:26px;height:${Math.max(4, (value / max) * 135)}px;background:var(--primary);border-radius:5px 5px 0 0"></div><small style="font-size:9px;color:var(--muted)">${series.labels[index]}</small></div>`).join('')}
  </div>`;
}

export { compactMoney, money };
