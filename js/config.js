const STORAGE_KEY = 'pollito-supabase-config';

export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

export const LEGACY_TABLE_NAMES = {
  products: 'products',
  orders: 'orders',
  inventory: 'inventory',
  users: 'users',
  suppliers: 'suppliers',
  movements: 'movements',
  settings: 'settings',
};

export const REMOTE_TABLE_NAMES = {
  products: 'productos',
  orders: 'ordenes',
  inventory: 'inventario',
  users: 'perfiles',
  suppliers: 'proveedores',
  movements: 'inventario_movimientos',
  settings: 'configuracion',
};

export const DEFAULT_SUPABASE = {
  url: 'https://lakmsmozjbbbokobobgf.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxha21zbW96amJiYm9rb2JvYmdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMTMxODQsImV4cCI6MjExMDY4OTE4NH0.VRF-WYIdTXiCfgG1U9MWjMDRaYpynMmfC3l-eqtaP7k',
  enabled: true,
  tables: REMOTE_TABLE_NAMES,
};

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function getSupabaseConfig() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch (error) {
    stored = {};
  }
  const legacyStoredTables = Object.keys(LEGACY_TABLE_NAMES).every(logical => (stored.tables || {})[logical] === LEGACY_TABLE_NAMES[logical]);
  const storedTables = legacyStoredTables ? {} : (stored.tables || {});
  const enabled = Object.prototype.hasOwnProperty.call(stored, 'enabled')
    ? Boolean(stored.enabled)
    : (Object.hasOwn(stored, 'url') || Object.hasOwn(stored, 'anonKey'))
      ? Boolean(stored.url && stored.anonKey)
      : DEFAULT_SUPABASE.enabled;
  return {
    ...DEFAULT_SUPABASE,
    ...stored,
    enabled,
    tables: { ...DEFAULT_SUPABASE.tables, ...storedTables },
    url: normalizeUrl(stored.url || DEFAULT_SUPABASE.url),
    anonKey: String(stored.anonKey || DEFAULT_SUPABASE.anonKey).trim(),
  };
}

export function saveSupabaseConfig(patch) {
  const current = getSupabaseConfig();
  const next = {
    ...current,
    ...patch,
    tables: { ...current.tables, ...(patch && patch.tables ? patch.tables : {}) },
    url: normalizeUrl(patch && 'url' in patch ? patch.url : current.url),
    anonKey: patch && 'anonKey' in patch ? String(patch.anonKey || '').trim() : current.anonKey,
  };
  next.enabled = patch && Object.prototype.hasOwnProperty.call(patch, 'enabled')
    ? Boolean(patch.enabled)
    : Boolean(next.url && next.anonKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isSupabaseConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.enabled && config.url && config.anonKey);
}
