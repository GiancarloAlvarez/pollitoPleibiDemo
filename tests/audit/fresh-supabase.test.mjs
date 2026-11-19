import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asRole, fixture, ids } from './database-harness.mjs';

test('El esquema completo arranca desde cero y permite autenticar el perfil de caja y cerrar', async () => {
  const db = await fixture({ fullSchema: true });
  try {
    const { rows: [initial] } = await db.query('SELECT count(*)::int AS users FROM auth.users');
    assert.equal(initial.users, 0);
    await db.query(`INSERT INTO auth.users (id, email, raw_app_meta_data)
      VALUES ($1, 'cajero@qa.invalid', '{"role":"cajero"}')`, [ids.cajero]);
    await asRole(db, 'authenticated', ids.cajero, async db => {
      const { rows: [profile] } = await db.query('SELECT id, rol, activo FROM public.perfiles');
      assert.deepEqual(profile, { id: ids.cajero, rol: 'cajero', activo: true });
      await db.query('SELECT public.abrir_caja($1, 100)', [ids.cashierBox]);
      const { rows: [{ cierre }] } = await db.query(
        'SELECT public.cerrar_caja($1, 98, $2) AS cierre', [ids.cashierBox, 'Arqueo QA'],
      );
      assert.equal(cierre.estado, 'cerrada');
      assert.equal(cierre.esperado, 100);
      assert.equal(cierre.diferencia, -2);
    });
    const sql = await readFile(new URL('../../docs/supabase/verificar_esquema_sync.sql', import.meta.url), 'utf8');
    const results = await db.exec(sql);
    const summary = results.at(-1).rows[0];
    assert.equal(Number(summary.fail), 0, JSON.stringify(results.at(-2).rows));
    assert.ok(Number(summary.pass) >= 319);
  } finally { await db.close(); }
});
