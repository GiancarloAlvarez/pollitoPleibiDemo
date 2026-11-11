import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { browserHarness } from './browser-harness.mjs';
let harness; const writes = [];
before(async () => {
  harness = await browserHarness({ transport: route => {
    const request = route.request();
    const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers});
    if (request.url().includes('/rest/v1/ordenes') && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({status:403,headers,contentType:'application/json',body:JSON.stringify({code:'42501',message:'new row violates row-level security policy for table "ordenes"'})});
    }
    return route.fulfill({status:200,headers,contentType:'application/json',body:'[]'});
  }});
});
after(async () => harness?.close());

test('Sin sesión remota no se intenta escribir una orden como anon', async () => {
  const session = await harness.page('cajero');
  try {
    const before = writes.length;
    const error = await session.page.evaluate(async () => {
      localStorage.removeItem('pollito-supabase-session');
      try { await (await import('/js/core/supabase.js')).upsertRow('ordenes',{id:crypto.randomUUID()}); }
      catch (error) { return {message:error.message,code:error.code}; }
    });
    assert.equal(error.code,'AUTH_SESSION_REQUIRED');
    assert.match(error.message,/sesión.*Supabase/i);
    assert.equal(writes.length,before);
  } finally { await session.close(); }
});

test('Rechazo RLS con sesión conserva el pendiente y explica la política', async () => {
  const session = await harness.page('cajero');
  try {
    const result = await session.page.evaluate(async () => {
      const {state} = await import('/js/core/state.js');
      const order = await (await import('/js/core/repo.js')).createOrder({items:[{...state.products[0],qty:1}],paymentMethod:'Tarjeta'});
      localStorage.setItem('pollito-supabase-session',JSON.stringify({access_token:'qa-fake-token',user:{id:crypto.randomUUID()}}));
      Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
      const result = await (await import('/js/core/sync.js')).syncNow({silent:true});
      Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
      const pending = (await (await import('/js/core/db.js')).dbGetAll('outbox')).find(row=>row.payload.id===order.id);
      return {ok:result.ok,message:result.error?.message,pending:!!pending,attempts:pending?.attempts};
    });
    assert.equal(result.ok,false);
    assert.equal(result.pending,true);
    assert.equal(result.attempts,1);
    assert.match(result.message,/RLS.*ordenes/);
    assert.match(result.message,/usuario_id/);
  } finally { await session.close(); }
});

test('Token vencido sin refresh no se usa ni se sustituye por anon', async () => {
  const session = await harness.page('cajero');
  try {
    const before = writes.length;
    const code = await session.page.evaluate(async () => {
      localStorage.setItem('pollito-supabase-session',JSON.stringify({access_token:'qa-expired-token',expires_at:Date.now()-1000}));
      try { await (await import('/js/core/supabase.js')).upsertRow('ordenes',{id:crypto.randomUUID()}); }
      catch (error) { return error.code; }
    });
    assert.equal(code,'AUTH_SESSION_REQUIRED');
    assert.equal(writes.length,before);
  } finally { await session.close(); }
});
