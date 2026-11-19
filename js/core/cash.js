import { state } from './state.js';
import { STORES, dbGetAll, dbPut } from './db.js';
import { restRequest } from './supabase.js';
import { requireRole } from './permissions.js';
import { localEnabled } from './local-client.js';
import { uid, round2 } from './utils.js';

const MAX_AMOUNT = 99999999.99;
const CASH_METHOD = 'efectivo';

export function currentCashSession() {
  const owner = state.user?.remote_id || state.user?.id;
  return (state.cash_sessions || []).find(row => row.usuario_id === owner && row.estado === 'abierta' && !row.deleted_at) || null;
}

export function cashHistory(limit = 10) {
  const owner = state.user?.remote_id || state.user?.id;
  return (state.cash_sessions || [])
    .filter(row => row.usuario_id === owner && !row.deleted_at)
    .sort((a, b) => String(b.fecha_apertura || '').localeCompare(String(a.fecha_apertura || '')))
    .slice(0, limit);
}

function validAmount(value, label, allowZero = true) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount > MAX_AMOUNT || round2(amount) !== amount) {
    throw new Error(`${label} inválido. Usa hasta dos decimales.`);
  }
  if (allowZero ? amount < 0 : amount <= 0) throw new Error(`${label} inválido.`);
  return amount;
}

function requireOnline(message) {
  if (!navigator.onLine) throw new Error(message);
}

function isDemoSession(session) {
  return session?.demo === true || !state.user?.remote_id;
}

function sessionOrders(session) {
  return (state.orders || []).filter(order => !order.deleted_at && order.status !== 'Anulada'
    && (order.local_cash_session_id === session.id || order.cash_session_id === session.id));
}

function sumAmount(rows) {
  return round2((rows || []).reduce((total, row) => total + (Number(row.monto) || 0), 0));
}

function demoSummary(session) {
  const paidCash = sessionOrders(session).filter(order => order.paid === true
    && String(order.payment_method || '').toLowerCase() === CASH_METHOD);
  const movements = Array.isArray(session.movements) ? session.movements : [];
  const expenses = Array.isArray(session.expenses) ? session.expenses : [];
  const cobros = round2(paidCash.reduce((total, order) => total + (Number(order.total) || 0), 0));
  const propinas = round2(paidCash.reduce((total, order) => total + (Number(order.tip) || 0), 0));
  const entradas = sumAmount(movements.filter(movement => movement.tipo === 'entrada'));
  const retiros = sumAmount(movements.filter(movement => movement.tipo === 'retiro'));
  const gastos = sumAmount(expenses);
  const inicial = Number(session.monto_inicial) || 0;
  return {
    sesion_id: session.id,
    estado: session.estado,
    usuario_id: session.usuario_id,
    monto_inicial: inicial,
    cobros_efectivo: cobros,
    propinas_efectivo: propinas,
    entradas,
    retiros,
    gastos_caja: gastos,
    esperado: round2(inicial + cobros + entradas - retiros - gastos),
    monto_declarado: session.monto_declarado ?? null,
    diferencia: session.diferencia ?? null,
    fecha_apertura: session.fecha_apertura || null,
    fecha_cierre: session.fecha_cierre || null,
    notas: session.notas || null,
  };
}

export async function refreshCashSessions() {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('La caja LAN requiere integrar las sesiones en el servicio local.');
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
  const value = validAmount(amount, 'Monto inicial');
  const existing = currentCashSession();
  if (existing) return existing;
  const id = operationId || uid();
  let row;
  if (state.user.remote_id) {
    requireOnline('Conéctate para confirmar la apertura de caja en Supabase.');
    row = await restRequest('rpc/abrir_caja', { method: 'POST', body: { p_id: id, p_monto: value } });
    if (!row?.id || row.usuario_id !== state.user.remote_id || row.estado !== 'abierta') {
      throw new Error('Supabase no confirmó la apertura. Reintenta la misma operación.');
    }
  } else {
    row = {
      id, usuario_id: state.user.id, monto_inicial: value, estado: 'abierta',
      fecha_apertura: new Date().toISOString(), demo: true, movements: [], expenses: [],
    };
  }
  await dbPut(STORES.CASH_SESSIONS, row);
  state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
  return row;
}

export async function cashSummary(session = currentCashSession()) {
  requireRole(['admin', 'cajero']);
  if (!session) return null;
  if (isDemoSession(session)) return demoSummary(session);
  const result = await restRequest('rpc/resumen_caja', {
    method: 'POST', body: { p_sesion_id: session.id },
  });
  if (!result?.sesion_id) throw new Error('Supabase no devolvió el arqueo de la caja.');
  return result;
}

