import {before,after,test} from 'node:test';import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
let harness,session,paid,unpaid,first,retry;let failPayment=true;const requests=[];const remote = new Map();
before(async()=>{
 harness=await browserHarness({transport:r=>{
  const req=r.request(),u=new URL(req.url());if(!u.pathname.startsWith('/rest/v1/'))return r.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
   const table=u.pathname.split('/').at(-1);
   if(req.method()==='GET') {
     const id=u.searchParams.get('id')?.replace('eq.','');
     const order=remote.get(`ordenes:${id}`);
     const rows=id&&order?[{...order,orden_detalles:[...remote.values()].filter(row=>row.orden_id===id&&row.nombre_snapshot),pagos:[...remote.values()].filter(row=>row.orden_id===id&&row.metodo)}]:[];
     return r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(rows)});
   }
   if(req.method()!=='POST')return r.abort();
   const body=req.postDataJSON();requests.push({table,body,conflict:u.searchParams.get('on_conflict')});if(table==='pagos'&&failPayment){failPayment=false;return r.abort('connectionfailed')}
   remote.set(`${table}:${body.id}`,body);return r.fulfill({status:204,headers});
 }});session=await harness.page('cajero');const p=session.page;
 paid=await p.evaluate(async()=>{const{state}=await import('/js/core/state.js');return(await import('/js/core/repo.js')).createOrder({items:state.products.slice(0,2).map(p=>({...p,qty:1})),customer:'QA sync paid',paymentMethod:'Tarjeta'})});
 const sync=()=>p.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});try{const result=await(await import('/js/core/sync.js')).syncNow({silent:true});const pending=await(await import('/js/core/db.js')).dbGetAll('outbox');return {ok:result.ok,pending:pending.filter(e=>e.table==='orders').map(e=>e.payload.id)}}finally{Object.defineProperty(navigator,'onLine',{value:false,configurable:true})}});
 first=await sync();retry=await sync();
 unpaid=await p.evaluate(async()=>{const{state}=await import('/js/core/state.js');return(await import('/js/core/repo.js')).createOrder({items:[{...state.products[0],qty:1}],customer:'QA sync unpaid',paymentMethod:'Pendiente',paid:false})});await sync();
});
after(async()=>{await session?.close();await harness?.close()});
test('SYNC-01 los dos detalles persisten una vez tras reenviar la operación',()=>{
 const details=[...remote.entries()].filter(([key,row])=>key.startsWith('orden_detalles:')&&row.orden_id===paid.id).map(([,row])=>row);
 assert.equal(details.length,2);
 assert.deepEqual(details.map(row=>[row.producto_id,row.cantidad,row.precio_unitario,row.costo_unitario]),paid.items.map(item=>[item.product_id,item.qty,item.price,item.cost]));
 assert.equal(requests.filter(r=>r.table==='orden_detalles'&&r.body.orden_id===paid.id).length,4);
});
test('SYNC-02 el pago conserva Tarjeta',()=>assert.equal(requests.find(r=>r.table==='pagos'&&r.body.orden_id===paid.id)?.body.metodo,'tarjeta'));
test('SYNC-03 una orden pendiente no genera cobro',()=>assert.equal(requests.filter(r=>r.table==='pagos'&&r.body.orden_id===unpaid.id).length,0));
test('SYNC-04 fallo de transporte conserva cola e identidad para reintento',()=>{assert.equal(first.ok,false);assert.ok(first.pending.includes(paid.id));assert.equal(retry.ok,true);assert.ok(!retry.pending.includes(paid.id));const posts=requests.filter(r=>r.table==='ordenes'&&r.body.id===paid.id);assert.equal(posts.length,2);assert.ok(posts.every(r=>r.conflict==='id'))});
