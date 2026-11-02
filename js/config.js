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
  url: 'https://zoitwxgkawpiwgziomsn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXR3eGdrYXdwaXdnemlvbXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTczMDEsImV4cCI6MjEwOTEzMzMwMX0.9HbmDlm1Ze3t3aUOb2lKFF9cphRPEfAYHHfTkYLTiIc',
  enabled: false,
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
  return {
    ...DEFAULT_SUPABASE,
    ...stored,
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
  next.enabled = Boolean(next.enabled || (next.url && next.anonKey));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isSupabaseConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}
