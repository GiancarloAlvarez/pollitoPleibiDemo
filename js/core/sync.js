import { STORES, dbGetAll, dbPut, dbDelete, dbGet, dbCount } from './db.js';
import { uid } from './utils.js';
import { getSupabaseConfig, isSupabaseConfigured } from '../config.js';
import { upsertRow, deleteRow, pullRows, restRequest } from './supabase.js';
import { toRemote, remoteDetailRowsFor, pagoRow, fromRemote, REMOTE_TABLES, PUSH_RANK } from './schema-map.js';
import { localEnabled, localStatus, flushLocalCommands } from './local-client.js';

const LAST_SYNC_KEY = 'last_sync';
const PULL_TABLES = ['products', 'orders', 'inventory', 'suppliers', 'users', 'movements', 'settings'];
let status = {
  state: 'local',
  pending: 0,
  lastSync: null,
  message: 'Modo local',
  syncing: false,
};

let timer = null;
let interval = null;
let started = false;

function emit() {
  window.dispatchEvent(new CustomEvent('sync:status', { detail: { ...status } }));
}

function setStatus(patch) {
  status = { ...status, ...patch };
  emit();
}

export function getSyncStatus() {
  return { ...status };
}

export async function refreshPending() {
  try {
    if (localEnabled()) {
      const lan = localStatus();
      setStatus({ state: lan.connected ? 'lan' : 'offline', pending: lan.pendingLocal,
        pendingCloud: lan.pendingCloud, message: lan.message });
      return lan.pendingLocal;
    }
    const pending = await dbCount(STORES.OUTBOX);
    const configured = isSupabaseConfigured();
    const state = !configured ? 'local' : !navigator.onLine ? 'offline' : pending ? 'pending' : status.state === 'error' ? 'error' : 'synced';
    setStatus({ pending, state });
    const badge = document.querySelector('[data-sync-badge]');
    if (badge) renderBadge(badge);
    return pending;
  } catch (error) {
    return status.pending;
  }
}

export function renderBadge(element) {
  if (!element) return;
  const labels = {
    local: 'Modo local',
    offline: 'Sin conexión',
    pending: `${status.pending} pendientes`,
    syncing: 'Sincronizando…',
    synced: 'Sincronizado',
    error: 'Error de sync',
    lan: status.pending ? `${status.pending} pendientes LAN` : `Red local · ${status.pendingCloud || 0} pendientes nube`,
  };
  element.className = `sync-status ${status.state}`;
  element.innerHTML = `<i></i><span>${labels[status.state] || 'Modo local'}</span>`;
  element.title = status.message || labels[status.state] || '';
}

export async function queueChange(table, op, payload) {
  const entry = {
    id: uid(),
    table,
    op,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  await dbPut(STORES.OUTBOX, entry);
  await refreshPending();
  if (isSupabaseConfigured() && navigator.onLine) scheduleSync(1200);
  return entry;
}

export function scheduleSync(delay = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncNow({ silent: true });
  }, delay);
}

async function mapTable(logical) {
  const config = getSupabaseConfig();
  return (config.tables && config.tables[logical]) || REMOTE_TABLES[logical] || logical;
}

async function pushOrderCompound(order, attempt = 0) {
  if (order.demo_sale) throw new Error('Venta de caja demo: permanece local y no se envía al proyecto real.');
  const payload = toRemote('orders', order);
  if (attempt) delete payload.numero_orden;
  const compound = remoteDetailRowsFor(order);
  if (!compound.length) throw new Error('Orden sin detalles: se conserva pendiente para revisión.');
  const payment = pagoRow(order);
  try {
    await upsertRow(await mapTable('orders'), payload, 'id');
  } catch (error) {
    const message = String((error && error.message) || '');
    if (attempt === 0 && message.includes('uq_ordenes_numero')) {
      await pushOrderCompound(order, 1);
      return;
    }
    throw error;
  }
  for (const detail of compound) {
    await upsertRow(await mapTable('order_details'), detail, 'id');
  }
  if (payment) await upsertRow(await mapTable('payments'), payment, 'id');
  const table = await mapTable('orders');
  const detailsTable = await mapTable('order_details');
  const paymentsTable = await mapTable('payments');
  const rows = await restRequest(`${table}?id=eq.${encodeURIComponent(order.id)}&select=*,${detailsTable}(*),${paymentsTable}(*)`);
  const confirmed = rows?.[0];
  const equivalent = (left, right) => left && typeof left === 'object'
    ? Object.keys(left).length === Object.keys(right || {}).length && Object.entries(left).every(([key, value]) => equivalent(value, right?.[key]))
    : String(left ?? '') === String(right ?? '');
  const matches = (expected, actual) => actual && Object.entries(expected).every(([key, value]) =>
    ['creado_en', 'updated_at', 'numero_orden'].includes(key) || equivalent(value, actual[key]));
  if (!matches(payload, confirmed) || confirmed[detailsTable]?.length !== compound.length
      || !compound.every(detail => matches(detail, confirmed[detailsTable]?.find(row => row.id === detail.id)))
      || (payment ? confirmed[paymentsTable]?.length !== 1 || !matches(payment, confirmed[paymentsTable]?.find(row => row.id === payment.id))
        : confirmed[paymentsTable]?.length !== 0)) {
    throw new Error('Supabase no confirmó la orden completa; se conserva el pendiente.');
  }
}

