import { initTheme, getTheme, toggleTheme } from './components/theme.js';
import { showToast } from './components/toast.js';
import { icon, renderIcons } from './components/icons.js';
import { store, state } from './core/state.js';
import { initRepo, reload } from './core/repo.js';
import { restoreSessionUser, logout } from './core/auth.js';
import {
  initRouter, resolveRoute, viewInfo, viewLabel, navigate, defaultRoute,
} from './core/router.js';
import { lowStockItems, kitchenOrders } from './core/analytics.js';
import { initSync, renderBadge, getSyncStatus, refreshPending, syncNow } from './core/sync.js';
import { escapeHtml, initials } from './core/utils.js';
import { destroyCharts } from './core/charts.js';
import { exportReport } from './core/excel.js';
import { configured, testConnection } from './core/supabase.js';

import { renderLogin, bindLogin } from './views/login.view.js';
import { renderDashboard, bindDashboard } from './views/dashboard.view.js';
import { renderPos, bindPos } from './views/pos.view.js';
import { renderKitchen, bindKitchen } from './views/kitchen.view.js';
import { renderProducts, bindProducts } from './views/products.view.js';
import { renderProductForm, bindProductForm } from './views/product-form.view.js';
import { renderInventory, bindInventory } from './views/inventory.view.js';
import { renderInventoryEntry, bindInventoryEntry } from './views/inventory-entry.view.js';
import { renderSuppliers, bindSuppliers } from './views/suppliers.view.js';
import { renderSupplierForm, bindSupplierForm } from './views/supplier-form.view.js';
import { renderReports, bindReports } from './views/reports.view.js';
import { renderUsers, bindUsers } from './views/users.view.js';
import { renderUserForm, bindUserForm } from './views/user-form.view.js';
import { renderConfig, bindConfig } from './views/config.view.js';

const root = document.getElementById('app');

function navItem({ route, label, active, iconName, badge, hide }) {
  if (hide) return '';
  return `<button class="nav-item ${active ? 'active' : ''}" data-nav="${route}">${icon(iconName, 18)}<span>${label}</span>${badge ? `<em>${badge}</em>` : ''}</button>`;
}

function crumbDetail(info) {
  if (info.base === 'dashboard') {
    const now = new Date();
    const date = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long' }).format(now);
    return `Hoy, ${date}`;
  }
  if (info.view === 'product-form') return info.mode === 'edit' ? 'Editar producto' : 'Nuevo producto';
  if (info.view === 'user-form') return info.mode === 'edit' ? 'Editar usuario' : 'Nuevo usuario';
  if (info.view === 'supplier-form') return info.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor';
  if (info.view === 'inventory-entry') return 'Registrar entrada';
  if (info.base === 'config') {
    const labels = { business: 'Datos del negocio', taxes: 'Impuestos y precios', notifications: 'Notificaciones', roles: 'Roles y permisos', connection: 'Conexión y sincronización' };
    return labels[info.mode] || 'Configuración';
  }
  return 'Gestión operativa';
}

function notificationsMenu() {
  const alerts = lowStockItems(state.inventory).slice(0, 3);
  const newOrders = state.orders.filter(order => order.status === 'Nueva').slice(0, 3);
  const items = [];
  for (const order of newOrders) {
    items.push(`<button class="notif-item" data-nav="cocina">${icon('chef-hat', 16)}<span><b>Orden ${escapeHtml(order.code)} nueva</b><small>${escapeHtml(order.customer)}</small></span></button>`);
  }
  for (const item of alerts) {
    items.push(`<button class="notif-item" data-nav="inventario">${icon('alert-triangle', 16)}<span><b>${escapeHtml(item.name)} con stock bajo</b><small>${item.stock} ${escapeHtml(item.unit)} · mínimo ${item.min} ${escapeHtml(item.unit)}</small></span></button>`);
  }
  return items.length ? items.join('') : '<div class="notif-empty">Sin novedades por ahora.</div>';
}

