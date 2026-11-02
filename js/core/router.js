import { state } from './state.js';

export const ALLOWED = {
  login: ['admin', 'cajero', 'cocina'],
  dashboard: ['admin'],
  pos: ['admin', 'cajero', 'cocina'],
  cocina: ['admin', 'cajero', 'cocina'],
  productos: ['admin'],
  inventario: ['admin', 'cajero', 'cocina'],
  proveedores: ['admin'],
  reportes: ['admin'],
  usuarios: ['admin'],
  config: ['admin'],
};

const VIEW_MAP = {
  dashboard: 'dashboard',
  pos: 'pos',
  cocina: 'cocina',
  productos: 'products',
  inventario: 'inventory',
  proveedores: 'suppliers',
  reportes: 'reports',
  usuarios: 'users',
  config: 'config',
};

export function defaultRoute(role = state.role) {
  if (role === 'cajero') return 'pos';
  if (role === 'cocina') return 'cocina';
  return 'dashboard';
}

export function parseRoute() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = {};
  for (const chunk of queryPart.split('&').filter(Boolean)) {
    const [key, value = ''] = chunk.split('=');
    query[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  const base = parts[0] || '';
  return { raw, parts, base, query };
}

export function resolveRoute() {
  const route = parseRoute();
  const isLogged = state.isLogged && state.user;
  if (!isLogged && route.base !== 'login') return { redirect: 'login', route };
  if (isLogged && (!route.base || route.base === 'login')) return { redirect: defaultRoute(state.role), route };
  const allowed = ALLOWED[route.base];
  if (isLogged && allowed && !allowed.includes(state.role)) {
    return { redirect: defaultRoute(state.role), route, denied: true };
  }
  if (isLogged && !allowed) return { redirect: defaultRoute(state.role), route };
  return { route };
}

export function viewInfo(route) {
  const base = route.base || 'dashboard';
  const parts = route.parts;
  const section = VIEW_MAP[base] || 'dashboard';
  let view = section;
  let id = null;
  let mode = 'list';
  if (base === 'productos' && parts[1]) {
    view = 'product-form';
    mode = parts[1] === 'editar' ? 'edit' : 'new';
    id = parts[2] || null;
  } else if (base === 'usuarios' && parts[1]) {
    view = 'user-form';
    mode = parts[1] === 'editar' ? 'edit' : 'new';
    id = parts[2] || null;
  } else if (base === 'proveedores' && parts[1]) {
    view = 'supplier-form';
    mode = parts[1] === 'editar' ? 'edit' : 'new';
    id = parts[2] || null;
  } else if (base === 'inventario' && parts[1] === 'entrada') {
    view = 'inventory-entry';
  } else if (base === 'config') {
    view = 'config';
    mode = parts[1] || 'business';
  }
  return { base, section, view, mode, id, parts };
}

export function navigate(path) {
  const target = `#/${String(path || '').replace(/^#?\/?/, '')}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new Event('hashchange'));
    return;
  }
  window.location.hash = target;
}

export function initRouter(onChange) {
  window.addEventListener('hashchange', () => onChange(resolveRoute()));
  onChange(resolveRoute());
}

export const VIEW_LABELS = {
  dashboard: 'Resumen ejecutivo',
  pos: 'Punto de venta',
  cocina: 'Cocina',
  productos: 'Productos',
  inventario: 'Inventario',
  proveedores: 'Proveedores',
  reportes: 'Reportes',
  usuarios: 'Usuarios',
  config: 'Configuración',
  login: 'Acceso',
};

export function viewLabel(route) {
  return VIEW_LABELS[route.base] || 'Resumen ejecutivo';
}
