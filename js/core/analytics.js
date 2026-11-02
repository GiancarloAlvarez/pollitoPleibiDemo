import {
  addDays, startOfDay, endOfDay, startOfWeek, startOfMonth, dateKey, round2, sum,
} from './utils.js';

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const PAYMENT_COLORS = {
  Efectivo: '#fbb017',
  Tarjeta: '#3e7bd9',
  Transferencia: '#2e9e6b',
};

export function periodRange(period = 'today', fromValue = '', toValue = '') {
  const now = new Date();
  if (period === 'yesterday') {
    const from = startOfDay(addDays(now, -1));
    const to = endOfDay(addDays(now, -1));
    return {
      from, to, label: 'Ayer',
      previousFrom: startOfDay(addDays(now, -2)),
      previousTo: endOfDay(addDays(now, -2)),
    };
  }
  if (period === 'week') {
    const from = startOfWeek(now);
    return {
      from, to: now, label: 'Esta semana',
      previousFrom: addDays(from, -7),
      previousTo: new Date(from.getTime() - 1),
    };
  }
  if (period === 'month') {
    const from = startOfMonth(now);
    const previousStart = startOfMonth(addDays(from, -1));
    return {
      from, to: now, label: 'Este mes',
      previousFrom: previousStart,
      previousTo: new Date(from.getTime() - 1),
    };
  }
  if (period === 'custom' && fromValue && toValue) {
    const from = startOfDay(new Date(`${fromValue}T00:00:00`));
    const to = endOfDay(new Date(`${toValue}T00:00:00`));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new Error('El rango de fechas no es válido.');
    }
    const duration = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - duration);
    return { from, to, label: 'Rango personalizado', previousFrom, previousTo };
  }
  return {
    from: startOfDay(now), to: now, label: 'Hoy',
    previousFrom: startOfDay(addDays(now, -1)),
    previousTo: endOfDay(addDays(now, -1)),
  };
}

export function filterPaidOrders(orders, from, to) {
  const start = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const end = to instanceof Date ? to.getTime() : new Date(to).getTime();
  return (orders || []).filter(order => {
    if (!order.paid) return false;
    const time = new Date(order.created_at).getTime();
    return time >= start && time <= end;
  });
}

export function metrics(orders) {
  const sales = round2(sum((orders || []).map(order => order.total)));
  const count = (orders || []).length;
  const units = sum((orders || []).flatMap(order => (order.items || []).map(item => Number(item.qty) || 0)));
  const profit = round2(sum((orders || []).flatMap(order => (order.items || []).map(item => (Number(item.price) - Number(item.cost)) * (Number(item.qty) || 0)))));
  return {
    sales,
    count,
    units,
    profit,
    ticket: count ? round2(sales / count) : 0,
    margin: sales ? round2((profit / sales) * 100) : 0,
  };
}

export function salesSeries(orders, days = 7) {
  const today = startOfDay(new Date());
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(dateKey(addDays(today, -i)));
  const buckets = Object.fromEntries(keys.map(key => [key, 0]));
  for (const order of orders || []) {
    if (!order.paid) continue;
    const key = dateKey(order.created_at);
    if (key in buckets) buckets[key] += Number(order.total) || 0;
  }
  return {
    labels: keys.map(key => WEEKDAY_LABELS[new Date(`${key}T12:00:00`).getDay()]),
    values: keys.map(key => round2(buckets[key])),
    total: round2(sum(Object.values(buckets))),
  };
}

export function paymentDistribution(orders) {
  const totals = { Efectivo: 0, Tarjeta: 0, Transferencia: 0 };
  for (const order of orders || []) {
    const method = order.payment_method || 'Efectivo';
    if (method in totals) totals[method] += Number(order.total) || 0;
    else totals.Efectivo += Number(order.total) || 0;
  }
  const total = round2(sum(Object.values(totals)));
  return {
    total,
    rows: Object.entries(totals).map(([method, amount]) => ({
      method,
      amount: round2(amount),
      percent: total ? round2((amount / total) * 100) : 0,
      color: PAYMENT_COLORS[method],
    })),
  };
}

export function topProducts(orders, limit = 5) {
  const map = new Map();
  for (const order of orders || []) {
    for (const item of order.items || []) {
      const key = item.name || 'Producto';
      const current = map.get(key) || { name: key, qty: 0, total: 0 };
      current.qty += Number(item.qty) || 0;
      current.total = round2(current.total + (Number(item.price) || 0) * (Number(item.qty) || 0));
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function inventoryValue(items) {
  return round2(sum((items || []).map(item => (Number(item.stock) || 0) * (Number(item.unit_cost) || 0))));
}

export function lowStockItems(items) {
  return (items || [])
    .filter(item => Number(item.stock) < Number(item.min))
    .sort((a, b) => (Number(a.stock) / (Number(a.min) || 1)) - (Number(b.stock) / (Number(b.min) || 1)));
}

export function kitchenOrders(orders) {
  const start = startOfDay(new Date()).getTime();
  return (orders || [])
    .filter(order => new Date(order.created_at).getTime() >= start)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function todayMetrics(orders) {
  const now = new Date();
  return metrics(filterPaidOrders(orders, startOfDay(now), now));
}

export function yesterdayMetrics(orders) {
  return metrics(filterPaidOrders(orders, startOfDay(addDays(new Date(), -1)), endOfDay(addDays(new Date(), -1))));
}

export { WEEKDAY_LABELS, PAYMENT_COLORS };
