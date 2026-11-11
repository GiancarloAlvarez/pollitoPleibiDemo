import { round2 } from './utils.js';

const ESTADOS = {
  Nueva: 'nueva', Preparando: 'preparando', Lista: 'lista', Entregada: 'entregada', Anulada: 'anulada',
};
const ESTADOS_REVERSE = {
  nueva: 'Nueva', preparando: 'Preparando', lista: 'Lista', entregada: 'Entregada', anulada: 'Anulada',
};
const CANALES = ['Mostrador', 'Para llevar', 'Delivery'];
const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'];
const TIPOS_MOV = {
  entrada: 'entrada', salida: 'consumo_venta', merma: 'merma', desperdicio: 'desperdicio',
  ajuste: 'ajuste', devolucion: 'devolucion', consumo: 'consumo_interno',
};

function hex(value, length = 8) {
  return String(value || '').replace(/[^0-9a-fA-F]/g, '').slice(-length).toUpperCase();
}

export function toRemoteCode(id) {
  return `APP-${hex(id) || '00000000'}`;
}

function mapCanal(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('delivery')) return 'Delivery';
  if (text.includes('llevar')) return 'Para llevar';
  return 'Mostrador';
}

function mapMetodo(value) {
  const key = String(value || '').toLowerCase();
  return METODOS.includes(key) ? key : null;
}

function mapRol(value) {
  return value === 'cocina' ? 'cocinero' : (value || 'cajero');
}

function rolName(role) {
  if (role === 'admin') return 'Dueño / Administrador';
  if (role === 'cocina') return 'Cocinero';
  return 'Vendedor / Cajero';
}

