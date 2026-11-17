import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { browserHarness, nav, sale } from './browser-harness.mjs';
let harness;
before(async () => { harness = await browserHarness(); });
after(async () => harness?.close());

test('POS exige apertura; comprobante conserva vendedor, fondo, precios y cambio', async () => {
  const session = await harness.page('cajero'); const p = session.page;
  try {
    await p.locator('[data-action=checkout]').click();
    assert.equal(await p.locator('.modal-card').count(), 0);
    const product = await p.evaluate(async () => (await import('/js/core/state.js')).state.products[0]);
    const order = await sale(p, product.id, '<img src=x onerror=alert(1)>');
    assert.ok(order.user_id && order.seller_name && order.local_cash_session_id);
    assert.equal(order.demo_sale, true);
    assert.equal(order.change_due, 0);
    assert.equal(order.items[0].price, product.price);
    const pending = await p.evaluate(async id => (await (await import('/js/core/db.js')).dbGetAll('outbox')).find(entry => entry.payload.id === id), order.id);
    assert.equal(pending.payload.id, order.id);
    await p.locator(`[data-receipt="${order.id}"]`).click();
    assert.equal(await p.locator('.commercial-receipt img').count(), 0);
    assert.match(await p.locator('.commercial-receipt').innerText(), /No válido como comprobante fiscal/);
    assert.match(await p.locator('.commercial-receipt').innerText(), /DEMOSTRACIÓN/);
    const before = await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('orders')).length);
    // Interceptar print solo para verificar documento/acción, sin afirmar impresión física.
    await p.evaluate(() => { window.__prints = 0; HTMLIFrameElement.prototype.__defineGetter__('contentWindow', function () { return { focus() {}, print() { window.__prints++; } }; }); });
    await p.locator('.modal-card button[type=submit]').click();
    await p.waitForFunction(() => window.__prints === 1);
    const source = await p.locator('#receipt-print-frame').getAttribute('srcdoc');
    assert.match(source, /&lt;img/);
    assert.match(source, /80mm auto/);
    assert.equal(await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('orders')).length), before);
    await p.keyboard.press('Escape');
    await nav(p, 'pos');
    assert.match(await p.locator('.cash-status').innerText(), /100/);
  } finally { await session.close(); }
});

