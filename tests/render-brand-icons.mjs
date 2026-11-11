// Generación reproducible de PNG desde el SVG local; no realiza peticiones remotas.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findExecutable } from './helpers.js';
const svg = await readFile(new URL('../assets/icons/pollito.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: findExecutable(), headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  for (const size of [32, 180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`../assets/icons/pollito-${size}.png`, import.meta.url)), omitBackground: true });
  }
} finally { await browser.close(); }
