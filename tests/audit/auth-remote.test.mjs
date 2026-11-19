import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { browserHarness } from './browser-harness.mjs';
import { DEMO_PASSWORD } from '../../js/data/seed.js';

const REMOTE_ID = '90000000-0000-4000-8000-000000000001';
let mode = 'ok';
let harness;

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

before(async () => {
  harness = await browserHarness({
    transport: route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const url = request.url();
      if (url.includes('/auth/v1/token')) {
        if (mode === 'bad') {
          return route.fulfill({ status: 400, headers, contentType: 'application/json',
            body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
        }
        return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({
          access_token: 'qa-access-token',
          refresh_token: 'qa-refresh-token',
          expires_in: 3600,
          user: { id: REMOTE_ID, email: 'admin.remote@example.test', app_metadata: { role: 'cajero' }, user_metadata: { full_name: 'Ignorado' } },
        }) });
      }
      if (url.includes('/rest/v1/perfiles')) {
        return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify([{
          id: REMOTE_ID,
          nombre: 'Admin Remoto',
          rol: 'admin',
          activo: mode !== 'inactive',
          deleted_at: null,
        }]) });
      }
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '[]' });
    },
  });
});
after(async () => harness?.close());

async function prepare(page) {
  return page.evaluate(() => {
    localStorage.setItem('pollito-supabase-config', JSON.stringify({
      url: 'https://qa.supabase.co', anonKey: 'qa-anon-key', enabled: true,
    }));
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
}

test('El login configurado orienta a Supabase y mantiene el formulario accesible por teclado', async () => {
  const { page, close } = await harness.page('admin');
  try {
    await prepare(page);
    await page.evaluate(async () => {
      (await import('/js/core/auth.js')).clearSession();
      location.hash = '#/login';
    });
    await page.reload();
    await page.getByText('Supabase está configurado.', { exact: false }).waitFor();
    assert.equal(await page.locator('.demo-credentials').count(), 0);
    assert.equal(await page.getByText('Modo independiente.', { exact: false }).count(), 0);
    for (const [width, height] of [[360, 800], [768, 1024], [1366, 768]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#login-email').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'login-password');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
  } finally { await close(); }
});

test('AUTH-04 el login remoto usa el rol de perfiles y abre sesión Supabase', async () => {
  mode = 'ok';
  const session = await harness.page('admin');
  try {
    await prepare(session.page);
    const result = await session.page.evaluate(async () => {
      const auth = await import('/js/core/auth.js');
      const user = await auth.login('admin.remote@example.test', 'secreto-remoto');
      return {
        role: user.role,
        name: user.name,
        remote: user.remote_id,
        hasSession: Boolean(localStorage.getItem('pollito-supabase-session')),
      };
    });
    assert.equal(result.role, 'admin');
    assert.equal(result.name, 'Admin Remoto');
    assert.equal(result.remote, REMOTE_ID);
    assert.equal(result.hasSession, true);
  } finally { await session.close(); }
});

test('AUTH-05 un perfil inactivo rechaza el login y no deja sesión a medias', async () => {
  mode = 'inactive';
  const session = await harness.page('admin');
  try {
    await prepare(session.page);
    const result = await session.page.evaluate(async () => {
      localStorage.removeItem('pollito-supabase-session');
      const auth = await import('/js/core/auth.js');
      try { await auth.login('admin.remote@example.test', 'secreto-remoto'); return { ok: true }; }
      catch (error) {
        return { ok: false, message: error.message, hasSession: Boolean(localStorage.getItem('pollito-supabase-session')) };
      }
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /perfil activo/i);
    assert.equal(result.hasSession, false);
  } finally { mode = 'ok'; await session.close(); }
});

test('AUTH-06 con Supabase conectado no hay fallback silencioso a una cuenta local/demo', async () => {
  mode = 'bad';
  const session = await harness.page('admin');
  try {
    await prepare(session.page);
    const result = await session.page.evaluate(async password => {
      localStorage.removeItem('pollito-supabase-session');
      const auth = await import('/js/core/auth.js');
      try { await auth.login('admin@pollitopleibi.do', password); return { ok: true }; }
      catch (error) {
        return { ok: false, message: error.message, hasSession: Boolean(localStorage.getItem('pollito-supabase-session')) };
      }
    }, DEMO_PASSWORD);
    assert.equal(result.ok, false);
    assert.match(result.message, /credenciales/i);
    assert.equal(result.hasSession, false);
  } finally { mode = 'ok'; await session.close(); }
});

test('Una instalación sin configuración guardada inicia sesión desde el formulario', async () => {
  mode = 'ok';
  const { page, close } = await harness.page('admin');
  try {
    await page.evaluate(async () => {
      (await import('/js/core/auth.js')).clearSession();
      location.hash = '#/login';
    });
    await page.reload();
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }));
    await page.locator('#login-email').fill('admin.remote@example.test');
    await page.locator('#login-password').fill('secreto-remoto');
    const request = page.waitForRequest(req => req.url().endsWith('/auth/v1/token?grant_type=password'));
    await page.locator('#login-password').press('Enter');
    assert.equal(new URL((await request).url()).host, 'lakmsmozjbbbokobobgf.supabase.co');
    await page.waitForSelector('.nav-item');
  } finally { await close(); }
});

test('El formulario permite activar Supabase cuando el navegador lo tenía desactivado', async () => {
  const { page, close } = await harness.page('admin');
  try {
    await page.evaluate(async () => {
      localStorage.setItem('pollito-supabase-config', JSON.stringify({ enabled: false }));
      (await import('/js/core/auth.js')).clearSession();
      location.hash = '#/login';
    });
    await page.reload();
    await page.getByText('Modo independiente.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Activar Supabase' }).click();
    await page.getByText('Supabase está configurado.', { exact: false }).waitFor();
    assert.equal(await page.getByText('Modo independiente.', { exact: false }).count(), 0);
  } finally { await close(); }
});

test('El login restaura la URL y la clave del proyecto cuando el navegador usa otra conexión', async () => {
  const { page, close } = await harness.page('admin');
  try {
    await page.evaluate(async () => {
      localStorage.setItem('pollito-supabase-config', JSON.stringify({
        url: 'https://otro-proyecto.supabase.co', anonKey: 'clave-de-prueba', enabled: true,
      }));
      (await import('/js/core/auth.js')).clearSession();
      location.hash = '#/login';
    });
    await page.reload();
    await page.getByRole('button', { name: 'Usar Supabase del proyecto' }).click();
    await page.getByText('El acceso requiere un perfil activo en Supabase.').waitFor();
    assert.equal(await page.evaluate(async () => {
      const { getSupabaseConfig, DEFAULT_SUPABASE } = await import('/js/config.js');
      const config = getSupabaseConfig();
      return config.enabled && config.url === DEFAULT_SUPABASE.url && config.anonKey === DEFAULT_SUPABASE.anonKey;
    }), true);
  } finally { await close(); }
});
