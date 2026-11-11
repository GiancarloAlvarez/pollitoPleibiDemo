import { icon } from '../components/icons.js';
import { escapeHtml, downloadBlob, formatDateTime } from '../core/utils.js';
import { state, store, setFilter } from '../core/state.js';
import { saveSettings } from '../core/repo.js';
import { toggleTheme, getTheme } from '../components/theme.js';
import { navigate } from '../core/router.js';
import { showToast, toastError } from '../components/toast.js';
import { getSupabaseConfig, saveSupabaseConfig } from '../config.js';
import { syncNow, getSyncStatus, refreshPending } from '../core/sync.js';
import { testConnection } from '../core/supabase.js';
import { STORES, dbGetAll } from '../core/db.js';
import { localEnabled, localStatus, flushLocalCommands } from '../core/local-client.js';

const TABS = [
  ['business', 'Datos del negocio', 'store'],
  ['taxes', 'Impuestos y precios', 'receipt'],
  ['notifications', 'Notificaciones', 'bell'],
  ['roles', 'Roles y permisos', 'users'],
  ['connection', 'Conexión y sincronización', 'cloud'],
];

const PERMISSIONS = [
  ['Resumen ejecutivo', true, false, false],
  ['Punto de venta', true, true, false],
  ['Cocina', true, true, true],
  ['Inventario', true, true, true],
  ['Productos', true, false, false],
  ['Proveedores', true, false, false],
  ['Reportes', true, false, false],
  ['Usuarios', true, false, false],
  ['Configuración', true, false, false],
];

function businessForm() {
  const dark = getTheme() === 'dark';
  return `<h3>Datos del negocio</h3>
    <p>Esta información aparece en recibos y reportes.</p>
    <label>Nombre comercial<input name="business_name" value="${escapeHtml(state.settings.business_name || '')}"></label>
    <label>RNC<input name="rnc" value="${escapeHtml(state.settings.rnc || '')}"></label>
    <label>Dirección<input name="address" value="${escapeHtml(state.settings.address || '')}"></label>
    <label>Teléfono<input name="phone" value="${escapeHtml(state.settings.phone || '')}"></label>
    <div class="settings-line">
      <span><b>Modo oscuro</b><small>Reduce el brillo de la interfaz</small></span>
      <button type="button" class="toggle ${dark ? 'on' : ''}" data-action="settings-theme" aria-pressed="${dark}"><i></i></button>
    </div>
    <button class="primary-btn" type="button" data-action="save-business">${icon('save', 16)} Guardar cambios</button>`;
}

function taxesForm() {
  const rate = Number(state.settings.tax_rate ?? 0.18) * 100;
  return `<h3>Impuestos y precios</h3>
    <p>Configura el ITBIS aplicado en el punto de venta y reportes.</p>
    <div class="form-grid">
      <label>ITBIS (%)<input name="tax_rate" type="number" min="0" max="100" step="0.01" value="${rate}"></label>
      <label>Moneda<select name="currency">
        <option value="RD$" ${state.settings.currency === 'RD$' ? 'selected' : ''}>Peso dominicano (RD$)</option>
        <option value="US$" ${state.settings.currency === 'US$' ? 'selected' : ''}>Dólar (US$)</option>
        <option value="EUR" ${state.settings.currency === 'EUR' ? 'selected' : ''}>Euro (EUR)</option>
      </select></label>
    </div>
    <p class="form-hint">El cambio aplica a nuevas órdenes y a los cálculos del POS.</p>
    <button class="primary-btn" type="button" data-action="save-taxes">${icon('save', 16)} Guardar impuestos</button>`;
}

function notificationsForm() {
  const notifications = state.settings.notifications || {};
  return `<h3>Notificaciones</h3>
    <p>Elige qué avisos quieres recibir dentro del sistema.</p>
    <div class="form-row-inline"><span><b>Alertas de stock bajo</b><small>Avisar cuando un insumo esté por debajo del mínimo.</small></span><label class="check-label"><input type="checkbox" name="low_stock" ${notifications.low_stock !== false ? 'checked' : ''}></label></div>
    <div class="form-row-inline"><span><b>Nuevas órdenes</b><small>Mostrar las órdenes nuevas en el tablero.</small></span><label class="check-label"><input type="checkbox" name="new_order" ${notifications.new_order !== false ? 'checked' : ''}></label></div>
    <div class="form-row-inline"><span><b>Resumen diario</b><small>Preparar el resumen de ventas al cerrar el día.</small></span><label class="check-label"><input type="checkbox" name="daily_summary" ${notifications.daily_summary ? 'checked' : ''}></label></div>
    <button class="primary-btn" type="button" data-action="save-notifications">${icon('save', 16)} Guardar preferencias</button>`;
}

