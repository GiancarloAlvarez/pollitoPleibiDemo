import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './database-harness.mjs';
let db;
before(async () => { db = await fixture(); });
after(async () => db?.close());

function createAuthUser({ id = crypto.randomUUID(), email = 'qa@example.test', app = {}, user = {} } = {}) {
  return db.query(
    `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [id, email, JSON.stringify(app), JSON.stringify(user)],
  );
}

test('AUTH-01 el trigger crea perfil activo con el rol declarado en app_metadata', async () => {
  const id = crypto.randomUUID();
  await createAuthUser({ id, email: 'admin.qa@example.test', app: { role: 'admin' }, user: { full_name: 'Admin QA' } });
  const { rows } = await db.query('SELECT nombre, rol, activo FROM perfiles WHERE id = $1', [id]);
  assert.deepEqual(rows[0], { nombre: 'Admin QA', rol: 'admin', activo: true });
});

test('AUTH-02 un rol en metadatos editables no activa el perfil', async () => {
  const id = crypto.randomUUID();
  await createAuthUser({ id, email: 'sin-rol.qa@example.test', user: { role: 'admin' } });
  const { rows } = await db.query('SELECT nombre, rol, activo FROM perfiles WHERE id = $1', [id]);
  assert.deepEqual(rows[0], { nombre: 'sin-rol.qa', rol: 'cajero', activo: false });
});

test('AUTH-03 el rol cocina/cocinero se normaliza al enum remoto y queda activo', async () => {
  const id = crypto.randomUUID();
  await createAuthUser({ id, email: 'cocina.qa@example.test', app: { role: 'cocina' }, user: { name: 'Cocina QA' } });
  const { rows } = await db.query('SELECT nombre, rol, activo FROM perfiles WHERE id = $1', [id]);
  assert.deepEqual(rows[0], { nombre: 'Cocina QA', rol: 'cocinero', activo: true });
});
