import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalService, supabaseIdentityProvider } from './server.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const demo = process.argv.includes('--demo');
const directory = path.resolve(process.env.LOCAL_DATA_DIR || path.join(root, '.data'));
await mkdir(directory, { recursive: true });
const cert = process.env.LOCAL_TLS_CERT, key = process.env.LOCAL_TLS_KEY;
if (!!cert !== !!key) throw new Error('Configura certificado y clave HTTPS conjuntamente.');
const tls = cert ? { cert: await readFile(cert), key: await readFile(key) } : null;
const host = process.env.LOCAL_HOST || '127.0.0.1';
const allowedHosts = (process.env.LOCAL_ALLOWED_HOSTS || '127.0.0.1,localhost,[::1]').split(',').map(s => s.trim());
const service = await createLocalService({ databasePath: path.join(directory, demo ? 'demo.sqlite' : 'local.sqlite'), demo, tls, allowedHosts,
  identityProvider: supabaseIdentityProvider({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }) });
try {
  const address = await service.listen(Number(process.env.LOCAL_PORT || 4174), host);
  console.log(`Pollito Pleibi: ${demo ? 'DEMOSTRACIÓN LOCAL' : 'servicio local'} en ${tls ? 'https' : 'http'}://${host}:${address.port}`);
  console.log('Operaciones locales persistentes. Envío a Supabase pendiente del siguiente módulo.');
} catch (error) { await service.close(); throw error; }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await service.close(); process.exit(0); });
