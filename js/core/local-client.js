import { STORES, dbGet, dbGetAll, dbPut, dbDelete, dbAtomicPut } from './db.js';
import { uid } from './utils.js';

const PIN = 'pollito-lan-enabled';
let active = false, session = null, csrf = '', snapshot = null, stream = null;
let flushing = false, interval = null, fetching = null;
let status = { connected: false, demo: false, pendingLocal: 0, pendingCloud: 0, message: 'Servicio local no detectado.' };
export const localEnabled = () => active;
export const localStatus = () => ({ ...status });
export const localData = () => snapshot || { products: [], orders: [], inventory: [], suppliers: [], users: [], movements: [], settings: [] };
function emit(patch = {}) {
  status = { ...status, ...patch };
  window.dispatchEvent(new CustomEvent('lan:status', { detail: localStatus() }));
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch('/api/local/' + path, { credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(5000), ...options,
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Pollito-CSRF': csrf } : {}), ...options.headers } });
  } catch { throw Object.assign(new Error('No se pudo alcanzar el servicio de la red local.'), { network: true }); }
  let data; try { data = await response.json(); } catch { throw Object.assign(new Error('El servicio local no respondió correctamente.'), { status: response.status }); }
  if (!response.ok) throw Object.assign(new Error(data.message || 'No se completó la operación local.'), { status: response.status });
  return data;
}
export async function initLocalService() {
  try {
    const info = await request('status');
    active = info.service === 'pollito-local' && info.version === 1;
    if (active) {
      localStorage.setItem(PIN, 'true');
      emit({ connected: true, demo: info.demo, message: info.demo ? 'Demostración de red local.' : 'Servicio de red local disponible.' });
    }
  } catch {
    // Un servicio configurado no cae silenciosamente al login/servidor demo anterior.
    active = localStorage.getItem(PIN) === 'true';
  }
  if (active && !interval) {
    interval = setInterval(() => { if (session) flushLocalCommands().catch(() => {}); }, 5000);
    window.addEventListener('online', () => { if (session) flushLocalCommands().catch(() => {}); });
    document.addEventListener('visibilitychange', () => {
      if (session && document.visibilityState === 'visible') flushLocalCommands().catch(() => {});
    });
  }
  return active;
}
function watchEvents() {
  stream?.close();
  stream = new EventSource('/api/local/events');
  stream.addEventListener('ready', () => refreshLocalData().catch(() => {}));
  stream.addEventListener('change', () => refreshLocalData().catch(() => {}));
  stream.onerror = () => emit({ connected: false, message: 'Conexión LAN interrumpida. Reintentando; cocina puede no haber recibido la operación.' });
}
export async function localLogin(email, password) {
  const auth = await request('login', { method: 'POST', body: JSON.stringify({ email, password }) });
  session = { user: auth.user, expiresAt: auth.expiresAt }; csrf = auth.csrf;
  await dbPut(STORES.META, { key: 'lan_session', value: session });
  await refreshLocalData(); watchEvents();
  return auth.user;
}
export async function restoreLocalSession() {
  try {
    const auth = await request('session'); session = { user: auth.user, expiresAt: auth.expiresAt }; csrf = auth.csrf;
    await dbPut(STORES.META, { key: 'lan_session', value: session });
    await refreshLocalData(); watchEvents(); return auth.user;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      session = null; await dbDelete(STORES.META, 'lan_session'); return null;
    }
    const cached = await dbGet(STORES.META, 'lan_session');
    if (!cached?.value || cached.value.expiresAt <= Date.now()) return null;
    session = cached.value;
    snapshot = (await dbGet(STORES.META, 'lan_snapshot_' + session.user.id))?.value || null;
    emit({ connected: false, message: 'Servidor LAN no disponible; operaciones nuevas quedarán en este dispositivo.' });
    return snapshot ? session.user : null;
  }
}
export async function localLogout() {
  // Si no puede revocarse la cookie del servidor, no fingir un cierre remoto exitoso.
  await request('logout', { method: 'POST', body: '{}' });
  stream?.close(); stream = null; csrf = ''; snapshot = null; session = null;
  await dbDelete(STORES.META, 'lan_session');
}
export async function refreshLocalData() {
  if (!session) return;
  if (fetching) return fetching;
  fetching = (async () => {
    const data = await request('bootstrap');
    const pending = (await dbGetAll(STORES.LAN_OUTBOX)).filter(e => e.actor_id === session.user.id);
    snapshot = data.data;
    for (const entry of pending) {
      for (const { store, row } of [{ store: entry.store, row: entry.localRow }, ...(entry.extraRows || [])]) {
        if (!row || !snapshot[store]) continue;
        const index = snapshot[store].findIndex(r => (r.id || r.key) === (row.id || row.key));
        // Un ACK perdido no reemplaza un registro ya confirmado por la copia provisional.
        if (index < 0) snapshot[store].push(row);
      }
    }
    await dbPut(STORES.META, { key: 'lan_snapshot_' + session.user.id, value: snapshot });
    emit({ connected: true, pendingLocal: pending.length, pendingCloud: data.pendingCloud,
      message: `Red local disponible. ${data.pendingCloud} operaciones pendientes del módulo de envío a Supabase.` });
    window.dispatchEvent(new Event('lan:data'));
  })();
  try { return await fetching; }
  catch (e) { emit({ connected: false, message: e.message }); throw e; }
  finally { fetching = null; }
}
export async function localCommand(kind, payload, { row = null, store = null, id = uid(), extraRows = [] } = {}) {
  if (!session || session.expiresAt <= Date.now()) throw new Error('La sesión local venció. Inicia sesión de nuevo.');
  const command = { id, kind, payload };
  try {
    const result = await request('commands', { method: 'POST', body: JSON.stringify(command) });
    await refreshLocalData();
    return result.row;
  } catch (error) {
    if (!error.network) throw error;
    const entry = { ...command, actor_id: session.user.id, localRow: row, store, extraRows, created_at: new Date().toISOString() };
    const next = structuredClone(localData());
    if (row && next[store]) {
      const index = next[store].findIndex(r => (r.id || r.key) === (row.id || row.key));
      if (index < 0) next[store].push(row); else next[store][index] = row;
    }
    for (const extra of extraRows) {
      if (next[extra.store] && !next[extra.store].some(r => r.id === extra.row.id)) next[extra.store].push(extra.row);
    }
    await dbAtomicPut([{ store: STORES.LAN_OUTBOX, value: entry },
      { store: STORES.META, value: { key: 'lan_snapshot_' + session.user.id, value: next } }]);
    snapshot = next;
    emit({ connected: false, pendingLocal: (await dbGetAll(STORES.LAN_OUTBOX)).length,
      message: 'Guardado en este dispositivo; todavía no confirmado por la red local ni recibido por cocina.' });
    window.dispatchEvent(new Event('lan:data'));
    return row;
  }
}
export async function flushLocalCommands() {
  if (!session || flushing) return;
  flushing = true;
  try {
    // Recuperar CSRF/cookie después de recarga o reinicio antes de reenviar.
    const auth = await request('session'); csrf = auth.csrf;
    if (auth.user.id !== session.user.id) throw new Error('La cola pertenece a otro usuario.');
    const pending = (await dbGetAll(STORES.LAN_OUTBOX)).filter(e => e.actor_id === session.user.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const entry of pending) {
      await request('commands', { method: 'POST', body: JSON.stringify({ id: entry.id, kind: entry.kind, payload: entry.payload }) });
      await dbDelete(STORES.LAN_OUTBOX, entry.id);
    }
    await refreshLocalData();
    if (!stream || stream.readyState === EventSource.CLOSED) watchEvents();
  } catch (error) {
    emit({ connected: error.network ? false : status.connected,
      message: error.status === 409 ? `Conflicto conservado en la cola: ${error.message}` : error.message });
    throw error;
  } finally { flushing = false; }
}
