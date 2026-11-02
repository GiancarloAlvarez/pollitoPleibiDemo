/**
 * Servidor estático para pruebas E2E de `vanilla/`.
 * Sirve como lo haría Cloudflare Pages (SPA con hash routing).
 * Uso: node server.js [puerto] [directorio]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), ...headers });
  if (res.req && res.req.method === 'HEAD') return res.end();
  return res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  } catch (err) {
    return send(res, 400, 'URL inválido\n');
  }
  // Desactivamos service worker: la app no debe cachear durante las pruebas
  if (urlPath === '/sw.js') {
    return send(res, 200, '// deshabilitado durante tests', { 'Content-Type': 'text/javascript; charset=utf-8' });
  }
  const resolved = path.normalize(path.join(ROOT, urlPath));
  if (!resolved.startsWith(ROOT)) return send(res, 403, 'Forbidden\n');
  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA: cualquier ruta desconocida cae a index.html
      const idx = path.join(ROOT, 'index.html');
      return fs.readFile(idx, (e2, body) => {
        if (e2) return send(res, 404, 'Archivo no encontrado\n');
        send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    }
    const ext = path.extname(resolved).toLowerCase();
    fs.readFile(resolved, (e2, body) => {
      if (e2) return send(res, 500, 'Error leyendo archivo\n');
      send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de pruebas listo en http://127.0.0.1:${PORT}/ (sirve: ${ROOT})`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
