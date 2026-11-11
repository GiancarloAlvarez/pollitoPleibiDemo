import { getSupabaseConfig, isSupabaseConfigured } from '../config.js';

const SESSION_KEY = 'pollito-supabase-session';

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function writeSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function networkError(error) {
  const wrapped = new Error(error && error.message ? error.message : 'Sin conexión con Supabase');
  wrapped.network = true;
  return wrapped;
}

function sessionRequired() {
  const error = new Error('No hay una sesión vigente de Supabase. Inicia sesión con tu cuenta de Supabase para sincronizar; una cuenta local/demo no autoriza escrituras. Los pendientes se conservan.');
  error.code = 'AUTH_SESSION_REQUIRED';
  return error;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }
  if (!response.ok) {
    const message = (data && (data.error_description || data.msg || data.message || data.error)) || `Error ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function configured() {
  return isSupabaseConfigured();
}

export function session() {
  return readSession();
}

export function clearSession() {
  writeSession(null);
}

export async function refreshSession() {
  const current = readSession();
  if (!current || !current.refresh_token) return null;
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) return null;
  let response;
  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
  } catch (error) {
    throw networkError(error);
  }
  const data = await parseResponse(response);
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || current.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: data.user || current.user,
  };
  writeSession(next);
  return next;
}

export async function accessToken() {
  const current = readSession();
  if (!current) return null;
  if (current.expires_at && current.expires_at - Date.now() < 60000 && current.refresh_token) {
    try {
      const refreshed = await refreshSession();
      return refreshed ? refreshed.access_token : current.access_token;
    } catch (error) {
      if (error.network) throw error;
      // No reutilizar un token vencido tras un refresh rechazado.
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        clearSession();
        throw sessionRequired();
      }
      throw error;
    }
  }
  if (current.expires_at && current.expires_at <= Date.now()) throw sessionRequired();
  return current.access_token;
}

export async function signIn(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) throw new Error('Supabase no está configurado.');
  let response;
  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    throw networkError(error);
  }
  const data = await parseResponse(response);
  const stored = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: data.user,
  };
  writeSession(stored);
  return stored;
}

export async function signOut() {
  clearSession();
}

export async function testConnection() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) return { ok: false, message: 'Configura la URL y la anon key.' };
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
    });
    if (!response.ok) return { ok: false, message: `Supabase respondió ${response.status}.` };
    const token = await accessToken();
    if (!token) return { ok: false, message: 'Supabase es accesible, pero no hay sesión de usuario. La clave anon no permite registrar ventas.' };
    const userResponse = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return { ok: false, message: 'Supabase rechazó la sesión. Cierra sesión y entra con tu cuenta remota.' };
    const user = await userResponse.json();
    const profiles = await restRequest(`perfiles?id=eq.${encodeURIComponent(user.id)}&select=id,rol,activo,deleted_at`, { token });
    const profile = profiles?.[0];
    if (!profile || profile.activo !== true || profile.deleted_at) return { ok: false, message: 'La sesión existe, pero falta un perfil activo en public.perfiles asociado al usuario de Auth.' };
    if (!['admin', 'cajero'].includes(profile.rol)) return { ok: false, message: 'El perfil no tiene rol admin/cajero para registrar ventas.' };
    return { ok: true, message: 'Sesión y perfil de ventas verificados. Las políticas de escritura se comprueban al sincronizar cada operación.' };
  } catch (error) {
    if (error.code === 'AUTH_SESSION_REQUIRED') return { ok: false, message: error.message };
    return { ok: false, message: 'No se pudo alcanzar Supabase. Revisa la URL o tu conexión.' };
  }
}

async function authHeaders(token) {
  const config = getSupabaseConfig();
  const bearer = token || (await accessToken()) || config.anonKey;
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function restRequest(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) throw new Error('Supabase no está configurado.');
  const method = (options.method || 'GET').toUpperCase();
  const token = options.token || await accessToken();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !token) throw sessionRequired();
  const headers = {
    ...(await authHeaders(token)),
    ...(options.headers || {}),
  };
  if (options.prefer) headers.Prefer = options.prefer;
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw networkError(error);
  }
  try {
    return await parseResponse(response);
  } catch (error) {
    if (error.data?.code === '42501' && /row-level security/i.test(error.message)) {
      const table = String(path).split('?')[0];
      error.code = 'SUPABASE_RLS_DENIED';
      error.message = `Supabase rechazó la operación por RLS en ${table}. Revisa el perfil activo, usuario_id = auth.uid() y las políticas SELECT/INSERT/UPDATE del upsert. Los pendientes se conservan.`;
    }
    throw error;
  }
}

export async function upsertRow(table, row, keyField = 'id') {
  return restRequest(`${table}?on_conflict=${encodeURIComponent(keyField)}`, {
    method: 'POST',
    body: row,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

export async function deleteRow(table, id) {
  return restRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

export async function pullRows(table, since, select = '*') {
  const params = new URLSearchParams({
    select,
    order: 'updated_at.asc',
    limit: '1000',
  });
  if (since) params.set('updated_at', `gt.${since}`);
  return restRequest(`${table}?${params.toString()}`);
}

export function remoteRole(user) {
  if (!user) return 'cajero';
  const role = user.app_metadata && user.app_metadata.role;
  return role === 'cocinero' ? 'cocina' : ['admin', 'cajero', 'cocina'].includes(role) ? role : 'cajero';
}

export function remoteName(user) {
  if (!user) return '';
  return (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
    || (user.email ? user.email.split('@')[0] : 'Usuario');
}