function orderNumber(code) {
  const match = String(code || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function detailSlot(orderId, index) {
  return `${String(orderId).slice(0, -4)}${String(index).padStart(4, '0')}`;
}

export const REMOTE_TABLES = {
  products: 'productos',
  orders: 'ordenes',
  order_details: 'orden_detalles',
  payments: 'pagos',
  inventory: 'inventario',
  users: 'perfiles',
  suppliers: 'proveedores',
  movements: 'inventario_movimientos',
  settings: 'configuracion',
};

export function toRemote(table, row, ctx = {}) {
  switch (table) {
    case 'products':
      return {
        id: row.id,
        codigo: row.codigo || toRemoteCode(row.id),
        nombre: String(row.name || ''),
        descripcion: row.category ? String(row.category) : null,
        precio: round2(Number(row.price) || 0),
        costo_estimado: round2(Number(row.cost) || 0),
        emoji: row.emoji || null,
        color: row.color || null,
        activo: !row.deleted_at,
        disponible: row.available !== false,
        creado_en: row.created_at || null,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
    case 'inventory':
      return {
        id: row.id,
        nombre: String(row.name || ''),
        categoria: row.category ? String(row.category) : null,
        unidad_medida: String(row.unit || 'kg'),
        costo_unitario: round2(Number(row.unit_cost) || 0),
        existencia: round2(Number(row.stock) || 0),
        stock_minimo: round2(Number(row.min) || 0),
        activo: !row.deleted_at,
        creado_en: row.created_at || null,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
    case 'suppliers':
      return {
        id: row.id,
        nombre_empresa: String(row.name || ''),
        contacto_nombre: row.contact || null,
        telefono: row.phone || null,
        email: row.email || null,
        productos_suministrados: row.notes || null,
        notas: row.notes || null,
        activo: row.active !== false && !row.deleted_at,
        creado_en: row.created_at || null,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
    case 'users':
      return {
        id: row.remote_id,
        nombre: String(row.name || ''),
        rol: mapRol(row.role),
        activo: row.active !== false && !row.deleted_at,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
    case 'orders': {
      const remoteNumber = orderNumber(row.code);
      const base = {
        id: row.id,
        cliente: String(row.customer || 'Mostrador'),
        ...(row.remote_user_id ? { usuario_id: row.remote_user_id } : {}),
        ...(row.cash_session_id ? { caja_sesion_id: row.cash_session_id } : {}),
        ...(row.receipt_business ? { comprobante_negocio: row.receipt_business } : {}),
        ...(row.amount_received != null ? { efectivo_recibido: row.amount_received, cambio: row.change_due } : {}),
        canal: mapCanal(row.channel),
        notas: row.note || null,
        subtotal: round2(Number(row.subtotal) || 0),
        descuento: round2(Number(row.discount) || 0),
        propina: round2(Number(row.tip) || 0),
        itbis: round2(Number(row.tax) || 0),
        total: round2(Number(row.total) || 0),
        pagado: row.paid === true,
        metodo_pago: mapMetodo(row.payment_method),
        estado: ESTADOS[row.status] || 'nueva',
        creado_en: row.created_at || null,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
      if (remoteNumber > 0) base.numero_orden = remoteNumber;
      return base;
    }
    case 'movements': {
      const quantity = round2(Number(row.quantity) || 0);
      const after = round2(Number(row.stock_after) ?? 0);
      const isEntry = row.type === 'entrada';
      return {
        id: row.id,
        inventario_id: row.item_id,
        tipo: TIPOS_MOV[row.type] || 'ajuste',
        cantidad: quantity,
        unidad: row.unit || null,
        costo_unitario: round2(Number(row.unit_cost) || 0),
        total: round2(Number(row.total) || 0),
        existencia_anterior: round2(isEntry ? after - quantity : after + quantity),
        existencia_resultante: after,
        proveedor_id: row.supplier_id || null,
        usuario_id: row.remote_user_id || null,
        motivo: row.note || null,
        orden_id: row.orden_id || null,
        creado_en: row.created_at || null,
        updated_at: row.updated_at || null,
        deleted_at: row.deleted_at || null,
      };
    }
    case 'settings':
      return {
        key: row.key || 'app',
        valor: {
          business_name: row.business_name || '',
          rnc: row.rnc || '',
          address: row.address || '',
          phone: row.phone || '',
          tax_rate: Number(row.tax_rate ?? 0.18),
          currency: row.currency || 'RD$',
          notifications: row.notifications || {},
        },
        updated_at: row.updated_at || null,
      };
    default:
      return row;
  }
}

export function pagoRow(order) {
  if (order.paid !== true) return null;
  const method = mapMetodo(order.payment_method);
  if (!method) throw new Error('La orden pagada no tiene un método válido.');
  if (!/^[0-9a-fA-F-]{36}$/.test(String(order.id || ''))) return null;
  return {
    id: `${String(order.id).slice(0, -4)}fffe`,
    orden_id: order.id,
    metodo: method,
    monto: round2(Number(order.total) || 0),
    creado_en: order.created_at || null,
    updated_at: order.updated_at || null,
  };
}

export function remoteDetailRowsFor(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.map((item, index) => ({
    id: detailSlot(order.id, index),
    orden_id: order.id,
    producto_id: item.product_id || null,
    nombre_snapshot: String(item.name || 'Producto'),
    cantidad: Math.max(1, Number(item.qty) || 1),
    precio_unitario: round2(Number(item.price) || 0),
    costo_unitario: round2(Number(item.cost) || 0),
    itbis_aplicado: 0,
  }));
}

export function fromRemote(table, remote, local = null) {
  switch (table) {
    case 'products':
      return {
        id: remote.id,
        name: remote.nombre || '',
        category: remote.descripcion || (local && local.category) || 'Combos',
        price: Number(remote.precio) || 0,
        cost: Number(remote.costo_estimado) || 0,
        emoji: remote.emoji || '🍗',
        color: remote.color || 'gold',
        available: remote.disponible !== false,
        codigo: remote.codigo,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    case 'inventory':
      return {
        id: remote.id,
        name: remote.nombre || '',
        category: remote.categoria || (local && local.category) || '',
        stock: Number(remote.existencia) || 0,
        unit: remote.unidad_medida || 'kg',
        min: Number(remote.stock_minimo) || 0,
        unit_cost: Number(remote.costo_unitario) || 0,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    case 'suppliers':
      return {
        id: remote.id,
        name: remote.nombre_empresa || '',
        contact: remote.contacto_nombre || '',
        phone: remote.telefono || '',
        email: remote.email || '',
        notes: remote.notas || remote.productos_suministrados || '',
        active: remote.activo !== false,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    case 'users':
      return {
        ...(local || {}),
        id: remote.id,
        remote_id: remote.id,
        name: remote.nombre || (local && local.name) || '',
        role: remote.rol === 'cocinero' ? 'cocina' : (remote.rol || 'cajero'),
        role_name: rolName(remote.rol === 'cocinero' ? 'cocina' : remote.rol),
        active: remote.activo !== false,
        email: (local && local.email) || '',
        password_hash: (local && local.password_hash) || null,
        password_salt: (local && local.password_salt) || null,
        last_access: (local && local.last_access) || null,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    case 'orders': {
      const details = Array.isArray(remote.orden_detalles) ? remote.orden_detalles : [];
      // Una cabecera sin líneas no acredita una venta completa.
      if (!details.length && local?.items?.length) return local;
      const items = details.map(detail => ({
        product_id: detail.producto_id || null,
        name: detail.nombre_snapshot || 'Producto',
        price: Number(detail.precio_unitario) || 0,
        cost: Number(detail.costo_unitario) || 0,
        qty: Number(detail.cantidad) || 1,
      }));
      const status = ESTADOS_REVERSE[remote.estado] || 'Nueva';
      return {
        id: remote.id,
        code: `#${remote.numero_orden || orderNumber((local && local.code) || '') || 0}`,
        customer: remote.cliente || 'Mostrador',
        channel: CANALES.includes(remote.canal) ? remote.canal : 'Mostrador',
        items,
        items_text: items.map(item => `${item.name} × ${item.qty}`).join(', '),
        status,
        icon: status === 'Nueva' ? 'new' : status === 'Preparando' ? 'prep' : 'ready',
        payment_method: remote.metodo_pago ? `${remote.metodo_pago.charAt(0).toUpperCase()}${remote.metodo_pago.slice(1)}` : 'Pendiente',
        subtotal: Number(remote.subtotal) || 0,
        discount: Number(remote.descuento) || 0,
        tip: Number(remote.propina) || 0,
        note: remote.notas || null,
        tax: Number(remote.itbis) || 0,
        total: Number(remote.total) || 0,
        paid: remote.pagado === true,
        user_id: local?.user_id || remote.usuario_id || null,
        remote_user_id: remote.usuario_id || local?.remote_user_id || null,
        seller_name: remote.vendedor_nombre || local?.seller_name || null,
        cash_session_id: remote.caja_sesion_id || local?.cash_session_id || null,
        local_cash_session_id: local?.local_cash_session_id || remote.caja_sesion_id || null,
        receipt_business: remote.comprobante_negocio || local?.receipt_business || null,
        amount_received: remote.efectivo_recibido ?? local?.amount_received ?? null,
        change_due: remote.cambio ?? local?.change_due ?? null,
        demo_sale: local?.demo_sale === true,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    }
    case 'movements':
      return {
        id: remote.id,
        type: remote.tipo === 'entrada' ? 'entrada' : (remote.tipo || 'ajuste'),
        item_id: remote.inventario_id || null,
        item_name: (local && local.item_name) || '',
        quantity: Number(remote.cantidad) || 0,
        unit: remote.unidad || '',
        unit_cost: Number(remote.costo_unitario) || 0,
        supplier_id: remote.proveedor_id || null,
        user_id: remote.usuario_id || null,
        user_name: (local && local.user_name) || 'Sistema',
        note: remote.motivo || '',
        total: Number(remote.total) || 0,
        stock_after: Number(remote.existencia_resultante) || 0,
        created_at: remote.creado_en || (local && local.created_at) || null,
        updated_at: remote.updated_at || null,
        deleted_at: remote.deleted_at || null,
      };
    case 'settings':
      return {
        key: remote.key || 'app',
        ...(remote.valor || {}),
        updated_at: remote.updated_at || null,
      };
    default:
      return remote;
  }
}

export const PUSH_RANK = {
  products: 0, inventory: 1, suppliers: 2, users: 3, orders: 4, movements: 5, settings: 6,
};
