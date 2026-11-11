import { state } from './state.js';
import { STORES, dbGetAll, dbPut } from './db.js';
import { restRequest } from './supabase.js';
import { requireRole } from './permissions.js';
import { localEnabled } from './local-client.js';
import { uid, round2 } from './utils.js';

export function currentCashSession() {
  const owner = state.user?.remote_id || state.user?.id;
  return (state.cash_sessions || []).find(row => row.usuario_id === owner && row.estado === 'abierta' && !row.deleted_at) || null;
}

export async function refreshCashSessions() {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('La apertura de caja LAN requiere integrar las sesiones en el servicio local.');
  if (state.user.remote_id) {
    const rows = await restRequest(`caja_sesiones?usuario_id=eq.${encodeURIComponent(state.user.remote_id)}&order=fecha_apertura.desc&limit=100`);
    if (!Array.isArray(rows)) throw new Error('Respuesta de caja inválida.');
    for (const cached of await dbGetAll(STORES.CASH_SESSIONS)) {
      if (!cached.demo && cached.usuario_id === state.user.remote_id && cached.estado === 'abierta' && !rows.some(row => row.id === cached.id)) {
        await dbPut(STORES.CASH_SESSIONS, { ...cached, estado: 'no_disponible' });
      }
    }
    for (const row of rows) await dbPut(STORES.CASH_SESSIONS, row);
  }
  state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
  return currentCashSession();
}

export async function openCashSession(amount, operationId) {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('La apertura de caja LAN aún no está integrada.');
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value > 99999999.99 || round2(value) !== value) {
    throw new Error('Indica un monto inicial válido con hasta dos decimales.');
  }
  const existing = currentCashSession();
  if (existing) return existing;
  const id = operationId || uid();
  let row;
  if (state.user.remote_id) {
    if (!navigator.onLine) throw new Error('Conéctate para confirmar la apertura de caja en Supabase.');
    row = await restRequest('rpc/abrir_caja', { method: 'POST', body: { p_id: id, p_monto: value } });
    if (!row?.id || row.usuario_id !== state.user.remote_id || row.estado !== 'abierta') {
      throw new Error('Supabase no confirmó la apertura. Reintenta la misma operación.');
    }
  } else {
    row = { id, usuario_id: state.user.id, monto_inicial: value, estado: 'abierta',
      fecha_apertura: new Date().toISOString(), demo: true };
  }
  await dbPut(STORES.CASH_SESSIONS, row);
  state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
  return row;
}