test('UI caja y recibo a 360, 768 y 1366; teclado y contraste del comprobante', async () => {
  const session = await harness.page('cajero'); const p = session.page;
  try {
    const id = await p.evaluate(async () => (await import('/js/core/state.js')).state.products[0].id);
    const order = await sale(p, id, 'QA responsive');
    for (const [width, height] of [[360,800],[768,1024],[1366,768]]) {
      await p.setViewportSize({ width, height });
      await nav(p, 'pos');
      assert.ok(await p.locator('[data-action=open-cash]').isVisible());
      await p.locator('[data-action=open-cash]').click();
      assert.ok((await p.locator('.modal-card').boundingBox()).width <= width);
      await p.keyboard.press('Escape');
      await nav(p, 'ordenes');
      await p.locator(`[data-receipt="${order.id}"]`).click();
      const modal = p.locator('.modal-card');
      const box = await modal.boundingBox();
      assert.ok(box.width <= width);
      const colors = await p.locator('.commercial-receipt').evaluate(el => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
      assert.deepEqual(colors, { fg:'rgb(23, 23, 23)', bg:'rgb(255, 255, 255)' });
      await modal.locator('button[type=submit]').focus();
      await p.keyboard.press('Tab');
      assert.equal(await modal.locator('[data-modal-close]').first().evaluate(el => el === document.activeElement), true);
      await p.keyboard.press('Escape');
      assert.equal(await p.locator(`[data-receipt="${order.id}"]`).evaluate(el => el === document.activeElement), true);
    }
  } finally { await session.close(); }
});

test('Cierre Z demo: arqueo, diferencia, persistencia y gasto posterior', async () => {
  const session = await harness.page('cajero'); const p = session.page;
  try {
    const product = await p.evaluate(async () => (await import('/js/core/state.js')).state.products[0]);
    const order = await sale(p, product.id, 'QA cierre');
    const expected = Math.round((100 + Number(order.total)) * 100) / 100;
    await nav(p, 'pos');
    assert.match(await p.locator('.cash-status').innerText(), /100/);
    await p.locator('[data-action=close-cash]').click();
    const modal = p.locator('.modal-card');
    await modal.waitFor();
    const text = await modal.innerText();
    assert.match(text, /Cobros en efectivo/);
    assert.match(text, /Efectivo esperado/);
    assert.equal(Number(await modal.locator('[name=declared]').inputValue()), expected);
    await modal.locator('[name=declared]').fill(String(expected + 5));
    assert.match(await modal.locator('[data-cash-difference]').innerText(), /5\.00/);
    await modal.locator('[name=cash_notes]').fill('QA cierre');
    await p.evaluate(() => { window.__prints = 0; HTMLIFrameElement.prototype.__defineGetter__('contentWindow', function () { return { focus() {}, print() { window.__prints++; } }; }); });
    await modal.locator('button[type=submit]').click();
    await p.locator('.cash-close-receipt').waitFor();
    const z = await p.locator('.cash-close-receipt').innerText();
    assert.match(z, /Cierre de caja \(Z\)/);
    assert.match(z, /5\.00/);
    assert.match(z, /DEMOSTRACIÓN/);
    await p.locator('.modal-card button[type=submit]').click();
    await p.waitForFunction(() => window.__prints === 1);
    assert.match(await p.locator('#cash-close-print-frame').getAttribute('srcdoc'), /80mm auto/);
    await p.keyboard.press('Escape');
    const closed = await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('cash_sessions')).find(row => row.estado === 'cerrada'));
    assert.equal(Number(closed.monto_declarado), expected + 5);
    assert.equal(Number(closed.diferencia), 5);
    assert.equal(closed.notas, 'QA cierre');
    await p.locator('[data-action=open-cash]').click();
    await p.locator('[name=opening_amount]').fill('100');
    await p.locator('.modal-card button[type=submit]').click();
    await p.locator('.modal-card').waitFor({ state: 'detached' });
    await p.locator('[data-action=cash-movement]').click();
    await p.locator('[name=movement_type]').selectOption('gasto');
    await p.locator('[data-cash-category]:not([hidden])').waitFor();
    await p.locator('[name=category]').selectOption('Insumos');
    await p.locator('[name=movement_amount]').fill('20');
    await p.locator('[name=movement_concept]').fill('Compra QA');
    await p.locator('.modal-card button[type=submit]').click();
    await p.locator('.modal-card').waitFor({ state: 'detached' });
    await p.locator('[data-action=open-cash]').click();
    await p.locator('.modal-card').waitFor();
    const arqueo = await p.locator('.modal-card').innerText();
    assert.match(arqueo, /Gastos pagados de caja/);
    assert.match(arqueo, /20\.00/);
    assert.match(arqueo, /80\.00/);
  } finally { await session.close(); }
});

test('Cobro: efectivo insuficiente no crea venta; recibido y cambio quedan históricos', async () => {
  const session = await harness.page('cajero'); const p = session.page;
  try {
    await p.locator('[data-action=open-cash]').click();
    await p.locator('.modal-card button[type=submit]').click();
    await p.locator('.modal-card').waitFor({state:'detached'});
    const before = await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('orders')).length);
    await p.locator('[data-action=checkout]').click();
    const exact = Number(await p.locator('[name=amount_received]').inputValue());
    await p.locator('[name=amount_received]').fill(String(exact - 1));
    await p.locator('.modal-card button[type=submit]').click();
    await p.locator('.modal-error:visible').waitFor();
    assert.equal(await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('orders')).length), before);
    await p.locator('[name=customer]').fill('QA cambio');
    await p.locator('[name=amount_received]').fill(String(exact + 100));
    await p.locator('.modal-card button[type=submit]').click();
    await p.waitForURL('**/#/ordenes');
    const order = await p.evaluate(async () => (await (await import('/js/core/db.js')).dbGetAll('orders')).find(row => row.customer === 'QA cambio'));
    assert.equal(order.amount_received, exact + 100);
    assert.equal(order.change_due, 100);
  } finally { await session.close(); }
});

test('Persistencia multistore revierte la venta si falla la escritura de outbox', async () => {
  const session = await harness.page('cajero');
  try {
    const result = await session.page.evaluate(async () => {
      const db = await import('/js/core/db.js');
      const id = crypto.randomUUID();
      let failed = false;
      try { await db.dbAtomicPut([{store:'orders',value:{id}}, {store:'outbox',value:{payload:{id}}}]); }
      catch { failed = true; }
      return {failed, order: await db.dbGet('orders',id)};
    });
    assert.deepEqual(result, {failed:true, order:null});
  } finally { await session.close(); }
});

