import {
  STORES, dbGetAll, dbGet, dbPut, dbCount, dbAtomicPut,
} from './db.js';
import { buildSeed, DEMO_PASSWORD } from '../data/seed.js';
import {
  uid, round2, calcTax, nextOrderCode, normalize, hashPassword, randomSalt, startOfDay,
} from './utils.js';
import { SCHEMA_VERSION } from '../config.js';
import { store, state, loadCart, saveCart } from './state.js';
import { refreshPending, scheduleSync } from './sync.js';
import { requireRole } from './permissions.js';
import { localEnabled, localData, localCommand } from './local-client.js';

let cartInitialized = false;

const DEFAULT_SETTINGS = {
  key: 'app',
  business_name: 'Pollito Pleibi',
  rnc: '132-45678-9',
  address: 'Av. Independencia #45, Santo Domingo',
  phone: '809-555-0100',
  tax_rate: 0.18,
  currency: 'RD$',
  notifications: { low_stock: true, new_order: true, daily_summary: false },
  updated_at: new Date().toISOString(),
};

export async function ensureSeed() {
  const meta = await dbGet(STORES.META, 'seed_version');
  if (meta && Number(meta.value) >= SCHEMA_VERSION) return false;
  const seed = await buildSeed();
  const pairs = [
    [STORES.PRODUCTS, seed.products],
    [STORES.INVENTORY, seed.inventory],
    [STORES.SUPPLIERS, seed.suppliers],
    [STORES.USERS, seed.users],
    [STORES.ORDERS, seed.orders],
    [STORES.MOVEMENTS, seed.movements],
  ];
  for (const [name, rows] of pairs) {
    const count = await dbCount(name);
    if (!count) {
      const { dbPutMany } = await import('./db.js');
      await dbPutMany(name, rows);
    }
  }
  const existingSettings = await dbGet(STORES.SETTINGS, 'app');
  if (!existingSettings) await dbPut(STORES.SETTINGS, seed.settings);
  await dbPut(STORES.META, { key: 'seed_version', value: SCHEMA_VERSION, seeded_at: new Date().toISOString() });
  return true;
}

function activeRows(rows) {
  return (rows || []).filter(row => !row.deleted_at);
}

function byDateDesc(field) {
  return (a, b) => String(b[field] || '').localeCompare(String(a[field] || ''));
}

function byDateAsc(field) {
  return (a, b) => String(a[field] || '').localeCompare(String(b[field] || ''));
}

async function readData() {
  if (localEnabled()) {
    const data = localData();
    const settings = (data.settings || []).find(row => row.key === 'app') || {};
    return { products: activeRows(data.products), orders: activeRows(data.orders).sort(byDateDesc('created_at')),
      inventory: activeRows(data.inventory), users: activeRows(data.users), suppliers: activeRows(data.suppliers),
      movements: activeRows(data.movements), settings: { ...DEFAULT_SETTINGS, ...settings } };
  }
  const [products, orders, inventory, users, suppliers, movements, settingsRows] = await Promise.all([
    dbGetAll(STORES.PRODUCTS),
    dbGetAll(STORES.ORDERS),
    dbGetAll(STORES.INVENTORY),
    dbGetAll(STORES.USERS),
    dbGetAll(STORES.SUPPLIERS),
    dbGetAll(STORES.MOVEMENTS),
    dbGetAll(STORES.SETTINGS),
  ]);
  const settingsRow = settingsRows.find(row => row.key === 'app') || DEFAULT_SETTINGS;
  return {
    cash_sessions: await dbGetAll(STORES.CASH_SESSIONS),
    products: activeRows(products).sort(byDateAsc('created_at')),
    orders: activeRows(orders).sort(byDateDesc('created_at')),
    inventory: activeRows(inventory).sort(byDateAsc('created_at')),
    users: activeRows(users).sort(byDateAsc('created_at')),
    suppliers: activeRows(suppliers).sort(byDateAsc('created_at')),
    movements: activeRows(movements).sort(byDateDesc('created_at')),
    settings: { ...DEFAULT_SETTINGS, ...settingsRow, tax_rate: Number(settingsRow.tax_rate ?? DEFAULT_SETTINGS.tax_rate) },
  };
}

export async function initRepo() {
  if (!localEnabled()) await ensureSeed();
  const data = await readData();
  Object.assign(state, data);
  if (!cartInitialized) {
    const storedCart = loadCart();
    state.cart = storedCart && storedCart.length ? storedCart : (state.products.length ? [state.products[0]] : []);
    cartInitialized = true;
    saveCart(state.cart);
  }
  return data;
}