export async function closeCashSession({ sessionId, declared, notes = null } = {}) {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('El cierre de caja LAN aún no está integrado.');
  const session = currentCashSession();
  if (!session) throw new Error('No hay una caja abierta para cerrar.');
  if (sessionId && sessionId !== session.id) throw new Error('La caja abierta cambió. Vuelve a consultar el arqueo.');
  if (declared == null || String(declared).trim() === '') throw new Error('Indica el efectivo contado.');
  const value = validAmount(declared, 'Monto declarado');
  const cleanNotes = String(notes || '').trim().slice(0, 500) || null;
  if (isDemoSession(session)) {
    const summary = demoSummary(session);
    const now = new Date().toISOString();
    const closed = {
      ...session,
      estado: 'cerrada',
      monto_esperado: summary.esperado,
      monto_declarado: value,
      diferencia: round2(value - summary.esperado),
      notas: cleanNotes,
      fecha_cierre: now,
      updated_at: now,
    };
    await dbPut(STORES.CASH_SESSIONS, closed);
    state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
    return { row: closed, summary: demoSummary(closed) };
  }
  requireOnline('Conéctate para confirmar el cierre de caja en Supabase.');
  const pending = await dbGetAll(STORES.OUTBOX);
  if (pending.some(entry => entry.table === 'orders' && entry.payload?.cash_session_id === session.id)) {
    throw new Error('Esta caja tiene órdenes pendientes de sincronizar en este dispositivo. Sincronízalas antes de cerrar.');
  }
  const result = await restRequest('rpc/cerrar_caja', {
    method: 'POST',
    body: { p_sesion_id: session.id, p_declarado: value, p_notas: cleanNotes },
  });
  if (result?.sesion_id !== session.id || result.estado !== 'cerrada' || result.monto_declarado == null || Number(result.monto_declarado) !== value) {
    throw new Error('Supabase no confirmó el cierre. Reintenta el mismo arqueo.');
  }
  const row = { ...session, ...result, estado: 'cerrada' };
  await dbPut(STORES.CASH_SESSIONS, row);
  state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
  return { row, summary: result };
}

function saveDemoMovement(session, movement) {
  const movements = Array.isArray(session.movements) ? session.movements : [];
  if (movements.some(row => row.id === movement.id)) return session;
  return { ...session, movements: [...movements, movement] };
}

function saveDemoExpense(session, expense) {
  const expenses = Array.isArray(session.expenses) ? session.expenses : [];
  if (expenses.some(row => row.id === expense.id)) return session;
  return { ...session, expenses: [...expenses, expense] };
}

export async function registerCashMovement({ type, amount, concept, operationId } = {}) {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('Los movimientos de caja LAN aún no están integrados.');
  const session = currentCashSession();
  if (!session) throw new Error('No hay una caja abierta.');
  const kind = String(type || '');
  if (!['entrada', 'retiro'].includes(kind)) throw new Error('Selecciona entrada o retiro.');
  const value = validAmount(amount, 'Monto del movimiento', false);
  const cleanConcept = String(concept || '').trim();
  if (!cleanConcept) throw new Error('Indica el concepto del movimiento.');
  if (cleanConcept.length > 200) throw new Error('El concepto es demasiado largo.');
  const id = operationId || uid();
  if (isDemoSession(session)) {
    const movement = { id, caja_sesion_id: session.id, tipo: kind, monto: value, concepto: cleanConcept,
      usuario_id: session.usuario_id, fecha: new Date().toISOString() };
    await dbPut(STORES.CASH_SESSIONS, saveDemoMovement(session, movement));
    state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
    return movement;
  }
  requireOnline('Conéctate para registrar el movimiento de caja en Supabase.');
  const row = await restRequest('rpc/registrar_movimiento_caja', {
    method: 'POST',
    body: { p_id: id, p_sesion_id: session.id, p_tipo: kind, p_monto: value, p_concepto: cleanConcept },
  });
  if (!row?.id) throw new Error('Supabase no confirmó el movimiento. Reintenta la misma operación.');
  return row;
}

export async function registerCashExpense({ category, amount, description = '', operationId } = {}) {
  requireRole(['admin', 'cajero']);
  if (localEnabled()) throw new Error('Los gastos de caja LAN aún no están integrados.');
  const session = currentCashSession();
  if (!session) throw new Error('No hay una caja abierta.');
  const cleanCategory = String(category || '').trim();
  if (!cleanCategory) throw new Error('Indica la categoría del gasto.');
  if (cleanCategory.length > 50) throw new Error('La categoría es demasiado larga.');
  const value = validAmount(amount, 'Monto del gasto', false);
  const cleanDescription = String(description || '').trim();
  if (cleanDescription.length > 300) throw new Error('La descripción es demasiado larga.');
  const id = operationId || uid();
  if (isDemoSession(session)) {
    const expense = { id, categoria: cleanCategory, descripcion: cleanDescription || null, monto: value,
      usuario_id: session.usuario_id, salio_de_caja: true, caja_sesion_id: session.id,
      fecha: new Date().toISOString() };
    await dbPut(STORES.CASH_SESSIONS, saveDemoExpense(session, expense));
    state.cash_sessions = await dbGetAll(STORES.CASH_SESSIONS);
    return expense;
  }
  requireOnline('Conéctate para registrar el gasto de caja en Supabase.');
  const row = await restRequest('rpc/registrar_gasto_caja', {
    method: 'POST',
    body: { p_id: id, p_sesion_id: session.id, p_categoria: cleanCategory,
      p_monto: value, p_descripcion: cleanDescription },
  });
  if (!row?.id) throw new Error('Supabase no confirmó el gasto. Reintenta la misma operación.');
  return row;
}