test('ACK incompleto conserva pendiente y no destruye líneas locales', async () => {
  const mock = await browserHarness({ transport: r => {
    const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    return r.fulfill({status:r.request().method()==='GET'?200:204,headers,body:r.request().method()==='GET'?'[]':undefined});
  }});
  const session = await mock.page('cajero');
  try {
    const result = await session.page.evaluate(async () => {
      const { state } = await import('/js/core/state.js');
      const { createOrder } = await import('/js/core/repo.js');
      const { syncNow } = await import('/js/core/sync.js');
      const db = await import('/js/core/db.js');
      const order = await createOrder({items:[{...state.products[0],qty:1}],paymentMethod:'Tarjeta'});
      Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
      const result = await syncNow({silent:true});
      Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
      return {ok:result.ok, pending:(await db.dbGetAll('outbox')).some(row=>row.payload.id===order.id), items:(await db.dbGet('orders',order.id)).items.length};
    });
    assert.deepEqual(result,{ok:false,pending:true,items:1});
  } finally { await session.close(); await mock.close(); }
});

test('PWA real: favicon nuevo y primera recarga offline con caja y órdenes', async () => {
  const real = await browserHarness({realServiceWorker:true});
  const session = await real.page('cajero'); const p = session.page;
  try {
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const cached = await p.evaluate(async paths => {
      const stores = await Promise.all((await caches.keys()).map(name => caches.open(name)));
      return Promise.all(paths.map(async path => (await Promise.all(stores.map(cache => cache.match(path)))).some(Boolean)));
    }, ['./assets/icons/pollito.svg','./assets/icons/pollito-192.png','./js/components/receipt.js','./js/core/cash.js','./js/views/orders.view.js']);
    assert.ok(cached.every(Boolean));
    await p.context().setOffline(true);
    await p.reload();
    await p.locator('[data-action=open-cash]').waitFor();
    assert.equal(await p.locator('link[rel=icon][type="image/svg+xml"]').getAttribute('href'), 'assets/icons/pollito.svg');
    await nav(p, 'ordenes');
    assert.equal(await p.locator('h1').innerText(), 'Órdenes');
  } finally { await session.close(); await real.close(); }
});

test('Caja remota simulada: timeout conserva ID; venta mapea caja, vendedor y comprobante', async () => {
  const owner = '00000000-0000-4000-8000-000000000002';
  const requests = []; let row;
  const mock = await browserHarness({ transport: r => {
    const request = r.request();
    const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    if (request.method() === 'OPTIONS') return r.fulfill({status:204,headers});
    if (!request.url().endsWith('/rest/v1/rpc/abrir_caja')) return r.abort();
    const body = request.postDataJSON(); requests.push(body);
    row = {id:body.p_id,usuario_id:owner,monto_inicial:body.p_monto,estado:'abierta',fecha_apertura:new Date().toISOString()};
    if (requests.length === 1) return r.abort('connectionfailed');
    return r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(row)});
  }});
  const session = await mock.page('cajero');
  try {
    const result = await session.page.evaluate(async owner => {
      const {state} = await import('/js/core/state.js');
      localStorage.setItem('pollito-supabase-session', JSON.stringify({
        access_token: 'qa-access-token', refresh_token: 'qa-refresh-token',
        expires_at: Date.now() + 3600000, user: {id: owner},
      }));
      state.user = {...state.user,remote_id:owner};
      const {openCashSession} = await import('/js/core/cash.js');
      const {createOrder} = await import('/js/core/repo.js');
      const {toRemote} = await import('/js/core/schema-map.js');
      const id = crypto.randomUUID(); let failed = false;
      Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
      try { await openCashSession(250,id); } catch { failed=true; }
      const cash = await openCashSession(250,id);
      Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
      const order = await createOrder({items:[{...state.products[0],qty:1}],paymentMethod:'Tarjeta',cashSession:cash});
      return {failed, id, mapped:toRemote('orders',order)};
    }, owner);
    assert.equal(result.failed,true);
    assert.equal(requests.length,2);
    assert.deepEqual(requests[0],requests[1]);
    assert.equal(result.mapped.caja_sesion_id,result.id);
    assert.equal(result.mapped.usuario_id,owner);
    assert.equal(result.mapped.metodo_pago,'tarjeta');
    assert.ok(result.mapped.comprobante_negocio.business_name);
  } finally { await session.close(); await mock.close(); }
});
