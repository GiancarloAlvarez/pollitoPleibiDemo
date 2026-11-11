const DB_NAME = 'pollito-pleibi-db';
const DB_VERSION = 3;

export const STORES = {
  PRODUCTS: 'products',
  ORDERS: 'orders',
  INVENTORY: 'inventory',
  USERS: 'users',
  SUPPLIERS: 'suppliers',
  MOVEMENTS: 'movements',
  SETTINGS: 'settings',
  OUTBOX: 'outbox',
  META: 'meta',
  LAN_OUTBOX: 'lan_outbox',
  CASH_SESSIONS: 'cash_sessions',
};

const ALL_STORES = Object.values(STORES);
const KEYED_STORES = new Set([STORES.SETTINGS, STORES.META]);
const FALLBACK_PREFIX = 'pollito-db-';

let dbPromise = null;
let fallback = false;

function keyPathFor(store) {
  return KEYED_STORES.has(store) ? 'key' : 'id';
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      fallback = true;
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const options = KEYED_STORES.has(store) ? { keyPath: 'key' } : { keyPath: 'id' };
          db.createObjectStore(store, options);
        }
      }
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      fallback = true;
      resolve(null);
    };
    request.onblocked = () => {
      fallback = true;
      resolve(null);
    };
  });
  return dbPromise;
}

function readFallback(store) {
  try {
    const raw = localStorage.getItem(FALLBACK_PREFIX + store);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeFallback(store, rows) {
  localStorage.setItem(FALLBACK_PREFIX + store, JSON.stringify(rows));
}

function transaction(store, mode, action) {
  return openDb().then(db => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const objectStore = tx.objectStore(store);
      let request;
      try {
        request = action(objectStore);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

export async function dbGetAll(store) {
  const db = await openDb();
  if (!db) return readFallback(store);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet(store, key) {
  const db = await openDb();
  if (!db) {
    const rows = readFallback(store);
    const field = keyPathFor(store);
    return rows.find(row => row[field] === key) || null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut(store, value) {
  const db = await openDb();
  if (!db) {
    const field = keyPathFor(store);
    const rows = readFallback(store);
    const index = rows.findIndex(row => row[field] === value[field]);
    if (index >= 0) rows[index] = value;
    else rows.push(value);
    writeFallback(store, rows);
    return value;
  }
  await transaction(store, 'readwrite', objectStore => objectStore.put(value));
  return value;
}

export async function dbPutMany(store, values) {
  const list = values || [];
  if (!list.length) return [];
  const db = await openDb();
  if (!db) {
    const field = keyPathFor(store);
    const rows = readFallback(store);
    for (const value of list) {
      const index = rows.findIndex(row => row[field] === value[field]);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
    }
    writeFallback(store, rows);
    return list;
  }
  await transaction(store, 'readwrite', objectStore => {
    for (const value of list) objectStore.put(value);
    return null;
  });
  return list;
}

export async function dbDelete(store, key) {
  const db = await openDb();
  if (!db) {
    const field = keyPathFor(store);
    const rows = readFallback(store).filter(row => row[field] !== key);
    writeFallback(store, rows);
    return true;
  }
  await transaction(store, 'readwrite', objectStore => objectStore.delete(key));
  return true;
}

export async function dbClear(store) {
  const db = await openDb();
  if (!db) {
    writeFallback(store, []);
    return true;
  }
  await transaction(store, 'readwrite', objectStore => objectStore.clear());
  return true;
}

export async function dbCount(store) {
  const db = await openDb();
  if (!db) return readFallback(store).length;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).count();
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

export async function dbReady() {
  const db = await openDb();
  return Boolean(db) || fallback;
}

// Una orden pendiente y su cola LAN deben confirmarse juntas, nunca en dos escrituras.
export async function dbAtomicPut(entries) {
  const db = await openDb();
  if (!db) throw new Error('No se pudo abrir el almacenamiento seguro del dispositivo. No se confirmó la operación.');
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set(entries.map(entry => entry.store))], 'readwrite');
    try {
      for (const entry of entries) tx.objectStore(entry.store).put(entry.value);
    } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se guardó la operación.'));
  });
}

export function usingFallback() {
  return fallback;
}