function rolesForm() {
  return `<h3>Roles y permisos</h3>
    <p>Los permisos se aplican en la navegación y en las rutas del sistema.</p>
    <table class="role-matrix">
      <thead><tr><th>Módulo</th><th>Admin</th><th>Cajero</th><th>Cocina</th></tr></thead>
      <tbody>${PERMISSIONS.map(([module, admin, cajero, cocina]) => `<tr>
        <td>${module}</td>
        <td class="${admin ? 'perm-yes' : 'perm-no'}">${admin ? '✓' : '—'}</td>
        <td class="${cajero ? 'perm-yes' : 'perm-no'}">${cajero ? '✓' : '—'}</td>
        <td class="${cocina ? 'perm-yes' : 'perm-no'}">${cocina ? '✓' : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="form-actions"><button type="button" class="secondary-btn" data-nav="usuarios">${icon('users', 15)} Gestionar usuarios</button></div>`;
}

function connectionForm() {
  if (localEnabled()) {
    const lan = localStatus();
    return `<h3>Red local y cocina</h3>
      <p>El PC conserva las operaciones y comunica caja y cocina por la red local.</p>
      <div class="sync-panel-status">
        <span>Servicio: <b>${lan.connected ? 'Disponible' : 'No disponible'}</b></span>
        <span>Modo: <b>${lan.demo ? 'Demostración explícita' : 'Usuarios Auth con sesión local'}</b></span>
        <span>Pendientes en este dispositivo: <b>${lan.pendingLocal}</b></span>
        <span>Operaciones guardadas en PC pendientes de nube: <b>${lan.pendingCloud}</b></span>
      </div>
      <p class="form-hint">El envío de esta cola a Supabase pertenece al siguiente módulo. Los datos anteriores del modo independiente se conservan y no se importan automáticamente.</p>
      <button type="button" class="primary-btn" data-action="refresh-lan">Actualizar y reenviar pendientes LAN</button>`;
  }
  const config = getSupabaseConfig();
  const sync = getSyncStatus();
  return `<h3>Conexión y sincronización</h3>
    <p>Conecta tu proyecto de Supabase para usar la app como Backend as a Service y trabajar offline.</p>
    <label>URL del proyecto<input name="supabase_url" placeholder="https://tu-proyecto.supabase.co" value="${escapeHtml(config.url)}"></label>
    <label>Anon key<input name="supabase_key" placeholder="eyJhbGciOi..." value="${escapeHtml(config.anonKey)}"></label>
    <p class="form-hint">Usa solo la anon key pública con políticas RLS. Nunca pegues la service_role key en el navegador.</p>
    <div class="sync-panel-status">
      <span>Estado: <b>${escapeHtml(sync.state)}</b></span>
      <span>Cambios pendientes: <b>${sync.pending}</b></span>
      <span>Última sincronización: <b>${sync.lastSync ? formatDateTime(sync.lastSync) : 'Nunca'}</b></span>
      <span>${escapeHtml(sync.message || '')}</span>
    </div>
    <div class="sync-actions">
      <button class="primary-btn" type="button" data-action="save-connection">${icon('save', 16)} Guardar conexión</button>
      <button class="secondary-btn" type="button" data-action="test-connection">${icon('database', 16)} Probar conexión</button>
      <button class="secondary-btn" type="button" data-action="sync-now">${icon('refresh-cw', 16)} Sincronizar ahora</button>
      <button class="secondary-btn" type="button" data-action="backup-local">${icon('download', 16)} Respaldo local</button>
    </div>
    <p class="form-hint">Los datos se guardan primero en este dispositivo (IndexedDB). Cuando conectes el esquema de Supabase, la cola de cambios se enviará automáticamente sin perder información.</p>`;
}

function formFor(tab) {
  if (tab === 'taxes') return taxesForm();
  if (tab === 'notifications') return notificationsForm();
  if (tab === 'roles') return rolesForm();
  if (tab === 'connection') return connectionForm();
  return businessForm();
}

export function renderConfig(tab = 'business') {
  return `<div class="welcome-row compact">
    <div>
      <p class="eyebrow">PREFERENCIAS DEL SISTEMA</p>
      <h1>Configuración</h1>
      <p class="muted">Personaliza cómo funciona Pollito Pleibi.</p>
    </div>
  </div>
  <section class="settings-grid">
    <div class="panel settings-nav">
      ${TABS.map(([value, label, iconName]) => `<button class="${tab === value ? 'selected' : ''}"  data-config-tab="${value}">${icon(iconName, 17)} ${label}</button>`).join('')}
    </div>
    <div class="panel settings-form" id="settings-panel">
      <form id="settings-form">${formFor(tab)}</form>
    </div>
  </section>`;
}

export function bindConfig(root, tab = 'business') {
  root.querySelector('[data-action="refresh-lan"]')?.addEventListener('click', async () => {
    try { await flushLocalCommands(); showToast('Estado de red local actualizado. La nube se confirma por separado.', 'success'); }
    catch (error) { toastError(error); }
  });
  root.querySelectorAll('[data-config-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.getAttribute('data-config-tab');
      setFilter('configTab', next);
      navigate(`config/${next}`);
    });
  });

  const form = root.querySelector('#settings-form');
  if (!form) return;

  root.querySelector('[data-action="settings-theme"]')?.addEventListener('click', () => {
    toggleTheme();
    store.setState({ theme: getTheme(), filters: state.filters });
  });

  root.querySelector('[data-action="save-business"]')?.addEventListener('click', async () => {
    try {
      await saveSettings({
        business_name: form.querySelector('[name="business_name"]').value,
        rnc: form.querySelector('[name="rnc"]').value,
        address: form.querySelector('[name="address"]').value,
        phone: form.querySelector('[name="phone"]').value,
      });
      showToast('Configuración guardada correctamente', 'success');
    } catch (error) {
      toastError(error);
    }
  });

  root.querySelector('[data-action="save-taxes"]')?.addEventListener('click', async () => {
    try {
      const percent = Number(form.querySelector('[name="tax_rate"]').value);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('El ITBIS debe estar entre 0 y 100.');
      await saveSettings({
        tax_rate: percent / 100,
        currency: form.querySelector('[name="currency"]').value,
      });
      showToast('Impuestos actualizados correctamente', 'success');
    } catch (error) {
      toastError(error);
    }
  });

  root.querySelector('[data-action="save-notifications"]')?.addEventListener('click', async () => {
    try {
      await saveSettings({
        notifications: {
          low_stock: form.querySelector('[name="low_stock"]').checked,
          new_order: form.querySelector('[name="new_order"]').checked,
          daily_summary: form.querySelector('[name="daily_summary"]').checked,
        },
      });
      showToast('Preferencias de notificación guardadas', 'success');
    } catch (error) {
      toastError(error);
    }
  });

  root.querySelector('[data-action="save-connection"]')?.addEventListener('click', async () => {
    try {
      const url = form.querySelector('[name="supabase_url"]').value.trim();
      const anonKey = form.querySelector('[name="supabase_key"]').value.trim();
      if (!url || !anonKey) throw new Error('Indica la URL del proyecto y la anon key.');
      if (!/^https?:\/\//.test(url)) throw new Error('La URL debe comenzar con https://');
      saveSupabaseConfig({ url, anonKey, enabled: Boolean(url && anonKey) });
      await refreshPending();
      showToast('Conexión de Supabase guardada', 'success');
      syncNow({ silent: true });
    } catch (error) {
      toastError(error);
    }
  });

  root.querySelector('[data-action="test-connection"]')?.addEventListener('click', async () => {
    const result = await testConnection();
    showToast(result.message, result.ok ? 'success' : 'error', 3200);
  });

  root.querySelector('[data-action="sync-now"]')?.addEventListener('click', () => {
    syncNow();
  });

  root.querySelector('[data-action="backup-local"]')?.addEventListener('click', async () => {
    try {
      const payload = { generated_at: new Date().toISOString(), version: 1 };
      for (const [name, storeName] of Object.entries(STORES)) {
        payload[name.toLowerCase()] = await dbGetAll(storeName);
      }
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `pollito-pleibi-backup-${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Respaldo local descargado', 'success');
    } catch (error) {
      toastError(error);
    }
  });
}
