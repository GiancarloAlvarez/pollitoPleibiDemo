import { chromium } from 'playwright-core';
import { findExecutable, BASE_URL, login } from './helpers.js';

const routes = [
  'dashboard', 'poc', 'pos', 'cocina', 'productos', 'inventario',
  'reportes', 'proveedores', 'usuarios', 'config/conexion',
];
const VIEWS = {
  dashboard: 'dashboard', poc: 'dashboard', pos: 'pos', cocina: 'kitchen',
  productos: 'products', inventario: 'inventory', reportes: 'reports',
  proveedores: 'suppliers', usuarios: 'users', 'config/conexion': 'config',
};
const pts = { mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 } };

import fs from 'node:fs';
fs.mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ executablePath: findExecutable(), headless: true });
const errors = [];
for (const [name, vp] of Object.entries(pts)) {
  const context = await browser.newContext({ viewport: vp });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  try {
    await login(page);
  } catch (e) {
    errors.push(`[${name}] login FAIL: ${e.message}`);
    await page.screenshot({ path: `shots/${name}-login-fail.png`, fullPage: true });
    await context.close();
    continue;
  }
  for (const r of routes) {
    try {
      await page.goto(`${BASE_URL}/#/${r}`);
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(() => {
        const d = document.documentElement;
        return { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight };
      });
      const bad = overflow.sw > overflow.cw + 1;
      console.log(`${name} ${r}: overflowX=${overflow.sw}>${overflow.cw}${bad ? ' BAD' : ''}`);
      await page.screenshot({ path: `shots/${name}-${VIEWS[r] || r}.png`, fullPage: true });
    } catch (e) {
      errors.push(`[${name}] route ${r} FAIL: ${e.message}`);
    }
  }
  await context.close();
}
await browser.close();
console.log('\nERRORES:', errors.length ? errors.join('\n') : 'ninguno');
