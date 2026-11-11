import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, asRole, ids } from './database-harness.mjs';
let db;
const operation = '70000000-0000-4000-8000-000000000001';
const migration = await readFile(new URL('../../docs/supabase/20261111_caja_comprobantes.sql', import.meta.url), 'utf8');
before(async () => { db = await fixture(); await db.exec(migration); });
after(async () => db?.close());
const cashier = (fn, prepare) => asRole(db, 'authenticated', ids.cajero, fn, prepare);
const closeFixture = q => q.query("UPDATE caja_sesiones SET estado='cerrada' WHERE usuario_id=$1", [ids.cajero]);

test('CAJA nueva: apertura y repetición devuelven una única sesión con autor', async () => cashier(async q => {
  const first = await q.query('SELECT abrir_caja($1,250.50) AS caja', [operation]);
  const retry = await q.query('SELECT abrir_caja($1,250.50) AS caja', [operation]);
  assert.deepEqual(first.rows, retry.rows);
  assert.equal(first.rows[0].caja.usuario_id, ids.cajero);
  assert.equal(Number(first.rows[0].caja.monto_inicial), 250.5);
  assert.equal((await q.query("SELECT count(*)::int n FROM caja_sesiones WHERE estado='abierta'")).rows[0].n, 1);
}, closeFixture));

test('CAJA rechaza otra apertura mientras existe una sesión abierta', async () => {
  await assert.rejects(cashier(q => q.query('SELECT abrir_caja($1,20)', [operation])), /Ya tienes una caja abierta/);
});
test('CAJA rechaza reutilización de ID con monto diferente', async () => {
  await assert.rejects(cashier(async q => {
    await q.query('SELECT abrir_caja($1,20)', [operation]);
    await q.query('SELECT abrir_caja($1,30)', [operation]);
  }, closeFixture), /otro contenido/);
});
test('CAJA cocina, anónimo e inactivo no pueden abrir', async () => {
  await assert.rejects(asRole(db, 'authenticated', ids.cocina, q => q.query('SELECT abrir_caja($1,20)', [operation])), /sin permiso/);
  await assert.rejects(asRole(db, 'anon', null, q => q.query('SELECT abrir_caja($1,20)', [operation])), /permission denied/);
  await assert.rejects(cashier(q => q.query('SELECT abrir_caja($1,20)', [operation]), q => q.query('UPDATE perfiles SET activo=false WHERE id=$1', [ids.cajero])), /sin permiso/);
});
test('CAJA cajero solo lee su caja y no modifica el fondo vía tabla', async () => {
  await cashier(async q => {
    const result = await q.query('SELECT usuario_id FROM caja_sesiones');
    assert.ok(result.rows.length && result.rows.every(row => row.usuario_id === ids.cajero));
  });
  await assert.rejects(cashier(q => q.query('UPDATE caja_sesiones SET monto_inicial=999')), /permission denied/);
});
const insertSale = (q, owner, box) => q.query(`INSERT INTO ordenes(usuario_id,caja_sesion_id,cliente,subtotal,itbis,total,pagado,metodo_pago,efectivo_recibido,cambio)
  VALUES($1,$2,'QA',100,18,118,true,'efectivo',120,2) RETURNING usuario_id,vendedor_nombre,caja_sesion_id,estado`, [owner, box]);
test('VENTA guarda vendedor y caja sin cambiar estado de cocina por cobrar', async () => cashier(async q => {
  const result = await insertSale(q, ids.cajero, ids.cashierBox);
  assert.equal(result.rows[0].usuario_id, ids.cajero);
  assert.equal(result.rows[0].caja_sesion_id, ids.cashierBox);
  assert.ok(result.rows[0].vendedor_nombre);
  assert.equal(result.rows[0].estado, 'nueva');
}));
test('VENTA rechaza caja ajena, cerrada y atribución a otro vendedor', async () => {
  await assert.rejects(cashier(q => insertSale(q, ids.cajero, ids.adminBox)), /pertenece a otro/);
  await assert.rejects(cashier(q => insertSale(q, ids.admin, ids.cashierBox)), /vendedor debe ser/);
  await assert.rejects(cashier(q => insertSale(q, ids.cajero, ids.cashierBox), closeFixture), /no está abierta/);
});
test('Migración se puede repetir sin eliminar datos', async () => {
  const before = (await db.query('SELECT count(*) n FROM ordenes')).rows[0].n;
  await db.exec(migration);
  assert.equal((await db.query('SELECT count(*) n FROM ordenes')).rows[0].n, before);
});
test('Diagnóstico de relaciones no señala inconsistencias en fixture coherente', async () => {
  const sql = await readFile(new URL('../../docs/supabase/diagnostico_ventas_caja.sql', import.meta.url), 'utf8');
  const result = await db.exec(sql);
  for (const index of [1,2,3,4]) assert.equal(result[index].rows.length, 0);
});
test('Relaciones migradas rechazan pago o detalle sin orden', async () => {
  await assert.rejects(cashier(q => q.query("INSERT INTO pagos(metodo,monto) VALUES('efectivo',1)")), /null value/);
  await assert.rejects(cashier(q => q.query("INSERT INTO orden_detalles(nombre_snapshot,cantidad,precio_unitario) VALUES('QA',1,1)")), /null value/);
});
