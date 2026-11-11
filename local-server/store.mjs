import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}
export function verifyPassword(password, account) {
  if (!account?.salt || !account?.hash) return false;
  const expected = Buffer.from(account.hash, 'hex');
  const actual = scryptSync(password, account.salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const ROLES = ['admin', 'cajero', 'cocina'];
const ADMIN_STORES = new Set(['products', 'inventory', 'suppliers', 'settings']);
const FLOW = { Nueva: 'Preparando', Preparando: 'Lista', Lista: 'Entregada' };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
function number(value, { positive = false, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (positive && n <= 0) || (integer && !Number.isSafeInteger(n))) {
    throw problem('La cantidad o el importe no es válido.');
  }
  return n;
}
function requireRole(user, roles) {
  if (!user?.active || !roles.includes(user.role)) throw problem('Acceso no permitido para tu rol.', 403);
}
function publicUser(row) {
  return row && { id: row.id, remote_id: row.remote_id, email: row.email, name: row.name,
    role: row.role, active: Boolean(row.active),
    role_name: row.role === 'admin' ? 'Dueño / Administrador' : row.role === 'cocina' ? 'Cocinero' : 'Vendedor / Cajero' };
}

/** SQLite es la autoridad compartida de LAN; cada comando confirma datos y cola juntos. */
export class LocalStore {
  constructor(filename, { demo = false } = {}) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,remote_id TEXT,
        salt TEXT NOT NULL,hash TEXT NOT NULL,validated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL
        REFERENCES accounts(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(store TEXT NOT NULL,row_id TEXT NOT NULL,body TEXT NOT NULL,
        PRIMARY KEY(store,row_id));
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,
        kind TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_outbox(id TEXT PRIMARY KEY REFERENCES operations(id),
        payload TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,kind TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);`);
    const mode = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('mode');
    if (mode && mode.value !== (demo ? 'demo' : 'auth')) {
      this.db.close();
      throw problem('La base de demostración y la de usuarios Auth deben estar separadas.');
    }
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('mode', demo ? 'demo' : 'auth');
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get(store, id) {
    const row = this.db.prepare('SELECT body FROM entities WHERE store=? AND row_id=?').get(store, id);
    return row ? JSON.parse(row.body) : null;
  }
  rows(store) {
    return this.db.prepare('SELECT body FROM entities WHERE store=? ORDER BY rowid').all(store).map(r => JSON.parse(r.body));
  }
  put(store, row) {
    this.db.prepare('INSERT INTO entities VALUES(?,?,?) ON CONFLICT(store,row_id) DO UPDATE SET body=excluded.body')
      .run(store, row.id || row.key, JSON.stringify(row));
  }
  account(email) { return this.db.prepare('SELECT * FROM accounts WHERE email=?').get(email.toLowerCase()); }
  saveIdentity(identity, password, now = Date.now()) {
    if (!identity?.id || !ROLES.includes(identity.role) || !identity.active) throw problem('Usuario no autorizado.', 403);
    const record = passwordRecord(password);
    this.db.prepare(`INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      email=excluded.email,name=excluded.name,role=excluded.role,active=excluded.active,
      remote_id=excluded.remote_id,salt=excluded.salt,hash=excluded.hash,validated_at=excluded.validated_at`)
      .run(identity.id, identity.email.toLowerCase(), identity.name, identity.role, 1,
        identity.remote_id || identity.id, record.salt, record.hash, now);
    return this.account(identity.email);
  }
  disable(email) {
    const row = this.account(email);
    if (row) {
      this.db.prepare('UPDATE accounts SET active=0 WHERE id=?').run(row.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
    }
  }
  createSession(account, lifetimeMs) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
    const expiresAt = Date.now() + lifetimeMs;
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token), account.id, csrf, expiresAt);
    return { token, csrf, expiresAt, user: publicUser(account) };
  }
  session(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.db.prepare(`SELECT a.*,s.csrf,s.expires_at FROM sessions s
      JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1`)
      .get(digest(token), Date.now());
    return session && { user: publicUser(session), csrf: session.csrf, expiresAt: session.expires_at };
  }
  revoke(token) { if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); }
  bootstrap(user) {
    requireRole(user, ROLES);
    const data = {};
    for (const name of ['products', 'inventory', 'suppliers', 'settings', 'movements', 'orders']) {
      data[name] = this.rows(name).filter(row => !row.deleted_at);
    }
    if (user.role !== 'admin') {
      data.suppliers = []; data.movements = [];
      data.products = data.products.map(({ cost, codigo, ...row }) => row);
      data.inventory = data.inventory.map(({ unit_cost, ...row }) => row);
      data.settings = data.settings.map(row => ({ key: row.key, tax_rate: row.tax_rate, business_name: row.business_name }));
      if (user.role === 'cajero') data.orders = data.orders.filter(row => row.user_id === user.id)
        .map(row => ({ ...row, items: row.items.map(({ cost, ...item }) => item) }));
      else {
        data.products = data.products.map(({ price, ...row }) => row);
        data.orders = data.orders.map(row => ({ id: row.id, code: row.code, customer: row.customer,
          channel: row.channel, status: row.status, icon: row.icon, created_at: row.created_at,
          updated_at: row.updated_at, items_text: row.items_text,
          items: row.items.map(({ price, cost, ...item }) => item) }));
      }
    }
    data.users = user.role === 'admin'
      ? this.db.prepare('SELECT * FROM accounts').all().map(publicUser) : [user];
    return { data, revision: this.revision(), pendingCloud: this.pendingCloud(), cloudSync: 'pending-module' };
  }
  revision() { return Number(this.db.prepare('SELECT coalesce(max(seq),0) n FROM events').get().n); }
  pendingCloud() { return Number(this.db.prepare('SELECT count(*) n FROM cloud_outbox').get().n); }
  command(user, command) {
    if (!command || !uuidPattern.test(command.id || '') || typeof command.kind !== 'string') throw problem('Identificador de operación inválido.');
    const hash = digest(JSON.stringify({ kind: command.kind, payload: command.payload }));
    return this.transaction(() => {
      const allowed = { 'entity.upsert': ['admin'], 'inventory.entry': ['admin'],
        'order.create': ['admin', 'cajero'], 'order.advance': ROLES };
      requireRole(user, allowed[command.kind] || []);
      const prior = this.db.prepare('SELECT * FROM operations WHERE id=?').get(command.id);
      if (prior) {
        if (prior.actor_id !== user.id || prior.request_hash !== hash) throw problem('La operación ya existe con otro contenido.', 409);
        return { ...JSON.parse(prior.result), replayed: true };
      }
      requireRole(user, ROLES);
      const now = new Date().toISOString();
      let before = null, row, store;
      const payload = command.payload || {};
      if (command.kind === 'entity.upsert') {
        requireRole(user, ['admin']);
        store = payload.store;
        if (!ADMIN_STORES.has(store)) throw problem('Esta función administrativa no está disponible en el módulo local.', 409);
        const input = payload.row || {};
        const id = store === 'settings' ? 'app' : input.id;
        if (store !== 'settings' && !uuidPattern.test(id || '')) throw problem('Identificador de registro inválido.');
        before = this.get(store, id);
        const base = { id, created_at: before?.created_at || now, updated_at: now, deleted_at: input.deleted_at ? now : null };
        if (store === 'products') {
          if (!text(input.name)) throw problem('El nombre del producto es obligatorio.');
          row = { ...base, name: text(input.name), category: text(input.category, 60),
            price: round(number(input.price, { positive: true })), cost: round(number(input.cost)),
            available: input.available !== false, emoji: text(input.emoji, 8), color: text(input.color, 16) };
        } else if (store === 'inventory') {
          if (!text(input.name)) throw problem('El nombre del insumo es obligatorio.');
          if (before && Number(input.stock) !== before.stock) throw problem('Cambia existencias mediante una entrada o movimiento.', 409);
          if (!before && Number(input.stock) !== 0) throw problem('Crea el insumo con saldo cero y registra su entrada.');
          row = { ...base, name: text(input.name), category: text(input.category, 60), stock: before?.stock || 0,
            min: number(input.min), unit: text(input.unit, 12), unit_cost: round(number(input.unit_cost)) };
        } else if (store === 'suppliers') {
          if (!text(input.name)) throw problem('El nombre del proveedor es obligatorio.');
          row = { ...base, name: text(input.name), contact: text(input.contact), phone: text(input.phone, 30),
            email: text(input.email, 120), notes: text(input.notes, 300), active: input.active !== false };
        } else {
          const rate = number(input.tax_rate);
          if (rate > 1) throw problem('ITBIS fuera de rango.');
          row = { key: 'app', business_name: text(input.business_name), rnc: text(input.rnc, 30),
            address: text(input.address, 300), phone: text(input.phone, 30), tax_rate: rate,
            currency: 'RD$', notifications: input.notifications || {}, updated_at: now };
        }
      } else if (command.kind === 'order.create') {
        requireRole(user, ['admin', 'cajero']); store = 'orders';
        const input = payload.order || {};
        if (input.id !== command.id || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw problem('La orden debe contener productos válidos.');
        if (this.get(store, input.id)) throw problem('La orden ya existe.', 409);
        const items = input.items.map(item => {
          const product = this.get('products', item.product_id);
          if (!product || product.deleted_at || !product.available) throw problem('Producto no disponible.', 409);
          if (Number(item.price) !== product.price) throw problem('El precio cambió; revisa la orden pendiente antes de confirmar.', 409);
          return { product_id: product.id, name: product.name, price: product.price, cost: product.cost,
            qty: number(item.qty, { positive: true, integer: true }) };
        });
        const subtotal = round(items.reduce((n, i) => n + i.price * i.qty, 0));
        const rate = Number(this.get('settings', 'app')?.tax_rate ?? .18), tax = round(subtotal * rate);
        if (Number(input.total) !== round(subtotal + tax)) throw problem('El total cambió; revisa la operación pendiente.', 409);
        const max = this.rows('orders').reduce((n, o) => Math.max(n, Number(String(o.code).replace(/\D/g, '')) || 0), 1040);
        if (!['Efectivo', 'Tarjeta', 'Transferencia', 'Pendiente'].includes(input.payment_method)) throw problem('Método de pago no válido.');
        const paid = input.paid === true;
        if (paid && input.payment_method === 'Pendiente') throw problem('La orden pendiente no puede marcarse cobrada.');
        row = { id: input.id, code: `#${max + 1}`, user_id: user.id, customer: text(input.customer) || 'Mostrador',
          channel: ['Mostrador', 'Para llevar', 'Delivery'].includes(input.channel) ? input.channel : 'Mostrador',
          items, items_text: items.map(i => `${i.name} × ${i.qty}`).join(', '), status: 'Nueva', icon: 'new',
          payment_method: paid ? input.payment_method : 'Pendiente', subtotal, tax, total: round(subtotal + tax), paid,
          created_at: input.created_at || now, updated_at: now, deleted_at: null };
      } else if (command.kind === 'order.advance') {
        requireRole(user, ['admin', 'cajero', 'cocina']); store = 'orders';
        before = this.get(store, payload.id);
        if (!before || (user.role === 'cajero' && before.user_id !== user.id)) throw problem('Orden no disponible.', 403);
        if (before.status !== payload.expectedStatus || !FLOW[before.status]) throw problem('La orden ya cambió; actualiza cocina.', 409);
        row = { ...before, status: FLOW[before.status], updated_at: now };
      } else if (command.kind === 'inventory.entry') {
        requireRole(user, ['admin']); store = 'inventory'; before = this.get(store, payload.itemId);
        if (!before || before.deleted_at) throw problem('Insumo no encontrado.');
        if (payload.unit && payload.unit !== before.unit) throw problem('La unidad no coincide con la unidad del insumo.');
        const quantity = number(payload.quantity, { positive: true });
        const unitCost = payload.unitCost === '' || payload.unitCost == null ? before.unit_cost : number(payload.unitCost);
        row = { ...before, stock: round(before.stock + quantity), unit_cost: round(unitCost), updated_at: now };
        const movement = { id: command.id, type: 'entrada', item_id: before.id, item_name: before.name,
          quantity, unit: before.unit, unit_cost: row.unit_cost, total: round(quantity * unitCost),
          stock_before: before.stock, stock_after: row.stock, user_id: user.id, user_name: user.name,
          supplier_id: payload.supplierId || null, note: text(payload.note, 300), created_at: now, updated_at: now, deleted_at: null };
        this.put('movements', movement);
      } else throw problem('Operación local no reconocida.');
      this.put(store, row);
      const result = { row, store, operationId: command.id };
      this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?)').run(command.id, user.id, command.kind, hash, JSON.stringify(result), now);
      this.db.prepare('INSERT INTO cloud_outbox VALUES(?,?,?)').run(command.id, JSON.stringify({ ...command, actor_id: user.id, result }), now);
      this.db.prepare('INSERT INTO audit(actor_id,operation_id,kind,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)')
        .run(user.id, command.id, command.kind, before ? JSON.stringify(before) : null, JSON.stringify(row), now);
      this.db.prepare('INSERT INTO events(kind,created_at) VALUES(?,?)').run(command.kind, now);
      return result;
    });
  }
}
