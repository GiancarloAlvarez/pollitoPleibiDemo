import {
  uid, money, round2, calcTax, hashPassword, randomSalt, addDays, startOfDay,
} from '../core/utils.js';

export const DEMO_PASSWORD = 'PollitoPleibi2026!';

export const CATEGORIES = ['Todos', 'Alitas', 'Pechugas', 'Combos', 'Fritos', 'Acompañamientos', 'Bebidas', 'Extras', 'Salsas'];

export const PRODUCT_COLORS = ['gold', 'coral', 'cream', 'yellow', 'blue', 'pink', 'green', 'purple', 'lime', 'orange', 'sky', 'tan'];

const PRODUCT_ROWS = [
  ['Combo Pleiboi', 'Combos', 495, 'gold', '🍗'],
  ['Alitas BBQ x8', 'Alitas', 385, 'coral', '🍖'],
  ['Pechuga crispy', 'Pechugas', 350, 'cream', '🍗'],
  ['Papas sazonadas', 'Acompañamientos', 180, 'yellow', '🍟'],
  ['Tenders x5', 'Pechugas', 320, 'blue', '🍗'],
  ['Alitas honey', 'Alitas', 425, 'pink', '🍖'],
  ['Combo familiar', 'Combos', 890, 'green', '🍱'],
  ['Yaroa de pollo', 'Fritos', 295, 'purple', '🥘'],
  ['Refresco frío', 'Bebidas', 85, 'sky', '🥤'],
  ['Limonada natural', 'Bebidas', 140, 'lime', '🍋'],
  ['Salsa especial', 'Salsas', 65, 'orange', '🌶️'],
  ['Aros de cebolla', 'Acompañamientos', 190, 'tan', '🧅'],
];

const INVENTORY_ROWS = [
  ['Alitas de pollo', 'Proteínas', 4.5, 'kg', 10, 12450 / 4.5],
  ['Pechuga de pollo', 'Proteínas', 18, 'kg', 12, 24900 / 18],
  ['Aceite vegetal', 'Condimentos', 3, 'lts', 5, 12450],
  ['Papas congeladas', 'Acompañamientos', 24, 'kg', 15, 2075],
  ['Cajas para combo', 'Empaques', 18, 'und', 25, 62250 / 18],
  ['Refrescos variados', 'Bebidas', 96, 'und', 40, 74700 / 96],
];

const USER_ROWS = [
  ['Carlos Martínez', 'admin@pollitopleibi.do', 'admin', 'Dueño / Administrador'],
  ['María Pérez', 'cajero@pollitopleibi.do', 'cajero', 'Vendedor / Cajero'],
  ['Luis García', 'cocina@pollitopleibi.do', 'cocina', 'Cocinero'],
];

const SUPPLIER_ROWS = [
  ['Distribuidora del Caribe', 'Avícola Nacional', '809-555-0142', 'ventas@delcaribe.do', 'Proteínas y pollo fresco'],
  ['Avícola Nacional', 'Carlos Jiménez', '829-555-0198', 'compras@avicolanacional.do', 'Despacho martes y viernes'],
  ['Empaques RD', 'Laura Santos', '849-555-0177', 'servicio@empaquesrd.do', 'Cajas, bolsas y empaques'],
];

function makeProducts(now) {
  const t = Date.parse(now) || Date.now();
  return PRODUCT_ROWS.map(([name, category, price, color, emoji], index) => ({
    id: uid(),
    name,
    category,
    price,
    cost: round2(price * 0.39),
    color,
    emoji,
    available: true,
    created_at: new Date(t + index).toISOString(),
    updated_at: new Date(t + index).toISOString(),
    deleted_at: null,
  }));
}

function makeInventory(now) {
  const t = Date.parse(now) || Date.now();
  return INVENTORY_ROWS.map(([name, category, stock, unit, min, unitCost], index) => ({
    id: uid(),
    name,
    category,
    stock,
    unit,
    min,
    unit_cost: unitCost,
    created_at: new Date(t + index).toISOString(),
    updated_at: new Date(t + index).toISOString(),
    deleted_at: null,
  }));
}

function makeSuppliers(now) {
  const t = Date.parse(now) || Date.now();
  return SUPPLIER_ROWS.map(([name, contact, phone, email, notes], index) => ({
    id: uid(),
    name,
    contact,
    phone,
    email,
    notes,
    active: true,
    created_at: new Date(t + index).toISOString(),
    updated_at: new Date(t + index).toISOString(),
    deleted_at: null,
  }));
}

