import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, asRole, ids } from './database-harness.mjs';
let db;
const operation = '70000000-0000-4000-8000-000000000001';
const migration = await readFile(new URL('../../docs/supabase/20261111_caja_comprobantes.sql', import.meta.url), 'utf8');
const closingMigration = await readFile(new URL('../../docs/supabase/20261117_caja_apertura_cierre.sql', import.meta.url), 'utf8');
before(async () => { db = await fixture(); await db.exec(migration); await db.exec(closingMigration); });
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
  await db.exec(closingMigration);
  assert.equal((await db.query('SELECT count(*) n FROM ordenes')).rows[0].n, before);
});
test('Migración de cierre se aplica sola sobre schema_completo', async () => {
  const solo = await fixture();
  try {
    await solo.exec(closingMigration);
    const result = await asRole(solo, 'authenticated', ids.cajero,
      q => q.query('SELECT caja_estado_esquema() AS estado'));
    assert.equal(result.rows[0].estado.cerrar_caja, true);
  } finally { await solo.close(); }
});
test('ESQUEMA de caja reporta las RPC necesarias', async () => cashier(async q => {
  const result = await q.query('SELECT caja_estado_esquema() AS estado');
  const estado = result.rows[0].estado;
  for (const key of ['abrir_caja', 'cerrar_caja', 'resumen_caja', 'movimientos_caja', 'gastos_caja']) {
    assert.equal(estado[key], true, key);
  }
}));
test('ARQUEO suma cobros en efectivo sin duplicar el total de la orden', async () => cashier(async q => {
  const result = await q.query('SELECT resumen_caja($1) AS resumen', [ids.cashierBox]);
  const resumen = result.rows[0].resumen;
  assert.equal(Number(resumen.monto_inicial), 100);
  assert.equal(Number(resumen.cobros_efectivo), 118);
  assert.equal(Number(resumen.esperado), 218);
  assert.equal(Number(resumen.gastos_caja), 0);
}));
test('ARQUEO oculta la caja ajena al cajero y permite al admin consultarla', async () => {
  await assert.rejects(cashier(q => q.query('SELECT resumen_caja($1)', [ids.adminBox])), /no autorizado|pertenece/i);
  await asRole(db, 'authenticated', ids.admin, async q => {
    const result = await q.query('SELECT resumen_caja($1) AS resumen', [ids.cashierBox]);
    assert.equal(Number(result.rows[0].resumen.esperado), 218);
  });
});
test('MOVIMIENTOS de entrada y retiro ajustan el efectivo esperado con idempotencia', async () => cashier(async q => {
  const entrada = '71000000-0000-4000-8000-000000000001';
  const retiro = '71000000-0000-4000-8000-000000000002';
  const first = await q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5) AS mov', [entrada, ids.cashierBox, 'entrada', 50, 'Cambio QA']);
  const retry = await q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5) AS mov', [entrada, ids.cashierBox, 'entrada', 50, 'Cambio QA']);
  assert.equal(first.rows[0].mov.id, retry.rows[0].mov.id);
  assert.equal(first.rows[0].mov.tipo, 'entrada');
  await q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5)', [retiro, ids.cashierBox, 'retiro', 30, 'Retiro QA']);
  const resumen = (await q.query('SELECT resumen_caja($1) AS resumen', [ids.cashierBox])).rows[0].resumen;
  assert.equal(Number(resumen.entradas), 50);
  assert.equal(Number(resumen.retiros), 30);
  assert.equal(Number(resumen.esperado), 238);
}));
test('MOVIMIENTOS rechazan reutilizar el ID con otro monto y la caja ajena', async () => {
  const id = '71000000-0000-4000-8000-000000000003';
  await assert.rejects(cashier(async q => {
    await q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5)', [id, ids.cashierBox, 'entrada', 10, 'QA']);
    await q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5)', [id, ids.cashierBox, 'entrada', 20, 'QA']);
  }), /otro contenido/);
  await assert.rejects(cashier(q => q.query('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5)', [id, ids.adminBox, 'entrada', 10, 'QA'])), /no autorizado|pertenece|propietario/i);
});
test('GASTOS de caja descuentan del efectivo esperado y no se escriben por tabla', async () => cashier(async q => {
  const result = await q.query('SELECT registrar_gasto_caja($1,$2,$3,$4,$5) AS gasto',
    ['72000000-0000-4000-8000-000000000001', ids.cashierBox, 'Insumos', 20, 'Compra QA']);
  assert.equal(Number(result.rows[0].gasto.monto), 20);
  assert.equal(result.rows[0].gasto.salio_de_caja, true);
  const resumen = (await q.query('SELECT resumen_caja($1) AS resumen', [ids.cashierBox])).rows[0].resumen;
  assert.equal(Number(resumen.gastos_caja), 20);
  assert.equal(Number(resumen.esperado), 198);
}));
test('GASTOS y movimientos rechazan escrituras directas de anon', async () => {
  await assert.rejects(asRole(db, 'anon', null, q => q.query(
    "INSERT INTO movimientos_caja(caja_sesion_id,tipo,monto,concepto,usuario_id) VALUES($1,'entrada',1,'QA',$2)",
    [ids.cashierBox, ids.cajero])), /permission denied/);
  await assert.rejects(asRole(db, 'anon', null, q => q.query(
    "INSERT INTO gastos(categoria,monto,usuario_id,salio_de_caja,caja_sesion_id) VALUES('QA',1,$1,true,$2)",
    [ids.cajero, ids.cashierBox])), /permission denied/);
});
test('CIERRE calcula diferencia, queda inmutable y solo lo hace el propietario', async () => {
  await cashier(async q => {
    const closed = await q.query('SELECT cerrar_caja($1,$2,$3) AS cierre', [ids.cashierBox, 220, 'Cierre QA']);
    const cierre = closed.rows[0].cierre;
    assert.equal(cierre.estado, 'cerrada');
    assert.equal(Number(cierre.monto_declarado), 220);
    assert.equal(Number(cierre.diferencia), 2);
    assert.equal(Number(cierre.esperado), 218);
    const retry = await q.query('SELECT cerrar_caja($1,$2,$3) AS cierre', [ids.cashierBox, 220, 'Cierre QA']);
    assert.deepEqual(retry.rows[0].cierre, cierre);
    const row = (await q.query('SELECT estado,monto_declarado,diferencia,fecha_cierre FROM caja_sesiones WHERE id=$1', [ids.cashierBox])).rows[0];
    assert.equal(row.estado, 'cerrada');
    assert.equal(Number(row.monto_declarado), 220);
    assert.equal(Number(row.diferencia), 2);
    assert.ok(row.fecha_cierre);
    const denied = async (sql, params) => {
      await q.exec('SAVEPOINT expected_failure');
      let message = '';
      try { await q.query(sql, params); } catch (error) { message = error.message; }
      await q.exec('ROLLBACK TO SAVEPOINT expected_failure');
      return message;
    };
    assert.match(await denied('SELECT cerrar_caja($1,$2,$3)', [ids.cashierBox, 230, 'Otro cierre']), /ya está cerrada/);
    assert.match(await denied('SELECT registrar_movimiento_caja($1,$2,$3,$4,$5)',
      ['71000000-0000-4000-8000-000000000009', ids.cashierBox, 'entrada', 5, 'QA']), /no está abierta/);
  });
  await assert.rejects(cashier(q => q.query('SELECT cerrar_caja($1,$2,$3)', [ids.adminBox, 100, null])), /no autorizado|pertenece|propietario/i);
});
test('CIERRE rechaza declarado negativo o con más de dos decimales', async () => {
  await assert.rejects(cashier(q => q.query('SELECT cerrar_caja($1,$2,$3)', [ids.cashierBox, -1, null])), /declarado inválido/);
  await assert.rejects(cashier(q => q.query('SELECT cerrar_caja($1,$2,$3)', [ids.cashierBox, 1.005, null])), /declarado inválido/);
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