function shell(info, viewHtml) {
  const user = state.user || { name: 'Usuario', role_name: '' };
  const role = state.role;
  const isAdmin = role === 'admin';
  const activeBase = info.base;
  const newOrders = kitchenOrders(state.orders).filter(order => order.status === 'Nueva').length;
  const sync = getSyncStatus();
  const dark = getTheme() === 'dark';
  return `<div class="app-shell">
    <aside class="sidebar ${state.drawer ? 'open' : ''}">
      <div class="brand">
        <div class="logo-mark">P</div>
        <div><strong>Pollito <span>Pleibi</span></strong><small>OPERACIONES</small></div>
        <button class="icon-btn close-drawer" data-action="close-drawer" aria-label="Cerrar menú">${icon('x', 19)}</button>
      </div>
      <div class="location">${icon('store', 16)}<span>Food Truck Principal</span>${icon('chevron-down', 14)}</div>
      <nav aria-label="Navegación principal">
        ${navItem({ route: 'dashboard', label: 'Resumen', active: activeBase === 'dashboard', iconName: 'layout-dashboard', hide: !isAdmin })}
        ${navItem({ route: 'pos', label: 'Punto de venta', active: activeBase === 'pos', iconName: 'shopping-cart' })}
        ${navItem({ route: 'cocina', label: 'Cocina', active: activeBase === 'cocina', iconName: 'chef-hat', badge: newOrders || null })}
        <div class="nav-label">GESTIÓN</div>
        ${navItem({ route: 'productos', label: 'Productos', active: activeBase === 'productos', iconName: 'package', hide: !isAdmin })}
        ${navItem({ route: 'inventario', label: 'Inventario', active: activeBase === 'inventario', iconName: 'boxes' })}
        ${navItem({ route: 'proveedores', label: 'Proveedores', active: activeBase === 'proveedores', iconName: 'truck', hide: !isAdmin })}
        <div class="nav-label">ANÁLISIS</div>
        ${navItem({ route: 'reportes', label: 'Reportes', active: activeBase === 'reportes', iconName: 'file-bar-chart', hide: !isAdmin })}
        ${navItem({ route: 'usuarios', label: 'Usuarios', active: activeBase === 'usuarios', iconName: 'users', hide: !isAdmin })}
      </nav>
      <div class="sidebar-bottom">
        ${navItem({ route: 'config', label: 'Configuración', active: activeBase === 'config', iconName: 'settings', hide: !isAdmin })}
        <button class="user-card" data-action="logout">
          <div class="avatar">${escapeHtml(initials(user.name))}</div>
          <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.role_name || '')}</small></div>
          ${icon('log-out', 16)}
        </button>
      </div>
    </aside>
    <div class="mobile-overlay" data-action="close-drawer"></div>
    <main class="main-content">
      <header class="topbar">
        <button class="icon-btn menu-btn" data-action="open-drawer" aria-label="Abrir menú">${icon('menu', 21)}</button>
        <div class="crumb"><span>${escapeHtml(viewLabel(info))}</span>${icon('chevron-right', 15)}<strong>${escapeHtml(crumbDetail(info))}</strong></div>
        <div class="top-actions">
          <div class="sync-status ${sync.state}" data-sync-badge title="${escapeHtml(sync.message || '')}"><i></i><span>Modo local</span></div>
          <button class="icon-btn" data-theme-toggle aria-label="${dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">${icon(dark ? 'sun' : 'moon', 19)}</button>
          <div class="top-notify-wrap">
            <button class="icon-btn notification" data-menu-toggle="notif-menu" aria-label="Notificaciones">${icon('bell', 19)}<i></i></button>
            <div class="action-menu notif-menu" id="notif-menu"><h4>Notificaciones</h4>${notificationsMenu()}</div>
          </div>
          <div class="top-avatar">${escapeHtml(initials(user.name))}</div>
        </div>
      </header>
      <div class="page-content" id="view-content">${viewHtml}</div>
      <footer>JyB Technology Solutions SRL <span>– Innovamos. Desarrollamos. Conectamos.</span></footer>
    </main>
  </div>`;
}

function viewMarkup(info) {
  switch (info.view) {
    case 'dashboard': return renderDashboard();
    case 'pos': return renderPos();
    case 'cocina': return renderKitchen();
    case 'products': return renderProducts();
    case 'product-form': return renderProductForm(info.mode, info.id);
    case 'inventory': return renderInventory();
    case 'inventory-entry': return renderInventoryEntry();
    case 'suppliers': return renderSuppliers();
    case 'supplier-form': return renderSupplierForm(info.mode, info.id);
    case 'reports': return renderReports();
    case 'users': return renderUsers();
    case 'user-form': return renderUserForm(info.mode, info.id);
    case 'config': return renderConfig(info.mode);
    default: return renderDashboard();
  }
}

function bindView(info) {
  const content = document.getElementById('view-content');
  if (!content) return;
  switch (info.view) {
    case 'dashboard': bindDashboard(content); break;
    case 'pos': bindPos(content); break;
    case 'cocina': bindKitchen(content); break;
    case 'products': bindProducts(content); break;
    case 'product-form': bindProductForm(content, info.mode, info.id); break;
    case 'inventory': bindInventory(content); break;
    case 'inventory-entry': bindInventoryEntry(content); break;
    case 'suppliers': bindSuppliers(content); break;
    case 'supplier-form': bindSupplierForm(content, info.mode, info.id); break;
    case 'reports': bindReports(content); break;
    case 'users': bindUsers(content); break;
    case 'user-form': bindUserForm(content, info.mode, info.id); break;
    case 'config': bindConfig(content, info.mode); break;
    default: break;
  }
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !active.id) return null;
  let start = null;
  let end = null;
  try {
    start = active.selectionStart;
    end = active.selectionEnd;
  } catch (error) {
    start = null;
    end = null;
  }
  return { id: active.id, start, end };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const element = document.getElementById(snapshot.id);
  if (!element) return;
  element.focus({ preventScroll: true });
  if (snapshot.start != null && typeof element.setSelectionRange === 'function') {
    try {
      element.setSelectionRange(snapshot.start, snapshot.end);
    } catch (error) {
      return;
    }
  }
}