function pushUnsupported(entry, reason) {
  if (reason) setStatus({ message: `Sync: ${reason} (guardado local)` });
  return dbDelete(STORES.OUTBOX, entry.id);
}

async function pushOutbox() {
  const entries = await dbGetAll(STORES.OUTBOX);
  entries.sort((a, b) => {
    const byTime = String(a.created_at).localeCompare(String(b.created_at));
    if (byTime !== 0) return byTime;
    return (PUSH_RANK[a.table] ?? 99) - (PUSH_RANK[b.table] ?? 99);
  });
  if (!entries.length) return 0;
  const users = await dbGetAll(STORES.USERS);
  const usersById = new Map(users.map(user => [String(user.id), user]));
  let pushed = 0;
  let skipped = 0;
  for (const entry of entries) {
    const ctx = {};
    // Conservar ventas demo para respaldo, sin enviarlas ni bloquear ventas reales.
    if (entry.table === 'orders' && entry.payload.demo_sale) {
      skipped += 1;
      continue;
    }
    try {
      if (entry.op === 'delete') {
        const key = entry.table === 'users' ? (entry.payload.remote_id || entry.payload.id) : entry.payload.id;
        await deleteRow(await mapTable(entry.table), key);
      } else if (entry.table === 'users') {
        if (!entry.payload.remote_id) {
          await pushUnsupported(entry, 'usuario demo sin identidad de Supabase');
          skipped += 1;
          setStatus({ pending: entries.length - pushed - skipped });
          continue;
        }
        await upsertRow(await mapTable('users'), toRemote('users', entry.payload, ctx), 'id');
      } else if (entry.table === 'orders') {
        const owner = usersById.get(String(entry.payload.user_id));
        await pushOrderCompound({ ...entry.payload, remote_user_id: entry.payload.remote_user_id || owner?.remote_id || null });
      } else if (entry.table === 'movements') {
        const owner = entry.payload.user_id ? usersById.get(String(entry.payload.user_id)) : null;
        if (!owner || !owner.remote_id) {
          await pushUnsupported(entry, 'movimiento de un usuario sin identidad de Supabase');
          skipped += 1;
          setStatus({ pending: entries.length - pushed - skipped });
          continue;
        }
        const payload = toRemote('movements', { ...entry.payload, remote_user_id: owner.remote_id }, ctx);
        await upsertRow(await mapTable('movements'), payload, 'id');
      } else {
        await upsertRow(await mapTable(entry.table), toRemote(entry.table, entry.payload, ctx), entry.payload.key ? 'key' : 'id');
      }
      await dbDelete(STORES.OUTBOX, entry.id);
      pushed += 1;
      setStatus({ pending: entries.length - pushed - skipped, state: 'syncing' });
    } catch (error) {
      const row = { ...entry, attempts: (entry.attempts || 0) + 1 };
      await dbPut(STORES.OUTBOX, row);
      throw error;
    }
  }
  return pushed;
}

async function findLocalRow(logical, remote) {
  if (logical === 'settings') return dbGet(STORES.SETTINGS, remote.key);
  if (logical === 'users') {
    const users = await dbGetAll(STORES.USERS);
    return users.find(user => user.remote_id === remote.id || user.id === remote.id) || null;
  }
  return dbGet(STORES[logical.toUpperCase()], remote.id);
}