async function makeUsers(now) {
  const users = [];
  for (const [name, email, role, roleName] of USER_ROWS) {
    const salt = randomSalt();
    const passwordHash = await hashPassword(DEMO_PASSWORD, salt);
    users.push({
      id: uid(),
      name,
      email,
      role,
      role_name: roleName,
      password_salt: salt,
      password_hash: passwordHash,
      active: true,
      last_access: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
  }
  return users;
}

function orderItems(products, picks) {
  return picks.map(([index, qty]) => {
    const product = products[index];
    return {
      product_id: product.id,
      name: product.name,
      price: product.price,
      cost: product.cost,
      qty,
    };
  });
}

function itemsText(items) {
  return items.map(item => `${item.name} × ${item.qty}`).join(', ');
}

function buildOrder({ code, customer, items, status, paymentMethod, createdAt, paid = true, channel = 'Mostrador' }) {
  const subtotal = round2(items.reduce((total, item) => total + item.price * item.qty, 0));
  const tax = calcTax(subtotal, 0.18);
  return {
    id: uid(),
    code,
    customer,
    channel,
    items,
    items_text: itemsText(items),
    status,
    icon: status === 'Nueva' ? 'new' : status === 'Preparando' ? 'prep' : 'ready',
    payment_method: paymentMethod,
    subtotal,
    tax,
    total: round2(subtotal + tax),
    paid,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
  };
}

function makeOrders(products) {
  const now = new Date();
  const orders = [];
  const active = [
    { code: '#1048', customer: 'Para llevar · Mostrador', picks: [[0, 1], [8, 1]], status: 'Nueva', payment: 'Efectivo', minutes: 3 },
    { code: '#1047', customer: 'Delivery · Zona Colonial', picks: [[1, 2], [3, 2]], status: 'Preparando', payment: 'Tarjeta', minutes: 8 },
    { code: '#1046', customer: 'Para llevar · Mostrador', picks: [[6, 1]], status: 'Lista', payment: 'Transferencia', minutes: 14 },
  ];
  for (const row of active) {
    orders.push(buildOrder({
      code: row.code,
      customer: row.customer,
      items: orderItems(products, row.picks),
      status: row.status,
      paymentMethod: row.payment,
      createdAt: new Date(now.getTime() - row.minutes * 60000).toISOString(),
      paid: true,
      channel: row.customer.split(' · ')[0],
    }));
  }
  const historyPattern = [
    [[0, 1], [3, 1]],
    [[1, 1], [8, 2]],
    [[6, 1]],
    [[2, 2], [9, 2]],
    [[4, 2], [7, 1]],
    [[7, 1], [10, 1], [8, 1]],
  ];
  const payments = ['Efectivo', 'Tarjeta', 'Transferencia'];
  const customers = ['Para llevar · Mostrador', 'Delivery · Zona Colonial', 'Delivery · Naco', 'Para llevar · Mostrador'];
  let codeNumber = 1033;
  for (let day = 6; day >= 1; day -= 1) {
    const base = startOfDay(addDays(now, -day));
    const pattern = historyPattern[6 - day] || historyPattern[0];
    const orderCount = 2 + (day % 2);
    for (let i = 0; i < orderCount; i += 1) {
      const created = new Date(base);
      created.setHours(11 + i * 3, 20, 0, 0);
      const picks = pattern.map(([index, qty]) => [index, qty + (i % 2)]);
      orders.push(buildOrder({
        code: `#${codeNumber}`,
        customer: customers[(day + i) % customers.length],
        items: orderItems(products, picks),
        status: 'Entregada',
        paymentMethod: payments[(day + i) % payments.length],
        createdAt: created.toISOString(),
        paid: true,
        channel: customers[(day + i) % customers.length].split(' · ')[0],
      }));
      codeNumber += 1;
    }
  }
  return orders;
}

function makeMovements(inventory, suppliers, users, now) {
  const rows = [];
  const list = [
    [0, 6, 2766.67, 'Compra semanal'],
    [1, 10, 1383.33, 'Reposición de pechuga'],
    [3, 12, 2075, 'Entrada de papas congeladas'],
    [2, 4, 12450, 'Aceite para freidora'],
    [5, 48, 778.13, 'Reposición de bebidas'],
  ];
  list.forEach(([index, qty, cost, note], i) => {
    const item = inventory[index];
    const createdAt = new Date(now.getTime() - (i + 1) * 86400000 * 2);
    rows.push({
      id: uid(),
      type: 'entrada',
      item_id: item.id,
      item_name: item.name,
      quantity: qty,
      unit: item.unit,
      unit_cost: cost,
      supplier_id: suppliers[i % suppliers.length].id,
      user_id: users[0].id,
      user_name: users[0].name,
      note,
      total: round2(qty * cost),
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      deleted_at: null,
    });
  });
  return rows;
}

export async function buildSeed() {
  const now = new Date().toISOString();
  const products = makeProducts(now);
  const inventory = makeInventory(now);
  const suppliers = makeSuppliers(now);
  const users = await makeUsers(now);
  const orders = makeOrders(products);
  const movements = makeMovements(inventory, suppliers, users, new Date());
  const settings = {
    key: 'app',
    business_name: 'Pollito Pleibi',
    rnc: '132-45678-9',
    address: 'Av. Independencia #45, Santo Domingo',
    phone: '809-555-0100',
    tax_rate: 0.18,
    currency: 'RD$',
    notifications: { low_stock: true, new_order: true, daily_summary: false },
    updated_at: now,
  };
  return { products, inventory, suppliers, users, orders, movements, settings };
}

export function demoUsers() {
  return USER_ROWS.map(([name, email, role, roleName]) => ({ name, email, role, role_name: roleName }));
}

export function inventoryDisplayValue(item) {
  return round2((Number(item.stock) || 0) * (Number(item.unit_cost) || 0));
}

export function stockStatus(item) {
  return Number(item.stock) < Number(item.min) ? 'low' : 'ok';
}

export function productValue(product) {
  return money(product.price);
}
