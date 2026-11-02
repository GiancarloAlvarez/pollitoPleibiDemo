/**
 * Helper compartido para testing E2E e integración.
 * - Lanza Chrome/Edge vía playwright-core sin descargar navegadores.
 * - Login local demo (PBKDF2 seed) y utilidades de reporte.
 */
import fs from 'node:fs';

const CANDIDATES = {
  chrome: [
    process.env.CHROME_PATH,
    `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean),
  edge: [
    process.env.EDGE_PATH,
    `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean),
};

export function findExecutable() {
  for (const key of Object.keys(CANDIDATES)) {
    for (const p of CANDIDATES[key]) {
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(
    'No se encontró Chrome ni Edge. Define CHROME_PATH o EDGE_PATH (ruta al ejecutable).\n'
    + 'Ej. Windows PowerShell: $env:CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'
  );
}

export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@pollitopleibi.do';
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'PollitoPleibi2026!';
export const CAJERO_EMAIL = process.env.TEST_CAJERO_EMAIL || 'cajero@pollitopleibi.do';
export const CAJERO_PASSWORD = process.env.TEST_CAJERO_PASSWORD || 'PollitoPleibi2026!';

/** Loguea en la app con los accesos demo (base local). */
export async function login(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  const button = await page.waitForSelector('button[type="submit"]', { timeout: 5000 })
    .catch(async () => {
      const candidates = await page.$$('button');
      for (const b of candidates) {
        const text = (await b.textContent() || '').toLowerCase();
        if (text.includes('entrar') || text.includes('iniciar') || text.includes('login')) return b;
      }
      throw new Error('No se encontró botón de login.');
    });
  await button.click();
  await page.waitForSelector('[data-view="dashboard"], .app-shell, .nav-item', { timeout: 10000 });
  await page.waitForTimeout(400);
}

/**
 * Mini framework de reporte; los tests lo importan:
 *   const tr = new Trace();
 *   tr.ok('nombre', true);
 *   tr.fail('nombre', error);
 *   tr.summary();  // exit(1) si hubo fallos
 */
export class Trace {
  constructor(label = 'Suite') {
    this.label = label;
    this.passCount = 0;
    this.failCount = 0;
    this.skipCount = 0;
    this.log = [];
  }
  ok(name) {
    this.passCount += 1;
    this.log.push(`PASS  · ${name}`);
    console.log(`  ✓ ${name}`);
  }
  fail(name, error) {
    this.failCount += 1;
    const msg = error && error.message ? error.message : String(error);
    this.log.push(`FAIL  · ${name} — ${msg}`);
    console.log(`  ✗ ${name} — ${msg}`);
  }
  skip(name, reason) {
    this.skipCount += 1;
    this.log.push(`SKIP  · ${name} — ${reason}`);
    console.log(`  - ${name} (${reason})`);
  }
  section(name) {
    console.log(`\n${name}`);
    this.log.push(`\n${name}`);
  }
  summary() {
    console.log(`\n${this.label}: ${this.passCount} PASS · ${this.failCount} FAIL · ${this.skipCount} SKIP`);
    if (this.failCount > 0) process.exitCode = 1;
    return this.failCount === 0;
  }
}

/** Espera $ms milisegundos (parar uso de sleep cuando sea evitable). */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
