import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService, supabaseIdentityProvider } from '../../local-server/server.mjs';
import { problem } from '../../local-server/store.mjs';
import { DEMO_PASSWORD } from '../../js/data/seed.js';

let service, base, admin, cashier, cook, product;
async function api(url, route, { actor, payload, origin = url, csrf = true } = {}) {
  const response = await fetch(url + '/api/local/' + route, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { ...(payload === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
      ...(actor ? { Cookie: actor.cookie, ...(csrf ? { 'X-Pollito-CSRF': actor.csrf } : {}) } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function login(url, role) {
  const result = await api(url, 'login', { payload: { email: `${role}@pollitopleibi.do`, password: DEMO_PASSWORD } });
  assert.equal(result.status, 200);
  return { cookie: result.headers.get('set-cookie').split(';')[0], csrf: result.data.csrf,
    user: result.data.user, cookieHeader: result.headers.get('set-cookie') };
}
function orderCommand(pr, paid = false) {
  const id = randomUUID(), subtotal = pr.price, tax = Math.round(subtotal * .18 * 100) / 100;
  return { id, kind: 'order.create', payload: { order: { id, customer: 'QA LAN',
    channel: 'Mostrador', paid, payment_method: paid ? 'Tarjeta' : 'Pendiente',
    total: Math.round((subtotal + tax) * 100) / 100, items: [{ product_id: pr.id, price: pr.price, qty: 1 }] } } };
}
before(async () => {
  service = await createLocalService({ databasePath: ':memory:', demo: true });
  const address = await service.listen(0); base = `http://127.0.0.1:${address.port}`;
  admin = await login(base, 'admin'); cashier = await login(base, 'cajero'); cook = await login(base, 'cocina');
  product = (await api(base, 'bootstrap', { actor: admin })).data.data.products[0];
});
after(async () => service?.close());

test('LAN-01 estado distingue demo y nube pendiente', async () => {
  const result = await api(base, 'status');
  assert.equal(result.data.service, 'pollito-local'); assert.equal(result.data.demo, true);
  assert.equal(result.data.cloudSync, 'pending-module');
});
test('LAN-02 API requiere sesión y cookie HttpOnly/SameSite', async () => {
  assert.equal((await api(base, 'bootstrap')).status, 401);
  assert.match(admin.cookieHeader, /HttpOnly/); assert.match(admin.cookieHeader, /SameSite=Strict/);
});
test('LAN-03 POST rechaza otro origen y CSRF ausente', async () => {
  const command = orderCommand(product);
  assert.equal((await api(base, 'commands', { actor: cashier, payload: command, origin: 'https://otro.invalid' })).status, 403);
  assert.equal((await api(base, 'commands', { actor: cashier, payload: command, csrf: false })).status, 403);
});
test('LAN-04 servidor rechaza catálogo del cajero y venta de cocina', async () => {
  const change = { id: randomUUID(), kind: 'entity.upsert', payload: { store: 'products', row: { ...product, price: 1 } } };
  assert.equal((await api(base, 'commands', { actor: cashier, payload: change })).status, 403);
  assert.equal((await api(base, 'commands', { actor: cook, payload: orderCommand(product) })).status, 403);
});
test('LAN-05 mismo comando conserva orden, número y outbox sin duplicación', async () => {
  const command = orderCommand(product), before = service.store.pendingCloud();
  const first = await api(base, 'commands', { actor: cashier, payload: command });
  const again = await api(base, 'commands', { actor: cashier, payload: command });
  assert.equal(first.status, 200); assert.equal(again.status, 200); assert.equal(again.data.replayed, true);
  assert.equal(first.data.row.id, again.data.row.id); assert.equal(first.data.row.code, again.data.row.code);
  assert.equal(service.store.rows('orders').filter(o => o.id === command.id).length, 1);
  assert.equal(service.store.pendingCloud(), before + 1);
  const altered = structuredClone(command); altered.payload.order.customer = 'Otro contenido';
  assert.equal((await api(base, 'commands', { actor: cashier, payload: altered })).status, 409);
});
test('LAN-06 comandos simultáneos asignan números diferentes', async () => {
  const results = await Promise.all([1, 2].map(() => api(base, 'commands', { actor: cashier, payload: orderCommand(product) })));
  assert.ok(results.every(r => r.status === 200));
  assert.notEqual(results[0].data.row.code, results[1].data.row.code);
});
test('LAN-07 cocina recibe proyección sin finanzas y usa control de versión', async () => {
  const created = await api(base, 'commands', { actor: cashier, payload: orderCommand(product) });
  const snapshot = (await api(base, 'bootstrap', { actor: cook })).data.data;
  const row = snapshot.orders.find(o => o.id === created.data.row.id);
  assert.equal(row.total, undefined); assert.equal(row.payment_method, undefined);
  assert.equal(row.items[0].price, undefined); assert.equal(row.items[0].cost, undefined);
  assert.equal(snapshot.products[0].price, undefined); assert.equal(snapshot.inventory[0].unit_cost, undefined);
  const advance = { id: randomUUID(), kind: 'order.advance', payload: { id: row.id, expectedStatus: 'Nueva' } };
  const result = await api(base, 'commands', { actor: cook, payload: advance });
  assert.equal(result.status, 200); assert.equal(result.data.row.status, 'Preparando'); assert.equal(result.data.row.total, undefined);
  advance.id = randomUUID();
  assert.equal((await api(base, 'commands', { actor: cook, payload: advance })).status, 409);
  assert.equal(service.store.get('orders', row.id).paid, false);
});
test('LAN-08 snapshot de cajero no contiene costos', async () => {
  const data = (await api(base, 'bootstrap', { actor: cashier })).data.data;
  assert.equal(data.products[0].cost, undefined);
  assert.ok(data.orders.every(o => o.user_id === cashier.user.id && o.items.every(i => i.cost === undefined)));
  assert.equal(data.users.length, 1); assert.equal(data.users[0].password_hash, undefined);
});
test('LAN-09 una entrada usa unidad compatible y escribe movimiento en transacción', async () => {
  const item = service.store.rows('inventory')[0], before = item.stock;
  const command = { id: randomUUID(), kind: 'inventory.entry', payload: { itemId: item.id, quantity: 2, unit: 'incompatible', unitCost: 1 } };
  assert.equal((await api(base, 'commands', { actor: admin, payload: command })).status, 400);
  assert.equal(service.store.get('inventory', item.id).stock, before);
  command.payload.unit = item.unit;
  const result = await api(base, 'commands', { actor: admin, payload: command });
  assert.equal(result.status, 200); assert.equal(result.data.row.stock, before + 2);
  assert.equal(service.store.get('movements', command.id).stock_before, before);
  assert.equal(service.store.get('movements', command.id).stock_after, before + 2);
});
test('LAN-10 servidor estático no publica tests, documentos ni base privada', async () => {
  for (const route of ['/tests/.env', '/local-server/.data/local.sqlite', '/docs/supabase/schema_completo.sql']) {
    assert.equal((await fetch(base + route)).status, 404);
  }
});
test('LAN-11 límite de intentos de login', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await api(base, 'login', { payload: { email: 'missing@qa.invalid', password: 'bad' } })).status, 401);
  assert.equal((await api(base, 'login', { payload: { email: 'missing@qa.invalid', password: 'bad' } })).status, 429);
});
test('LAN-12 logout revoca sesión en servidor', async () => {
  const actor = await login(base, 'cajero');
  assert.equal((await api(base, 'logout', { actor, payload: {} })).status, 200);
  assert.equal((await api(base, 'session', { actor })).status, 401);
});
test('LAN-13 reinicio conserva orden, cola y sesión en SQLite', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode', 'pollito-lan-'));
  const filename = path.join(dir, 'test.sqlite'); let instance;
  try {
    instance = await createLocalService({ databasePath: filename, demo: true });
    let address = await instance.listen(0), url = `http://127.0.0.1:${address.port}`;
    const actor = await login(url, 'cajero');
    const pr = (await api(url, 'bootstrap', { actor })).data.data.products[0];
    const command = orderCommand(pr);
    assert.equal((await api(url, 'commands', { actor, payload: command })).status, 200);
    await instance.close(); instance = null;
    instance = await createLocalService({ databasePath: filename, demo: true });
    address = await instance.listen(0); url = `http://127.0.0.1:${address.port}`;
    const result = await api(url, 'bootstrap', { actor });
    assert.equal(result.status, 200); assert.ok(result.data.data.orders.some(o => o.id === command.id));
    assert.equal(result.data.pendingCloud, 1);
  } finally { await instance?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('LAN-14 rechazo remoto no cae al password almacenado; solo fallo de red válido', async () => {
  let mode = 'online';
  const instance = await createLocalService({ databasePath: ':memory:', identityProvider: async email => {
    if (mode === 'network') throw Object.assign(problem('network', 503), { network: true });
    if (mode === 'denied') throw problem('Credenciales inválidas.', 401);
    return { id: randomUUID(), email, role: 'cajero', name: 'QA usuario', active: true };
  } });
  try {
    const address = await instance.listen(0), url = `http://127.0.0.1:${address.port}`;
    const payload = { email: 'cached@qa.invalid', password: 'QA-password' };
    assert.equal((await api(url, 'login', { payload })).status, 200);
    mode = 'denied'; assert.equal((await api(url, 'login', { payload })).status, 401);
    mode = 'network'; const result = await api(url, 'login', { payload });
    assert.equal(result.status, 200); assert.equal(result.data.offline, true);
  } finally { await instance.close(); }
});
test('LAN-15 proveedor usa perfil remoto y no user_metadata del caller', async () => {
  let calls = 0;
  const provider = supabaseIdentityProvider({ url: 'https://qa.invalid', anonKey: 'public-fixture', fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1
      ? { access_token: 'test-only', user: { id: 'user-fixture', email: 'cook@qa.invalid', user_metadata: { role: 'admin' } } }
      : [{ id: 'user-fixture', nombre: 'QA Cocina', rol: 'cocinero', activo: true }]), { status: 200 });
  } });
  const identity = await provider('cook@qa.invalid', 'test-password');
  assert.equal(identity.role, 'cocina'); assert.equal(calls, 2);
});