export async function reload() {
  const data = await readData();
  store.setState(data);
  return data;
}

export function nextOrderNumber() {
  return nextOrderCode(state.orders);
}

export function orderTotals(items) {
  const subtotal = round2((items || []).reduce((total, item) => total + Number(item.price) * Number(item.qty || 1), 0));
  const rate = Number(state.settings.tax_rate ?? 0.18);
  const tax = calcTax(subtotal, rate);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

async function persist(table, row) {
  if (localEnabled()) {
    return localCommand('entity.upsert', { store: table, row }, { row, store: table });
  }
  await dbAtomicPut([
    { store: table, value: row },
    { store: STORES.OUTBOX, value: { id: uid(), table, op: 'upsert', payload: row,
      created_at: new Date().toISOString(), attempts: 0 } },
  ]);
  await refreshPending();
  scheduleSync(1200);
  return row;
}

export async function saveProduct(input) {
  requireRole();
  const name = String(input.name || '').trim();
  const price = Number(input.price);
  if (!name) throw new Error('El nombre del producto es obligatorio.');
  if (!Number.isFinite(price) || price <= 0) throw new Error('El precio debe ser mayor que cero.');
  const now = new Date().toISOString();
  const existing = input.id ? await dbGet(STORES.PRODUCTS, input.id) : null;
  const row = {
    id: existing ? existing.id : uid(),
    name,
    category: String(input.category || 'Combos').trim(),
    price: round2(price),
    cost: input.cost === '' || input.cost == null ? round2(price * 0.39) : round2(Number(input.cost) || 0),
    color: String(input.color || 'gold'),
    emoji: String(input.emoji || '🍗'),
    available: input.available == null ? true : Boolean(input.available),
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    deleted_at: null,
  };
  await persist(STORES.PRODUCTS, row);
  await reload();
  return row;
}

export async function toggleProduct(id) {
  requireRole();
  const row = await dbGet(STORES.PRODUCTS, id);
  if (!row) throw new Error('Producto no encontrado.');
  const updated = { ...row, available: !row.available, updated_at: new Date().toISOString() };
  await persist(STORES.PRODUCTS, updated);
  await reload();
  return updated;
}

export async function deleteProduct(id) {
  requireRole();
  const row = await dbGet(STORES.PRODUCTS, id);
  if (!row) return false;
  const updated = { ...row, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await persist(STORES.PRODUCTS, updated);
  await reload();
  return true;
}

export async function saveInventory(input) {
  requireRole();
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del insumo es obligatorio.');
  const now = new Date().toISOString();
  const existing = input.id ? await dbGet(STORES.INVENTORY, input.id) : null;
  const stock = Number(input.stock ?? 0);
  const min = Number(input.min ?? 0);
  const unitCost = Number(input.unit_cost ?? 0);
  if ([stock, min, unitCost].some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Las cantidades y costos deben ser números positivos.');
  }
  const row = {
    id: existing ? existing.id : uid(),
    name,
    category: String(input.category || 'Proteínas').trim(),
    stock: round2(stock),
    unit: String(input.unit || 'kg'),
    min: round2(min),
    unit_cost: round2(unitCost),
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    deleted_at: null,
  };
  await persist(STORES.INVENTORY, row);
  await reload();
  return row;
}

export async function addInventoryEntry(input) {
  requireRole();
  const itemId = String(input.itemId || '');
  if (!itemId) throw new Error('Selecciona un insumo.');
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor que cero.');
  const item = await dbGet(STORES.INVENTORY, itemId);
  if (!item) throw new Error('Insumo no encontrado.');
  const user = state.user;
  const now = new Date().toISOString();
  const unitCost = input.unitCost === '' || input.unitCost == null ? item.unit_cost : Number(input.unitCost);
  const updatedItem = {
    ...item,
    stock: round2(Number(item.stock) + quantity),
    unit_cost: round2(unitCost),
    updated_at: now,
  };
  const movement = {
    id: uid(),
    type: 'entrada',
    item_id: item.id,
    item_name: item.name,
    quantity: round2(quantity),
    unit: String(input.unit || item.unit),
    unit_cost: round2(unitCost),
    supplier_id: input.supplierId || null,
    user_id: user ? user.id : null,
    user_name: user ? user.name : 'Sistema',
    note: String(input.note || '').trim(),
    total: round2(quantity * unitCost),
    stock_after: round2(updatedItem.stock),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  if (localEnabled()) {
    const result = await localCommand('inventory.entry', input,
      { id: movement.id, row: updatedItem, store: 'inventory', extraRows: [{ store: 'movements', row: movement }] });
    await reload();
    return { item: result, movement };
  }
  await persist(STORES.INVENTORY, updatedItem);
  await persist(STORES.MOVEMENTS, movement);
  await reload();
  return { item: updatedItem, movement };
}

export async function saveSupplier(input) {
  requireRole();
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del proveedor es obligatorio.');
  const now = new Date().toISOString();
  const existing = input.id ? await dbGet(STORES.SUPPLIERS, input.id) : null;
  const row = {
    id: existing ? existing.id : uid(),
    name,
    contact: String(input.contact || '').trim(),
    phone: String(input.phone || '').trim(),
    email: String(input.email || '').trim(),
    notes: String(input.notes || '').trim(),
    active: input.active == null ? true : Boolean(input.active),
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    deleted_at: null,
  };
  await persist(STORES.SUPPLIERS, row);
  await reload();
  return row;
}

export async function toggleSupplier(id) {
  requireRole();
  const row = await dbGet(STORES.SUPPLIERS, id);
  if (!row) throw new Error('Proveedor no encontrado.');
  const updated = { ...row, active: !row.active, updated_at: new Date().toISOString() };
  await persist(STORES.SUPPLIERS, updated);
  await reload();
  return updated;
}

export async function deleteSupplier(id) {
  requireRole();
  const row = await dbGet(STORES.SUPPLIERS, id);
  if (!row) return false;
  const updated = { ...row, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await persist(STORES.SUPPLIERS, updated);
  await reload();
  return true;
}

export async function saveUser(input) {
  requireRole();
  if (localEnabled()) throw new Error('Las cuentas de red local se administran mediante Supabase Auth; edición de usuarios pendiente de integración.');
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim();
  const role = String(input.role || 'cajero');
  const password = String(input.password || '');
  if (!name) throw new Error('El nombre es obligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indica un correo electrónico válido.');
  if (!['admin', 'cajero', 'cocina'].includes(role)) throw new Error('Selecciona un rol válido.');
  const users = await dbGetAll(STORES.USERS);
  const existing = input.id ? users.find(row => row.id === input.id && !row.deleted_at) : null;
  const duplicate = users.find(row => row.id !== (existing && existing.id) && !row.deleted_at && normalize(row.email) === normalize(email));
  if (duplicate) throw new Error('Ya existe un usuario con ese correo.');
  if ((!existing || password) && password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const now = new Date().toISOString();
  let passwordSalt = existing ? existing.password_salt : randomSalt();
  let passwordHash = existing ? existing.password_hash : await hashPassword(password || DEMO_PASSWORD, passwordSalt);
  if (existing && password) {
    passwordSalt = randomSalt();
    passwordHash = await hashPassword(password, passwordSalt);
  }
  const roleName = role === 'admin' ? 'Dueño / Administrador' : role === 'cocina' ? 'Cocinero' : 'Vendedor / Cajero';
  const row = {
    id: existing ? existing.id : uid(),
    name,
    email,
    role,
    role_name: roleName,
    password_salt: passwordSalt,
    password_hash: passwordHash,
    active: input.active == null ? true : Boolean(input.active),
    last_access: existing ? existing.last_access : null,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
    deleted_at: null,
    remote_id: existing?.remote_id || null,
  };
  await persist(STORES.USERS, row);
  await reload();
  return row;
}

export async function toggleUser(id) {
  requireRole();
  if (localEnabled()) throw new Error('Administra la cuenta desde Supabase Auth.');
  if (state.user.id === id) throw new Error('No puedes desactivar tu propia sesión.');
  const row = await dbGet(STORES.USERS, id);
  if (!row) throw new Error('Usuario no encontrado.');
  const updated = { ...row, active: !row.active, updated_at: new Date().toISOString() };
  await persist(STORES.USERS, updated);
  await reload();
  return updated;
}

export async function deleteUser(id) {
  requireRole();
  if (localEnabled()) throw new Error('Administra la cuenta desde Supabase Auth.');
  const row = await dbGet(STORES.USERS, id);
  if (!row) return false;
  if (state.user && state.user.id === id) throw new Error('No puedes eliminar tu propio usuario.');
  const updated = { ...row, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await persist(STORES.USERS, updated);
  await reload();
  return true;
}

export async function createOrder({ items, customer, channel = 'Mostrador', paymentMethod = 'Efectivo', paid = true, status = 'Nueva', cashSession = null, amountReceived = null }) {
  requireRole(['admin', 'cajero']);
  if (!localEnabled() && state.user.remote_id && !cashSession) throw new Error('Abre tu caja antes de registrar una venta.');
  if (cashSession) {
    const savedCash = await dbGet(STORES.CASH_SESSIONS, cashSession.id);
    if (!savedCash || savedCash.estado !== 'abierta' || savedCash.deleted_at) throw new Error('La sesión de caja no está disponible. Actualiza su estado.');
    cashSession = savedCash;
  }
  const cleanItems = (items || []).filter(item => item && item.id);
  if (!cleanItems.length) throw new Error('Agrega al menos un producto al carrito.');
  const orderItems = cleanItems.map(item => ({
    product_id: item.id,
    name: item.name,
    price: Number(item.price) || 0,
    cost: Number(item.cost) || 0,
    qty: Number(item.qty) || 1,
  }));
  const totals = orderTotals(orderItems);
  if (paid && !['Efectivo', 'Tarjeta', 'Transferencia'].includes(paymentMethod)) throw new Error('Selecciona un método de pago válido.');
  if (paid && amountReceived != null && paymentMethod === 'Efectivo'
      && (!Number.isFinite(Number(amountReceived)) || Number(amountReceived) < totals.total)) throw new Error('El efectivo recibido no cubre el total.');
  if (cashSession && (cashSession.estado !== 'abierta' || cashSession.usuario_id !== (state.user.remote_id || state.user.id))) {
    throw new Error('La caja no está abierta para este usuario.');
  }
  const now = new Date().toISOString();
  const row = {
    id: uid(),
    code: localEnabled() ? 'LOCAL-PENDIENTE' : nextOrderCode(state.orders),
    customer: String(customer || 'Mostrador').trim() || 'Mostrador',
    channel,
    items: orderItems,
    items_text: orderItems.map(item => `${item.name} × ${item.qty}`).join(', '),
    status,
    icon: status === 'Nueva' ? 'new' : status === 'Preparando' ? 'prep' : 'ready',
    payment_method: paymentMethod,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    paid: Boolean(paid),
    user_id: state.user.id,
    remote_user_id: state.user.remote_id || null,
    seller_name: state.user.name,
    cash_session_id: cashSession && !cashSession.demo ? cashSession.id : null,
    local_cash_session_id: cashSession?.id || null,
    demo_sale: cashSession?.demo === true,
    receipt_business: { business_name: state.settings.business_name, rnc: state.settings.rnc,
      address: state.settings.address, phone: state.settings.phone },
    amount_received: paid && paymentMethod === 'Efectivo' && amountReceived != null ? round2(Number(amountReceived)) : null,
    change_due: paid && paymentMethod === 'Efectivo' && amountReceived != null ? round2(Number(amountReceived) - totals.total) : null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  if (localEnabled()) {
    row.code = `LOCAL-${row.id.slice(0, 8).toUpperCase()}`;
    row.user_id = state.user.id;
    const result = await localCommand('order.create', { order: row }, { id: row.id, row, store: 'orders' });
    await reload();
    return result;
  }
  await persist(STORES.ORDERS, row);
  await reload();
  return row;
}

const STATUS_FLOW = { Nueva: 'Preparando', Preparando: 'Lista', Lista: 'Entregada' };

export async function advanceOrder(id) {
  requireRole(['admin', 'cajero', 'cocina']);
  const row = await dbGet(STORES.ORDERS, id);
  if (!row) throw new Error('Orden no encontrada.');
  const next = STATUS_FLOW[row.status];
  if (!next) return row;
  const updated = {
    ...row,
    status: next,
    icon: next === 'Preparando' ? 'prep' : next === 'Lista' ? 'ready' : 'ready',
    updated_at: new Date().toISOString(),
  };
  if (localEnabled()) {
    const result = await localCommand('order.advance', { id, expectedStatus: row.status }, { row: updated, store: 'orders' });
    await reload();
    return result;
  }
  await persist(STORES.ORDERS, updated);
  await reload();
  return updated;
}

export async function saveSettings(patch) {
  requireRole();
  const current = state.settings || DEFAULT_SETTINGS;
  const next = {
    ...current,
    ...patch,
    key: 'app',
    tax_rate: patch && 'tax_rate' in patch ? Math.max(0, Math.min(1, Number(patch.tax_rate) || 0)) : current.tax_rate,
    updated_at: new Date().toISOString(),
  };
  await persist(STORES.SETTINGS, next);
  await reload();
  return next;
}

export async function movementsThisMonth() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return state.movements.filter(movement => new Date(movement.created_at) >= start);
}

export async function todayOrders() {
  const start = startOfDay(new Date()).getTime();
  return state.orders.filter(order => new Date(order.created_at).getTime() >= start);
}

export { DEMO_PASSWORD, DEFAULT_SETTINGS };
