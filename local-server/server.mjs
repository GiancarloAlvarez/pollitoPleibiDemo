import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LocalStore, problem, verifyPassword } from './store.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const COOKIE = 'pollito_lan_session';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/** Verifica Auth y perfil mediante JWT del propio usuario; nunca usa service_role. */
export function supabaseIdentityProvider({ url, anonKey, fetchImpl = fetch } = {}) {
  if (!url || !anonKey) return null;
  if (!/^https:\/\//.test(url)) throw problem('La URL de Supabase requiere HTTPS.');
  const base = url.replace(/\/$/, '');
  return async (email, password) => {
    let response;
    try {
      response = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, { method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(6000) });
    } catch { throw Object.assign(problem('No se pudo alcanzar Supabase.', 503), { network: true }); }
    if (!response.ok) throw problem('Credenciales inválidas o usuario no autorizado.', 401);
    const auth = await response.json();
    if (!auth.user?.id || !auth.access_token) throw problem('Respuesta de autenticación inválida.', 502);
    let profileResponse;
    try {
      profileResponse = await fetchImpl(`${base}/rest/v1/perfiles?id=eq.${encodeURIComponent(auth.user.id)}&select=id,nombre,rol,activo,deleted_at&limit=1`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${auth.access_token}` }, signal: AbortSignal.timeout(6000) });
    } catch { throw Object.assign(problem('No se pudo verificar el perfil.', 503), { network: true }); }
    if (!profileResponse.ok) throw problem('No se pudo autorizar el perfil.', 403);
    const [profile] = await profileResponse.json();
    if (!profile || profile.activo === false || profile.deleted_at) throw Object.assign(problem('Este usuario está desactivado o no tiene perfil.', 403), { disable: true });
    const role = profile.rol === 'cocinero' ? 'cocina' : profile.rol;
    if (!['admin', 'cajero', 'cocina'].includes(role)) throw problem('Rol no autorizado.', 403);
    return { id: auth.user.id, remote_id: auth.user.id, email: auth.user.email || email,
      name: profile.nombre, role, active: true };
  };
}

export async function createLocalService({ databasePath, demo = false, identityProvider = null,
  tls = null, allowedHosts = ['127.0.0.1', 'localhost', '[::1]'], sessionMs = 12 * 3600000,
  offlineLoginMs = 24 * 3600000 } = {}) {
  if (!databasePath) throw problem('Indica una ubicación persistente de SQLite.');
  const store = new LocalStore(databasePath, { demo });
  if (demo && !store.rows('products').length) {
    const { buildSeed, DEMO_PASSWORD } = await import('../js/data/seed.js');
    const seed = await buildSeed();
    store.transaction(() => {
      for (const name of ['products', 'inventory', 'suppliers', 'movements']) for (const row of seed[name]) store.put(name, row);
      store.put('settings', seed.settings);
      for (const user of seed.users) store.saveIdentity(user, DEMO_PASSWORD);
    });
  }
  const clients = new Set(), attempts = new Map();
  let server;
  const cookieToken = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const sessionCookie = (token, age) => `${COOKIE}=${token}; Path=/api/local; HttpOnly; SameSite=Strict; Max-Age=${age}${tls ? '; Secure' : ''}`;
  function reply(res, status, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(JSON.stringify(body));
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw problem('Se requiere JSON.', 415);
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      chunks.push(chunk); length += chunk.length;
      if (length > 65536) throw problem('Solicitud demasiado grande.', 413);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw problem('JSON inválido.'); }
  }
  function broadcast() {
    const message = `id: ${store.revision()}\nevent: change\ndata: ${JSON.stringify({ revision: store.revision() })}\n\n`;
    for (const client of clients) {
      if (!store.session(client.token)) { client.res.end(); clients.delete(client); }
      else client.res.write(message);
    }
  }
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!store.session(client.token)) { client.res.end(); clients.delete(client); }
      else client.res.write(': heartbeat\n\n');
    }
  }, 15000);
  heartbeat.unref();

  async function handler(req, res) {
    try {
      const url = new URL(req.url, `${tls ? 'https' : 'http'}://${req.headers.host}`);
      if (!allowedHosts.includes(url.hostname)) throw problem('Host local no autorizado.', 403);
      if (url.pathname.startsWith('/api/local/')) {
        if (req.headers.origin && req.headers.origin !== url.origin) throw problem('Origen no autorizado.', 403);
        if (!['GET', 'POST'].includes(req.method)) throw problem('Método no permitido.', 405);
        if (req.method === 'POST' && req.headers.origin !== url.origin) throw problem('La solicitud necesita el origen local.', 403);
        if (url.pathname === '/api/local/status' && req.method === 'GET') {
          return reply(res, 200, { service: 'pollito-local', version: 1, demo,
            authentication: demo ? 'demo-explicit' : 'supabase-profile-cache', authConfigured: demo || !!identityProvider,
            cloudSync: 'pending-module', secure: !!tls });
        }
        if (url.pathname === '/api/local/login' && req.method === 'POST') {
          const data = await body(req), email = String(data.email || '').trim().toLowerCase(), password = String(data.password || '');
          if (!email || !password || email.length > 160 || password.length > 256) throw problem('Completa tus credenciales.');
          const now = Date.now(), key = `${req.socket.remoteAddress}:${email}`;
          for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
          if (attempts.size > 2000) throw problem('Demasiados intentos. Intenta más tarde.', 429);
          const attempt = attempts.get(key) || { count: 0, until: now + 60000 };
          if (attempt.count >= 6) throw problem('Demasiados intentos. Espera un minuto.', 429);
          attempt.count++; attempts.set(key, attempt);
          let account = store.account(email), offline = false;
          if (!demo) {
            if (!identityProvider) throw problem('Configura Supabase en el servicio local o inicia la demostración explícitamente.', 503);
            try { account = store.saveIdentity(await identityProvider(email, password), password); }
            catch (error) {
              if (error.disable) store.disable(email);
              if (!error.network) throw error;
              if (!account?.active || now - account.validated_at > offlineLoginMs || !verifyPassword(password, account)) {
                throw problem('Sin internet y no hay una autorización local vigente para esta cuenta.', 401);
              }
              offline = true;
            }
          } else if (!account?.active || !verifyPassword(password, account)) throw problem('Credenciales inválidas.', 401);
          const session = store.createSession(account, sessionMs); attempts.delete(key);
          return reply(res, 200, { user: session.user, csrf: session.csrf, expiresAt: session.expiresAt, offline },
            { 'Set-Cookie': sessionCookie(session.token, Math.floor(sessionMs / 1000)) });
        }
        const token = cookieToken(req), session = store.session(token);
        if (!session) throw problem('Inicia sesión en el servicio local.', 401);
        if (req.method === 'POST' && req.headers['x-pollito-csrf'] !== session.csrf) throw problem('La sesión necesita actualizarse.', 403);
        if (url.pathname === '/api/local/session' && req.method === 'GET') return reply(res, 200, session);
        if (url.pathname === '/api/local/logout' && req.method === 'POST') {
          store.revoke(token); broadcast(); return reply(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (url.pathname === '/api/local/bootstrap' && req.method === 'GET') return reply(res, 200, store.bootstrap(session.user));
        if (url.pathname === '/api/local/commands' && req.method === 'POST') {
          const result = store.command(session.user, await body(req));
          if (!result.replayed) broadcast();
          const row = session.user.role === 'admin' ? result.row
            : store.bootstrap(session.user).data[result.store]?.find(r => r.id === result.row.id);
          return reply(res, 200, { ...result, row, revision: store.revision(), pendingCloud: store.pendingCloud() });
        }
        if (url.pathname === '/api/local/events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
            Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
          res.write(`event: ready\ndata: ${JSON.stringify({ revision: store.revision() })}\n\n`);
          const client = { token, res }; clients.add(client);
          req.on('close', () => clients.delete(client)); return;
        }
        throw problem('Recurso local no encontrado.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw problem('Método no permitido.', 405);
      const pathname = decodeURIComponent(url.pathname);
      if (!['/', '/index.html', '/sw.js', '/manifest.webmanifest'].includes(pathname)
          && !/^\/(js|css|assets)\//.test(pathname)) throw problem('Recurso no disponible.', 404);
      const filename = await realpath(path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname)));
      if (!filename.startsWith(ROOT + path.sep)) throw problem('Recurso no disponible.', 404);
      const bytes = await readFile(filename);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
        'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!res.headersSent) reply(res, error.status || (error.code === 'ENOENT' ? 404 : 500),
        { message: error.status ? error.message : 'No se pudo completar la operación local.' });
      else res.end();
    }
  }
  server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  return { server, store,
    async listen(port = 4174, host = '127.0.0.1') {
      if (!tls && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw problem('La red LAN requiere HTTPS y hosts autorizados.');
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return server.address();
    },
    async close() {
      clearInterval(heartbeat); for (const c of clients) c.res.end(); clients.clear();
      if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
      store.close();
    } };
}
