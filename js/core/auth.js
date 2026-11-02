import { STORES, dbGetAll, dbPut } from './db.js';
import { verifyPassword, hashPassword, randomSalt, normalize, uid } from './utils.js';
import { queueChange } from './sync.js';
import { configured, signIn as remoteSignIn, signOut as remoteSignOut, remoteRole, remoteName } from './supabase.js';

const SESSION_KEY = 'pollito-session';

function readStorage(remember) {
  const raw = remember ? localStorage.getItem(SESSION_KEY) : sessionStorage.getItem(SESSION_KEY);
  if (!raw && !remember) return localStorage.getItem(SESSION_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
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
  const session = currentSession();
  if (!session || !session.userId) return null;
  const users = await dbGetAll(STORES.USERS);
  const user = users.find(row => row.id === session.userId && !row.deleted_at && row.active !== false);
  return user || null;
}

async function touchAccess(user) {
  const updated = { ...user, last_access: new Date().toISOString(), updated_at: new Date().toISOString() };
  await dbPut(STORES.USERS, updated);
  await queueChange('users', 'upsert', updated);
  return updated;
}

async function cacheRemoteUser(remoteUser, password) {
  const email = normalize(remoteUser.email);
  const users = await dbGetAll(STORES.USERS);
  const existing = users.find(row => normalize(row.email) === email && !row.deleted_at);
  const role = remoteRole(remoteUser);
  const name = remoteName(remoteUser) || existing && existing.name || email.split('@')[0];
  if (existing) {
    const updated = {
      ...existing,
      name,
      role,
      role_name: role === 'admin' ? 'Dueño / Administrador' : role === 'cocina' ? 'Cocinero' : 'Vendedor / Cajero',
      active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
    await dbPut(STORES.USERS, updated);
    await queueChange('users', 'upsert', updated);
    return updated;
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const created = {
    id: uid(),
    name,
    email: remoteUser.email,
    role,
    role_name: role === 'admin' ? 'Dueño / Administrador' : role === 'cocina' ? 'Cocinero' : 'Vendedor / Cajero',
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
  await queueChange('users', 'upsert', created);
  return created;
}

export async function login(email, password, remember = true) {
  const normalized = normalize(email);
  const users = await dbGetAll(STORES.USERS);
  const local = users.find(row => normalize(row.email) === normalized && !row.deleted_at);

  if (configured() && navigator.onLine) {
    try {
      const session = await remoteSignIn(email.trim(), password);
      const user = await cacheRemoteUser(session.user || { email, user_metadata: {} }, password);
      const updated = await touchAccess(user);
      establishSession(updated, remember);
      return updated;
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
      if (error.status === 400 && local) {
        const ok = await verifyPassword(password, local.password_salt, local.password_hash);
        if (ok && local.active !== false) {
          const updated = await touchAccess(local);
          establishSession(updated, remember);
          return updated;
        }
      }
      throw new Error(error.message || 'Credenciales inválidas.');
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
