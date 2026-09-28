import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import worker from './dist/server/index.js';

globalThis.crypto??=webcrypto;
const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(statement=>statement.execute());}},RENTCAST_API_KEY:'dummy'},origin='https://parallel.test';
const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
function center(q){if(q===0)return{latitude:41.91063814,longitude:-87.66769738};const rad=Math.PI/180,lat0=41.91063814*rad,lon0=-87.66769738*rad,px=1000*q,rho=Math.abs(px),c=rho/6371008.8,s=Math.sin(c),co=Math.cos(c),lon=lon0+Math.atan2(px*s,rho*Math.cos(lat0)*co);return{latitude:Number((Math.asin(co*Math.sin(lat0))/rad).toFixed(8)),longitude:Number((lon/rad).toFixed(8))};}
const cells=Array.from({length:6},(_,q)=>({cell_id:`CHI1K-V1-Q+${q}-R+0`,q,r:0,...center(q)}));
assert.equal((await call('/api/honeycomb/construct',{grid_version:'CHI1K-V1',cells})).status,200);
const snapshot={cells:cells.map(({cell_id,latitude,longitude},index)=>({cell_id,latitude,longitude,route_ids:[index<3?'route-a':'route-b']})),routes:[{route_id:'route-a'},{route_id:'route-b'}]};
const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))),byte=>byte.toString(16).padStart(2,'0')).join('');
const planId='parallel-auto-test-01',approval={plan_id:planId,approved:true,purpose:'automatic_route_evolution',policy_version:'automatic_route_evolution_parallel_v2',subject_profile:'rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',maximum_attempts:6,candidate_pool_snapshot:snapshot,candidate_pool_fingerprint:fingerprint,authorized_route_ids:['route-a','route-b'],enabled_route_ids:['route-a','route-b'],per_route_quota:2,rounds:3,cull_fraction:.4};
const approved=await call('/api/providers/avm/approve',approval);assert.equal(approved.status,200,JSON.stringify(await approved.clone().json()));assert.equal((await approved.json()).parallel_rounds,true);
const selection=(attemptIndex,cellIndex,route_id)=>({attempt_index:attemptIndex,route_id,cell:{cell_id:cells[cellIndex].cell_id,latitude:cells[cellIndex].latitude,longitude:cells[cellIndex].longitude}});
const round0={plan_id:planId,round_index:0,selections:[selection(0,0,'route-a'),selection(1,1,'route-a'),selection(2,3,'route-b'),selection(3,4,'route-b')]};
assert.equal((await call('/api/providers/avm/round',{...round0,selections:[selection(0,0,'route-a'),selection(1,0,'route-a')]})).status,403,'duplicate cell rejected before reservation');
assert.equal((await call('/api/providers/avm/round',round0)).status,200,'exact round reserved before any provider call');
assert.equal((await call('/api/providers/avm/round',round0)).status,409,'reservation cannot be replayed');
assert.equal((await call('/api/providers/avm/round',{plan_id:planId,round_index:1,selections:[selection(4,2,'route-a')]})).status,409,'next round cannot start while prior calls are reserved');
assert.equal((await call('/api/providers/avm/attempt',{plan_id:planId,round_index:0,route_id:'route-b',attempt_index:0,cell:round0.selections[0].cell})).status,403,'reserved cell cannot be redirected to another route');
let outbound=0;const releases=[];const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{outbound++;return await new Promise(resolve=>releases.push(()=>resolve(Response.json({price:300000}))));};
try{
  const attempts=round0.selections.map(item=>call('/api/providers/avm/attempt',{plan_id:planId,round_index:0,...item}));
  for(let tick=0;tick<100&&outbound<4;tick++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(outbound,4,'all four approved AVM lookups reach the provider before any result returns');
  assert.equal((await call('/api/providers/avm/attempt',{plan_id:planId,round_index:0,...round0.selections[0]})).status,409,'a pending parallel cell cannot be replayed');
  for(const release of releases.reverse())release();
  const results=await Promise.all(attempts);assert.deepEqual(results.map(response=>response.status),[200,200,200,200]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM provider_attempts WHERE round_id=? AND status='complete'").get(planId).n,4);
  assert.equal(db.prepare('SELECT SUM(used_count) AS n FROM rentcast_rate_seconds').get().n,4,'only actual outbound calls consume shared rate slots');
  assert.equal((await call('/api/providers/avm/round',{plan_id:planId,round_index:1,selections:[{attempt_index:4,route_id:'route-a',cell:{cell_id:cells[2].cell_id,latitude:cells[2].latitude,longitude:cells[2].longitude}}]})).status,200,'a completed round permits one cull survivor');
  assert.equal((await call('/api/providers/avm/cancel',{plan_id:planId})).status,200);
  assert.equal((await call('/api/providers/avm/attempt',{plan_id:planId,round_index:1,route_id:'route-a',attempt_index:4,cell:{cell_id:cells[2].cell_id,latitude:cells[2].latitude,longitude:cells[2].longitude}})).status,409,'revocation prevents a reserved cell from starting');
  assert.equal(outbound,4,'rejection and cancellation caused no extra provider calls');
  assert.equal(db.prepare('SELECT SUM(used_count) AS n FROM rentcast_rate_seconds').get().n,4,'rejection and cancellation consume no rate slots');
}finally{globalThis.fetch=originalFetch;db.close();}
console.log('Passed parallel Auto round reservation, simultaneous provider calls, exact cell and route scope, replay protection, round barrier, and cancellation. No real provider calls.');
