import {
  money, round2, formatDateTime, downloadBlob,
} from './utils.js';
import {
  metrics, topProducts, paymentDistribution, inventoryValue,
} from './analytics.js';
import { requireRole } from './permissions.js';

const XLSX = typeof window !== 'undefined' ? window.XLSX : null;

function rowsToSheet(XLSXLib, rows) {
  if (!rows.length) return XLSXLib.utils.aoa_to_sheet([['Sin datos disponibles']]);
  return XLSXLib.utils.json_to_sheet(rows);
}

function setWidths(sheet, widths) {
  sheet['!cols'] = widths.map(width => ({ wch: width }));
}

function baseContext(context) {
  return {
    orders: [],
    products: [],
    inventory: [],
    movements: [],
    users: [],
    suppliers: [],
    settings: {},
    range: null,
    ...context,
  };
}

function summaryRows(context, type) {
  const data = metrics(context.orders);
  return [
    { Campo: 'Negocio', Valor: context.settings.business_name || 'Pollito Pleibi' },
    { Campo: 'RNC', Valor: context.settings.rnc || '' },
    { Campo: 'Dirección', Valor: context.settings.address || '' },
    { Campo: 'Reporte', Valor: type },
    { Campo: 'Período', Valor: context.range ? context.range.label : 'General' },
    { Campo: 'Desde', Valor: context.range ? formatDateTime(context.range.from) : '' },
    { Campo: 'Hasta', Valor: context.range ? formatDateTime(context.range.to) : '' },
    { Campo: 'Generado', Valor: formatDateTime(new Date()) },
    { Campo: 'Ventas netas', Valor: money(data.sales) },
    { Campo: 'Órdenes', Valor: data.count },
    { Campo: 'Ticket promedio', Valor: money(data.ticket) },
    { Campo: 'Productos vendidos', Valor: data.units },
    { Campo: 'Utilidad estimada', Valor: money(data.profit) },
    { Campo: 'Margen', Valor: `${data.margin.toFixed(1)}%` },
    { Campo: 'Valor del inventario', Valor: money(inventoryValue(context.inventory)) },
  ];
}

function salesRows(orders) {
  return orders.map(order => ({
    Orden: order.code,
    Fecha: formatDateTime(order.created_at),
    Cliente: order.customer,
    Canal: order.channel || '',
    Vendedor: order.seller_name || 'Sin atribución histórica',
    Caja: order.cash_session_id || order.local_cash_session_id || '',
    'Método de pago': order.payment_method,
    Estado: order.status,
    Productos: order.items_text,
    Subtotal: order.subtotal,
    ITBIS: order.tax,
    Total: order.total,
    Pagada: order.paid ? 'Sí' : 'No',
  }));
}

function productRows(products) {
  return products.map(product => ({
    Producto: product.name,
    Categoría: product.category,
    Precio: product.price,
    'Costo estimado': product.cost,
    'Margen estimado': round2(product.price - product.cost),
    Estado: product.available ? 'Disponible' : 'No disponible',
  }));
}

function inventoryRows(inventory) {
  return inventory.map(item => ({
    Insumo: item.name,
    Categoría: item.category,
    Existencia: item.stock,
    Unidad: item.unit,
    'Stock mínimo': item.min,
    'Costo unitario': item.unit_cost,
    Valor: round2((Number(item.stock) || 0) * (Number(item.unit_cost) || 0)),
    Estado: Number(item.stock) < Number(item.min) ? 'Stock bajo' : 'En buen nivel',
  }));
}

function movementRows(movements, suppliers) {
  return movements.map(movement => {
    const supplier = suppliers.find(row => row.id === movement.supplier_id);
    return {
      Fecha: formatDateTime(movement.created_at),
      Tipo: movement.type,
      Insumo: movement.item_name,
      Cantidad: movement.quantity,
      Unidad: movement.unit,
      'Costo unitario': movement.unit_cost,
      Total: movement.total,
      Proveedor: supplier ? supplier.name : '',
      Usuario: movement.user_name,
      Nota: movement.note,
    };
  });
}

