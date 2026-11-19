import { STORES, dbGetAll, dbPut } from './db.js';
import { verifyPassword, hashPassword, randomSalt, normalize, uid } from './utils.js';
import { configured, signIn as remoteSignIn, signOut as remoteSignOut, fetchProfile, clearSession as clearRemoteSession, remoteRole, remoteName } from './supabase.js';
import { localEnabled, localLogin, localLogout, restoreLocalSession } from './local-client.js';

const SESSION_KEY = 'pollito-session';

function readStorage(remember) {
  const raw = remember ? localStorage.getItem(SESSION_KEY) : sessionStorage.getItem(SESSION_KEY);
  const fallback = !raw && !remember ? localStorage.getItem(SESSION_KEY) : raw;
  try {
    return fallback ? JSON.parse(fallback) : null;
  } catch (error) {
    return null;
  }
}

export function currentSession() {
  return readStorage(false) || readStorage(true);
}

export function establishSession(user, remember = true) {
  const payload = JSON.stringify({ userId: user.id, email: user.email, role: user.role, name: user.name });
  try {
    if (remember) {
      localStorage.setItem(SESSION_KEY, payload);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    return false;
  }
  return true;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    return false;
  }
  return true;
}

export async function restoreSessionUser() {
  if (localEnabled()) {
    const user = await restoreLocalSession();
    if (user) await (await import('./repo.js')).reload();
    return user;
  }
  const session = currentSession();
  if (!session || !session.userId) return null;
  const users = await dbGetAll(STORES.USERS);
  const user = users.find(row => row.id === session.userId && !row.deleted_at && row.active !== false);
  return user || null;
}

async function touchAccess(user) {
  const updated = { ...user, last_access: new Date().toISOString(), updated_at: new Date().toISOString() };
  await dbPut(STORES.USERS, updated);
  return updated;
}

function profileRole(profile, remoteUser) {
  const role = profile && profile.rol;
  if (role === 'cocinero' || role === 'cocina') return 'cocina';
  if (role === 'admin' || role === 'cajero') return role;
  return remoteRole(remoteUser);
}

function roleName(role) {
  return role === 'admin' ? 'Dueño / Administrador' : role === 'cocina' ? 'Cocinero' : 'Vendedor / Cajero';
}

async function cacheRemoteUser(remoteUser, password, profile) {
  const email = normalize(remoteUser.email);
  const users = await dbGetAll(STORES.USERS);
  const existing = users.find(row => normalize(row.email) === email && !row.deleted_at);
  const role = profileRole(profile, remoteUser);
  const name = (profile && profile.nombre) || remoteName(remoteUser) || (existing && existing.name) || email.split('@')[0];
  if (existing) {
    const updated = {
      ...existing,
      name,
      role,
      role_name: roleName(role),
      active: true,
      deleted_at: null,
      remote_id: remoteUser.id || existing.remote_id || null,
      updated_at: new Date().toISOString(),
    };
    await dbPut(STORES.USERS, updated);
    return updated;
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const created = {
    id: uid(),
    name,
    email: remoteUser.email,
    role,
    role_name: roleName(role),
    password_salt: salt,
    password_hash: passwordHash,
    active: true,
    last_access: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    remote_id: remoteUser.id || null,
  };
  await dbPut(STORES.USERS, created);
  return created;
}

export async function login(email, password, remember = true) {
  if (localEnabled()) {
    const user = await localLogin(email, password);
    await (await import('./repo.js')).reload();
    return user;
  }
  const normalized = normalize(email);
  const users = await dbGetAll(STORES.USERS);
  const local = users.find(row => normalize(row.email) === normalized && !row.deleted_at);

  if (configured() && navigator.onLine) {
    clearRemoteSession();
    let session;
    try {
      session = await remoteSignIn(email.trim(), password);
    } catch (error) {
      if (error.network) {
        if (local) {
          const ok = await verifyPassword(password, local.password_salt, local.password_hash);
          if (!ok) throw new Error('Credenciales inválidas. Verifica tu correo y contraseña.');
          if (local.active === false) throw new Error('Este usuario está desactivado.');
          const updated = await touchAccess(local);
          establishSession(updated, remember);
          return updated;
        }
        throw new Error('Sin conexión y este usuario no está disponible en el dispositivo.');
      }
      const message = String(error.message || '');
      if (/email.*not.*confirmed/i.test(message)) {
        throw new Error('Confirma tu correo en Supabase antes de iniciar sesión.');
      }
      if (error.status === 400 || error.status === 401 || /invalid login credentials|invalid_grant/i.test(message)) {
        throw new Error('Credenciales inválidas en Supabase. Verifica tu correo y contraseña.');
      }
      throw new Error(message || 'Credenciales inválidas.');
    }
    try {
      const profile = await fetchProfile(session.user && session.user.id, session.access_token);
      if (!profile || profile.activo !== true || profile.deleted_at) {
        throw new Error('Tu cuenta de Supabase no tiene un perfil activo en public.perfiles. Pide al administrador que la cree o active.');
      }
      const user = await cacheRemoteUser(session.user || { email, user_metadata: {} }, password, profile);
      const updated = await touchAccess(user);
      establishSession(updated, remember);
      return updated;
    } catch (error) {
      clearRemoteSession();
      throw error;
    }
  }

  if (!local) throw new Error('Credenciales inválidas. Usa una cuenta de demostración.');
  if (local.active === false) throw new Error('Este usuario está desactivado.');
  const valid = await verifyPassword(password, local.password_salt, local.password_hash);
  if (!valid) throw new Error('Credenciales inválidas. Verifica tu correo y contraseña.');
  const updated = await touchAccess(local);
  establishSession(updated, remember);
  return updated;
}

export async function logout() {
  if (localEnabled()) return localLogout();
  clearSession();
  if (configured()) {
    try {
      await remoteSignOut();
    } catch (error) {
      return true;
    }
  }
  return true;
}

export { SESSION_KEY };
