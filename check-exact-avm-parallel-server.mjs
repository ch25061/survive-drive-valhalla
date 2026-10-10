import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(s=>s.execute());}},RENTCAST_API_KEY:'offline-key'},origin='https://exact-parallel.test';
const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
const cells=Array.from({length:70},(_,i)=>({cell_id:'exact-cell-'+i,latitude:40+i*.0001,longitude:-80}));
const approval={plan_id:'exact-parallel-01',approved:true,subject_profile:'rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',maximum_attempts:70,cells,execution:'parallel_exact_cells_v1'};
const approved=await call('/api/providers/avm/approve',approval);assert.equal(approved.status,200);const grant=await approved.json();assert.equal(grant.serial,false);assert.equal(grant.maximum_concurrency,64);assert.equal(grant.requests_per_second,18);assert.deepEqual(grant.cells,cells);
const originalFetch=globalThis.fetch,releases=[];let outbound=0;
globalThis.fetch=async url=>{outbound++;const target=new URL(url);assert.ok(cells.some(c=>target.searchParams.get('latitude')===String(c.latitude)),'coordinates come from frozen cells');return new Promise(resolve=>releases.push(()=>resolve(Response.json({price:300000}))));};
const attempt=index=>call('/api/providers/avm/attempt',{plan_id:approval.plan_id,attempt_index:index,cell:{latitude:0,longitude:0}});
const waitFor=async check=>{for(let i=0;i<500&&!check();i++)await new Promise(r=>setTimeout(r,2));assert.ok(check());};
try{
  const requests=Array.from({length:64},(_,i)=>attempt(i));
  await waitFor(()=>db.prepare("SELECT COUNT(*) AS n FROM provider_attempts WHERE status='pending'").get().n===64);
  assert.equal((await attempt(64)).status,409,'atomic in-flight ceiling rejects the 65th request');
  assert.equal((await attempt(70)).status,403,'cannot exceed frozen cell list or budget');
  assert.equal((await attempt(0)).status,409,'pending index cannot be replayed');
  await waitFor(()=>outbound>=2);assert.ok(outbound>=2,'several provider requests are live before any completes');
  assert.equal((await call('/api/providers/avm/cancel',{plan_id:approval.plan_id})).status,200);
  const sentAtCancel=outbound;
  for(const release of releases.reverse())release();
  const results=await Promise.all(requests);
  assert.equal(outbound,sentAtCancel,'rate-queued cells check revocation before outbound fetch');
  assert.equal(results.filter(r=>r.status===200).length,sentAtCancel,'already-sent requests complete after cancellation');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM provider_attempts WHERE status='complete'").get().n,sentAtCancel);
  assert.equal((await attempt(69)).status,409,'revoked plan cannot launch unused cells');
  assert.equal((await call('/api/providers/avm/approve',approval)).status,409,'authorization cannot be replayed');
  const legacy=await call('/api/providers/avm/approve',{...approval,plan_id:'legacy-exact-01',execution:undefined,cells:cells.slice(0,2),maximum_attempts:2});assert.equal((await legacy.json()).serial,true,'already supported serial contracts remain available');
  const cachePlan={...approval,plan_id:'parallel-cache-01',cells:cells.slice(0,2),maximum_attempts:2};
  assert.equal((await call('/api/providers/avm/approve',cachePlan)).status,200);
  const cacheResults=await Promise.all([0,1].map(attempt_index=>call('/api/providers/avm/attempt',{plan_id:cachePlan.plan_id,attempt_index})));
  for(const response of cacheResults){assert.equal(response.status,200);assert.equal((await response.json()).provider_attempted,false);}
  assert.equal(outbound,sentAtCancel,'parallel cache hits cause no paid requests');
  const failurePlan={...approval,plan_id:'parallel-failure-01',cells:cells.slice(68),maximum_attempts:2};
  assert.equal((await call('/api/providers/avm/approve',failurePlan)).status,200);
  let failureCalls=0;globalThis.fetch=async()=>{failureCalls++;return failureCalls===1?Response.json({error:'mock confirmed failure'},{status:500}):Response.json({price:450000});};
  const failure=await call('/api/providers/avm/attempt',{plan_id:failurePlan.plan_id,attempt_index:0});assert.equal(failure.status,502);assert.equal((await failure.json()).provider_attempted,true);
  assert.equal((await call('/api/providers/avm/attempt',{plan_id:failurePlan.plan_id,attempt_index:1})).status,200,'confirmed failure consumes its slot but permits other approved cells');
  assert.equal(failureCalls,2,'confirmed failure is not retried');
  const uncertainPlan={...approval,plan_id:'parallel-uncertain-01',cells:[{cell_id:'unknown-0',latitude:42,longitude:-80},{cell_id:'unknown-1',latitude:43,longitude:-80}],maximum_attempts:2};
  assert.equal((await call('/api/providers/avm/approve',uncertainPlan)).status,200);
  let unknownCalls=0;globalThis.fetch=async()=>{unknownCalls++;throw Error('mock network failure');};
  const uncertain=await call('/api/providers/avm/attempt',{plan_id:uncertainPlan.plan_id,attempt_index:0});assert.equal((await uncertain.json()).uncertain,true);
  assert.equal((await call('/api/providers/avm/attempt',{plan_id:uncertainPlan.plan_id,attempt_index:1})).status,409,'server independently blocks unused cells after an uncertain result');
  assert.equal(unknownCalls,1,'unknown results are not retried or substituted');
  assert.ok(db.prepare('SELECT used_count FROM rentcast_rate_seconds').all().every(row=>row.used_count<=18),'shared rate buckets never exceed the existing 18-request limit');
}finally{globalThis.fetch=originalFetch;db.close();}
console.log('Passed atomic 64-request ceiling, simultaneous exact lookups, frozen coordinates, replay/budget rejection, cancellation of rate-queued work and legacy approval. No live calls.');