function userRows(users) {
  return users.map(user => ({
    Nombre: user.name,
    Correo: user.email,
    Rol: user.role_name || user.role,
    Estado: user.active ? 'Activo' : 'Inactivo',
    'Último acceso': user.last_access ? formatDateTime(user.last_access) : 'Nunca',
  }));
}

function supplierRows(suppliers) {
  return suppliers.map(supplier => ({
    Proveedor: supplier.name,
    Contacto: supplier.contact,
    Teléfono: supplier.phone,
    Correo: supplier.email,
    Notas: supplier.notes,
    Estado: supplier.active ? 'Activo' : 'Inactivo',
  }));
}

function topRows(orders) {
  return topProducts(orders, 50).map(row => ({
    Producto: row.name,
    'Unidades vendidas': row.qty,
    'Venta total': row.total,
  }));
}

function paymentRows(orders) {
  return paymentDistribution(orders).rows.map(row => ({
    'Método de pago': row.method,
    Monto: row.amount,
    Porcentaje: `${row.percent.toFixed(1)}%`,
  }));
}

function sheetFor(type, context) {
  switch (type) {
    case 'sales': return ['Ventas', salesRows(context.orders)];
    case 'products': return ['Productos', productRows(context.products)];
    case 'inventory': return ['Inventario', inventoryRows(context.inventory)];
    case 'movements': return ['Movimientos', movementRows(context.movements, context.suppliers)];
    case 'suppliers': return ['Proveedores', supplierRows(context.suppliers)];
    case 'users': return ['Usuarios', userRows(context.users)];
    case 'top': return ['Productos más vendidos', topRows(context.orders)];
    case 'payments': return ['Métodos de pago', paymentRows(context.orders)];
    default: return null;
  }
}

export function exportReport(type = 'all', rawContext = {}) {
  requireRole();
  const context = baseContext(rawContext);
  const filename = `Pollito-Pleibi-${type === 'all' ? 'Reporte-Completo' : type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (!XLSX || !XLSX.utils) {
    const rows = salesRows(context.orders);
    if (!rows.length) throw new Error('No hay datos para exportar en este período.');
    const header = Object.keys(rows[0]);
    const csv = [header.join(','), ...rows.map(row => header.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename.replace('.xlsx', '.csv'));
    return { filename: filename.replace('.xlsx', '.csv'), csv: true };
  }
  const workbook = XLSX.utils.book_new();
  const summary = rowsToSheet(XLSX, summaryRows(context, type));
  setWidths(summary, [26, 42]);
  XLSX.utils.book_append_sheet(workbook, summary, 'Resumen');

  const single = sheetFor(type, context);
  if (single) {
    const sheet = rowsToSheet(XLSX, single[1]);
    setWidths(sheet, single[0] === 'Ventas' ? [12, 20, 28, 16, 16, 12, 50, 12, 10, 12, 10] : [26, 22, 16, 14, 16, 18, 16, 16, 20, 24]);
    XLSX.utils.book_append_sheet(workbook, sheet, single[0]);
  } else {
    const sheets = [
      ['Ventas', salesRows(context.orders), [12, 20, 28, 16, 16, 12, 50, 12, 10, 12, 10]],
      ['Productos', productRows(context.products), [30, 22, 14, 16, 16, 18]],
      ['Inventario', inventoryRows(context.inventory), [26, 20, 14, 10, 14, 16, 14, 16]],
      ['Movimientos', movementRows(context.movements, context.suppliers), [20, 12, 26, 12, 10, 16, 14, 26, 22, 34]],
      ['Productos más vendidos', topRows(context.orders), [30, 20, 14]],
      ['Métodos de pago', paymentRows(context.orders), [22, 16, 14]],
      ['Usuarios', userRows(context.users), [26, 34, 24, 12, 20]],
      ['Proveedores', supplierRows(context.suppliers), [30, 24, 16, 30, 40, 12]],
    ];
    for (const [name, rows, widths] of sheets) {
      const sheet = rowsToSheet(XLSX, rows);
      setWidths(sheet, widths);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
  }
  XLSX.writeFile(workbook, filename, { compression: true });
  return { filename, csv: false };
}