function renderApp() {
  if (!root) return;
  const snapshot = captureFocus();
  destroyCharts();
  const info = viewInfo(state.route);
  if (!state.isLogged) {
    root.innerHTML = renderLogin();
    bindLogin(root);
    renderIcons(root);
    restoreFocus(snapshot);
    return;
  }
  const markup = viewMarkup(info);
  root.innerHTML = shell(info, markup);
  bindView(info);
  renderIcons(root);
  const badge = root.querySelector('[data-sync-badge]');
  if (badge) renderBadge(badge);
  restoreFocus(snapshot);
}

async function handleLogout() {
  await logout();
  state.user = null;
  state.isLogged = false;
  state.role = 'admin';
  state.drawer = false;
  showToast('Sesión cerrada correctamente', 'success');
  navigate('login');
}

function wireGlobalEvents() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      closeAllMenus();
      state.drawer = false;
      navigate(nav.getAttribute('data-nav'));
      return;
    }

    const themeToggle = event.target.closest('[data-theme-toggle], [data-action="toggle-theme"]');
    if (themeToggle) {
      toggleTheme();
      store.setState({ theme: getTheme() });
      return;
    }

    const openDrawer = event.target.closest('[data-action="open-drawer"]');
    if (openDrawer) {
      store.setState({ drawer: true });
      return;
    }

    const closeDrawer = event.target.closest('[data-action="close-drawer"]');
    if (closeDrawer) {
      store.setState({ drawer: false });
      return;
    }

    const logoutButton = event.target.closest('[data-action="logout"]');
    if (logoutButton) {
      handleLogout();
      return;
    }

    const menuToggle = event.target.closest('[data-menu-toggle]');
    if (menuToggle) {
      event.stopPropagation();
      const id = menuToggle.getAttribute('data-menu-toggle');
      const menu = document.getElementById(id);
      const wasOpen = menu && menu.classList.contains('open');
      closeAllMenus();
      if (menu && !wasOpen) menu.classList.add('open');
      return;
    }

    if (!event.target.closest('.action-menu')) closeAllMenus();

    if (event.target.closest('[data-action="refresh-dashboard"]')) {
      renderApp();
      showToast('Datos actualizados', 'success', 1600);
    }

    if (event.target.closest('[data-action="export-payments"]')) {
      try {
        exportReport('payments', {
          orders: state.orders.filter(order => order.paid),
          settings: state.settings,
        });
        showToast('Métodos de pago exportados', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo exportar', 'error');
      }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllMenus();
  });

  window.addEventListener('sync:status', event => {
    state.sync = event.detail;
    const badges = document.querySelectorAll('[data-sync-badge]');
    badges.forEach(badge => renderBadge(badge));
  });
  window.addEventListener('sync:data', async () => {
    await reload();
    showToast('Datos sincronizados desde Supabase', 'success');
  });
  window.addEventListener('sync:toast', event => {
    const detail = event.detail || {};
    showToast(detail.message || 'Sincronización actualizada', detail.type || 'info', 3200);
  });
  window.addEventListener('theme:change', () => {
    store.setState({ theme: getTheme() });
  });
}

function closeAllMenus() {
  document.querySelectorAll('.action-menu.open').forEach(menu => menu.classList.remove('open'));
}

async function handleRoute(result) {
  if (result.redirect) {
    if (result.denied) showToast('Acceso no permitido para tu rol', 'warning');
    navigate(result.redirect);
    return;
  }
  state.route = result.route;
  state.view = viewInfo(result.route).view;
  renderApp();
}

async function logSupabaseStatus() {
  if (!configured()) {
    console.warn('[Supabase] NO conectado: faltan la URL o la anon key de configuración.');
    return;
  }
  const result = await testConnection();
  if (result.ok) console.log('%c[Supabase] Estado: CONECTADO ✔ ' + result.message, 'color:#22c55e;');
  else console.warn('[Supabase] Estado: NO CONECTADO ✘ ' + result.message);
}

async function boot() {
  initTheme();
  try {
    await initRepo();
  } catch (error) {
    root.innerHTML = `<div style="padding:40px;font-family:Inter,sans-serif;color:#1f2447"><h1>No se pudo iniciar Pollito Pleibi</h1><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  const user = await restoreSessionUser();
  if (user) {
    state.user = user;
    state.isLogged = true;
    state.role = user.role;
  }
  state.theme = getTheme();
  state.sync = getSyncStatus();
  store.subscribe(() => renderApp());
  wireGlobalEvents();
  await initSync();
  await refreshPending();
  initRouter(handleRoute);
  logSupabaseStatus();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'SYNC_NOW') syncNow({ silent: true });
    });
  }
  window.addEventListener('online', () => showToast('Conexión restablecida', 'success', 1800));
  window.addEventListener('offline', () => showToast('Sin conexión. Puedes seguir trabajando offline.', 'warning', 3000));
}

boot();