async function pullChanges() {
  const startedAt = new Date().toISOString();
  const meta = await dbGet(STORES.META, LAST_SYNC_KEY);
  const since = meta && meta.value ? meta.value : '1970-01-01T00:00:00.000Z';
  let changed = false;
  const pending = await dbGetAll(STORES.OUTBOX);
  for (const logical of PULL_TABLES) {
    const table = await mapTable(logical);
    const select = logical === 'orders' ? '*,orden_detalles(*)' : '*';
    let rows;
    try {
      rows = await pullRows(table, since, select);
    } catch (error) {
      if (logical === 'orders') throw error;
      if (error.status === 404) continue;
      if (error.status === 400 || error.status === 401 || error.status === 403) continue;
      throw error;
    }
    if (!Array.isArray(rows) || !rows.length) continue;
    const prepared = [];
    for (const remote of rows) {
      if (pending.some(entry => entry.table === logical && entry.payload.id === remote.id)) continue;
      const remoteTime = Date.parse(remote.updated_at || 0) || 0;
      const local = await findLocalRow(logical, remote);
      const localTime = Date.parse(local && local.updated_at ? local.updated_at : 0) || 0;
      if (local && localTime > remoteTime) continue;
      let merged;
      if (logical === 'users') {
        merged = { ...fromRemote('users', remote, local) };
        if (local) merged = { ...local, ...merged, password_hash: local.password_hash, password_salt: local.password_salt };
      } else {
        merged = fromRemote(logical, remote, local);
      }
      prepared.push(merged);
    }
    if (prepared.length) {
      const { dbPutMany } = await import('./db.js');
      await dbPutMany(STORES[logical.toUpperCase()], prepared);
      changed = true;
    }
  }
  await dbPut(STORES.META, { key: LAST_SYNC_KEY, value: startedAt });
  setStatus({ lastSync: startedAt });
  if (changed) {
    window.dispatchEvent(new CustomEvent('sync:data'));
  }
  return changed;
}

export async function syncNow(options = {}) {
  if (localEnabled()) {
    try { await flushLocalCommands(); await refreshPending(); return { ok: true, scope: 'lan', cloudConfirmed: false }; }
    catch (error) { await refreshPending(); return { ok: false, reason: 'lan', error }; }
  }
  if (status.syncing) return { ok: false, reason: 'busy' };
  if (!isSupabaseConfigured()) {
    await refreshPending();
    setStatus({ state: 'local', message: 'Supabase no está configurado. Los datos se guardan en este dispositivo.' });
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('sync:toast', { detail: { message: 'Modo local: configura Supabase para sincronizar.', type: 'warning' } }));
    }
    return { ok: false, reason: 'local' };
  }
  if (!navigator.onLine) {
    await refreshPending();
    setStatus({ state: 'offline', message: 'Sin conexión. Los cambios se enviarán al reconectar.' });
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('sync:toast', { detail: { message: 'Sin conexión. Trabajando offline.', type: 'warning' } }));
    }
    return { ok: false, reason: 'offline' };
  }
  setStatus({ syncing: true, state: 'syncing', message: 'Sincronizando con Supabase…' });
  try {
    await pushOutbox();
    await pullChanges();
    await refreshPending();
    setStatus({ syncing: false, state: status.pending ? 'pending' : 'synced', message: status.pending
      ? `${status.pending} operaciones permanecen locales o pendientes; las ventas demo no se envían.` : 'Sincronizado con Supabase.' });
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('sync:toast', { detail: { message: status.message, type: status.pending ? 'warning' : 'success' } }));
    }
    return { ok: true };
  } catch (error) {
    setStatus({ syncing: false, state: 'error', message: error.message || 'Error al sincronizar.' });
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('sync:toast', { detail: { message: `No se pudo sincronizar: ${error.message}`, type: 'error' } }));
    }
    return { ok: false, reason: 'error', error };
  }
}

export async function initSync() {
  if (started) return;
  started = true;
  if (localEnabled()) {
    window.addEventListener('lan:status', () => refreshPending());
    await refreshPending();
    return;
  }
  await refreshPending();
  window.addEventListener('online', () => {
    setStatus({ state: 'pending', message: 'Conexión restablecida.' });
    scheduleSync(400);
  });
  window.addEventListener('offline', () => {
    setStatus({ state: 'offline', message: 'Sin conexión. Trabajando offline.' });
    emit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSupabaseConfigured()) scheduleSync(600);
  });
  clearInterval(interval);
  interval = setInterval(() => {
    if (document.visibilityState === 'visible' && isSupabaseConfigured()) syncNow({ silent: true });
  }, 60000);
  if (isSupabaseConfigured()) scheduleSync(1500);
  await refreshPending();
}
