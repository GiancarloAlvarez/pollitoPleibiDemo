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
      return current.access_token;
    }
  }
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
    return { ok: true, message: 'Conexión verificada con Supabase.' };
  } catch (error) {
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
  const headers = {
    ...(await authHeaders(options.token)),
    ...(options.headers || {}),
  };
  if (options.prefer) headers.Prefer = options.prefer;
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw networkError(error);
  }
  return parseResponse(response);
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
  return (user.app_metadata && user.app_metadata.role)
    || (user.user_metadata && user.user_metadata.role)
    || 'cajero';
}

export function remoteName(user) {
  if (!user) return '';
  return (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
    || (user.email ? user.email.split('@')[0] : 'Usuario');
}
