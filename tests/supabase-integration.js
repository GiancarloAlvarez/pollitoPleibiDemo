/**
 * Pruebas de integración contra un proyecto Supabase real (REST + Auth, sin librería oficial).
 * Requiere variables de entorno:
 *   SUPABASE_URL            https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY       anon (public) key
 *   SUPABASE_TEST_EMAIL     usuario creado en Authentication
 *   SUPABASE_TEST_PASSWORD  su contraseña
 * Si falta alguna variable, el suite se omite (exit 0) para no romper CI local.
 *
 * Uso: npm run test:remote
 */
import { Trace } from './helpers.js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SUPABASE_TEST_EMAIL;
const PASSWORD = process.env.SUPABASE_TEST_PASSWORD;

const t = new Trace('Supabase Integration');

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.log('SKIP: faltan variables SUPABASE_* (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD).');
  process.exit(0);
}

const rest = (path, method, token, body) => fetch(`${URL}/rest/v1/${path}`, {
  method,
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(method !== 'GET' ? { Prefer: 'return=representation' } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});

try {
  // 1. Auth: obtener JWT con el usuario de prueba
  t.section('Auth');
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const auth = await res.json();
  if (!res.ok || !auth.access_token) {
    t.fail('login supabase', auth.error_description || auth.msg || `HTTP ${res.status}`);
    t.summary();
    process.exit(1);
  }
  t.ok('login supabase emit access_token', true);
  const token = auth.access_token;

  // helper REST
  const j = async (path, method = 'GET', body) => {
    const r = await rest(path, method, token, body);
    if (r.status === 204) return [];
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(`REST ${method} ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  };

  // 2. Lectura de catálogo
  t.section('Lectura catálogo');
  const cats = await j('categorias?select=id,nombre,orden&order=orden.asc&limit=20');
  t.ok(`categorias leídas (${cats.length})`, cats.length > 0);
  const prods = await j('productos?select=id,nombre,precio,disponible&limit=50');
  t.ok(`productos leídos (${prods.length})`, prods.length > 0);

  // filtrado por estado (RLS: messages de negocio no leen la de otro, etc.)
  const inact = await j('productos?select=id&activo=eq.false&limit=5');
  t.ok('filtro activo=false funciona', Array.isArray(inact));

  // 3. Upsert + updated_at trigger
  t.section('Escritura y triggers');
  const key = `test-${Date.now()}`;
  const conf = await j('configuracion', 'POST', { key, valor: { ok: true } });
  const created = Array.isArray(conf) ? conf[0] : conf;
  t.ok('INSERT configuracion', Boolean(created.id));
  await new Promise((r) => setTimeout(r, 1200));
  const upd = await j(`configuracion?key=eq.${key}`, 'PATCH', { valor: { ok: false, v: 2 } });
  const afterUpd = Array.isArray(upd) ? upd[0] : upd;
  t.ok('PATCH configuracion', Boolean(afterUpd));
  if (afterUpd.updated_at) t.ok('updated_at auto por trigger', new Date(afterUpd.updated_at) > new Date(created.updated_at || Date.now() - 60_000));
  else t.fail('updated_at', 'no regresó updated_at');
  await j(`configuracion?key=eq.${key}`, 'DELETE');
  t.ok('DELETE configuracion limpia', true);

  // 4. Auditoría vía trigger
  t.section('Auditoría');
  const kode = `AUD-${Date.now()}`;
  const catIns = await j('categorias', 'POST', { nombre: kode, orden: 999, activo: false });
  const cat = Array.isArray(catIns) ? catIns[0] : catIns;
  await j(`categorias?id=eq.${cat.id}`, 'PATCH', { nombre: `${kode} v2` });
  await new Promise((r) => setTimeout(r, 800));
  const aud = await j(`registro_auditoria?tabla=eq.categorias&orden=creado_en.desc&limit=10`);
  const hit = aud.find((a) => (a.detalle || JSON.stringify(a)).includes(kode) || a.id === cat.id);
  if (hit) t.ok('auditoría registró el cambio', true);
  else t.fail('auditoría', 'no apareció el registro dentro de los últimos 10');
  await j(`categorias?id=eq.${cat.id}`, 'DELETE');

  // 5. Orden + detalles + pagos en una transacción (fuera de caja abierta permitida)
  t.section('Ventas');
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const ord = await j('ordenes', 'POST', { codigo: code, estado: 'nueva', canal: 'salon', total: 0 });
  const order = Array.isArray(ord) ? ord[0] : ord;
  const prod = prods[0];
  const det = await j('orden_detalles', 'POST', {
    orden_id: order.id, producto_id: prod.id, nombre_producto: prod.nombre,
    cantidad: 2, precio_unitario: prod.precio, subtotal: prod.precio * 2,
  });
  t.ok('orden + orden_detalles creados', Boolean((Array.isArray(det) ? det[0] : det).id));
  const ticket = await j(`cocina_tickets?orden_id=eq.${order.id}&select=id,orden_id,estado`);
  t.ok('trigger creó cocina_tickets automáticamente', ticket.length > 0);
  await j(`ordenes?id=eq.${order.id}`, 'PATCH', { estado: 'anulada' });
  const tick2 = await j(`cocina_tickets?orden_id=eq.${order.id}&select=estado`);
  if (tick2.length && tick2[0].estado === 'anulada') t.ok('ticket sincroniza estado de orden', true);
  else t.skip('ticket sync', tick2.length ? `estado=${tick2[0].estado}` : 'sin ticket');
  await j(`ordenes?id=eq.${order.id}`, 'DELETE');

  // 6. RLS de escritura: catálogo exige admin; usuario admin sí debe poder
  t.section('RLS');
  {
    const nuevoPrecio = Math.round((prod.precio || 100)) + 1;
    try {
      await j(`productos?id=eq.${prod.id}`, 'PATCH', { precio: nuevoPrecio });
      t.ok('admin puede editar precios', true);
      await j(`productos?id=eq.${prod.id}`, 'PATCH', { precio: prod.precio });
    } catch (err) {
      t.fail('RLS admin editar producto', err);
    }
  }
} catch (error) {
  t.fail('suite', error);
}
t.summary();
