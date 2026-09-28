import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from './dist/server/index.js';

globalThis.crypto??=webcrypto;
const ui={};ui.window=ui;vm.createContext(ui);vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),ui);
const routeIds=['route-a','route-b','route-c','route-d'];
const first=ui.SurvivePool.selectTopRankedRoutesForNextRound(routeIds.map((route_id,index)=>({route_id,rank:index+1})),routeIds,['route-a','route-b'],.3);
assert.deepEqual(Array.from(first.enabled_route_ids),['route-a','route-b']);
const reranked=ui.SurvivePool.selectTopRankedRoutesForNextRound([{route_id:'route-a',rank:3},{route_id:'route-b',rank:4},{route_id:'route-c',rank:1},{route_id:'route-d',rank:2}],routeIds,first.enabled_route_ids,.3);
assert.deepEqual(Array.from(reranked.enabled_route_ids),['route-c','route-d'],'two previously excluded routes enter the top ceil(30%) after reranking');
assert.deepEqual(Array.from(reranked.promoted_route_ids),['route-c','route-d']);
assert.deepEqual(Array.from(reranked.demoted_route_ids),['route-a','route-b']);
const seventeen=Array.from({length:17},(_,index)=>({route_id:`candidate-${index}`,rank:index+1}));
assert.equal(ui.SurvivePool.selectTopRankedRoutesForNextRound(seventeen,seventeen.map(row=>row.route_id),[],.3).enabled_route_ids.length,6,'17 candidates include ceil(30%) = 6 routes after reranking');
const appSource=readFileSync('dist/app.js','utf8'),start=appSource.indexOf('function includeTopThirtyAfterReranking(plan,roundLabel)'),end=appSource.indexOf('function poolAttemptedCellIds()',start),inclusionSource=start>=0&&end>start?appSource.slice(start,end):null;
assert.ok(inclusionSource,'the app must apply the next-round selection after completed rerankings');
const clientState={routes:routeIds.map(id=>({id})),poolScreening:{results:[{route_id:'route-a',rank:3},{route_id:'route-b',rank:4},{route_id:'route-c',rank:1},{route_id:'route-d',rank:2}],enabled_route_ids:['route-a','route-b'],history:[]}};
const client={state:clientState,window:{SurvivePool:ui.SurvivePool},enabledPoolRouteIds:()=>clientState.poolScreening.enabled_route_ids};vm.createContext(client);
vm.runInContext(inclusionSource+';globalThis.apply=includeTopThirtyAfterReranking;',client);
const clientPlan={execution_ledger:[]};client.apply(clientPlan,1);
assert.deepEqual(Array.from(clientState.poolScreening.enabled_route_ids),['route-c','route-d'],'the browser marks promoted routes INCLUDED');
assert.deepEqual(Array.from(clientPlan.execution_ledger[0].promoted_route_ids),['route-c','route-d'],'the plan records promotions for review');
assert.match(appSource,/snapshot=\{cells,routes:state\.routes\.map\(route=>\(\{route_id:route\.id\}\)\)\}/,'the frozen authorization identifies the full route pool');
assert.match(appSource,/policy_version:'automatic_route_evolution_parallel_v3'/,'new cycles use the promotion-capable server policy');
assert.match(appSource,/includeTopThirtyAfterReranking\(plan,round\+1\)/,'every completed automatic round refreshes inclusion, including the final round');
assert.match(appSource,/includeTopThirtyAfterReranking\(plan,screen\.generation\)/,'completed manual rounds use the same full-pool rule');

const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(statement=>statement.execute());}},RENTCAST_API_KEY:'offline-test-key'},origin='https://top-thirty.test';
const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
function center(q){if(q===0)return{latitude:41.91063814,longitude:-87.66769738};const rad=Math.PI/180,lat0=41.91063814*rad,lon0=-87.66769738*rad,x=1000*q,rho=Math.abs(x),c=rho/6371008.8,s=Math.sin(c),co=Math.cos(c);return{latitude:Number((Math.asin(co*Math.sin(lat0))/rad).toFixed(8)),longitude:Number(((lon0+Math.atan2(x*s,rho*co*Math.cos(lat0)))/rad).toFixed(8))};}
const cells=routeIds.map((routeId,q)=>({cell_id:`CHI1K-V1-Q+${q}-R+0`,q,r:0,route_id:routeId,...center(q)}));
assert.equal((await call('/api/honeycomb/construct',{grid_version:'CHI1K-V1',cells})).status,200);
const snapshot={cells:cells.map(({cell_id,latitude,longitude,route_id})=>({cell_id,latitude,longitude,route_ids:[route_id]})),routes:routeIds.map(route_id=>({route_id}))};
const fingerprint=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))),byte=>byte.toString(16).padStart(2,'0')).join('');
const plan_id='top-thirty-promotion-01',approval={plan_id,approved:true,purpose:'automatic_route_evolution',policy_version:'automatic_route_evolution_parallel_v3',subject_profile:'rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',maximum_attempts:4,candidate_pool_snapshot:snapshot,candidate_pool_fingerprint:fingerprint,authorized_route_ids:routeIds,enabled_route_ids:['route-a'],per_route_quota:1,rounds:3,cull_fraction:.4,top_fraction:.3};
const approved=await call('/api/providers/avm/approve',approval);assert.equal(approved.status,200,JSON.stringify(await approved.clone().json()));
const selection=(attempt_index,index)=>({attempt_index,route_id:routeIds[index],cell:{cell_id:cells[index].cell_id,latitude:cells[index].latitude,longitude:cells[index].longitude}});
const firstSelection=selection(0,0);
assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:0,selections:[firstSelection]})).status,200);
const realFetch=globalThis.fetch;let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;return Response.json({price:300000});};
try{
  assert.equal((await call('/api/providers/avm/attempt',{plan_id,round_index:0,...firstSelection})).status,200);
  assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:1,selections:[selection(1,1),selection(2,2),selection(3,3)]})).status,403,'the next round may sample only ceil(30%) of four candidates');
  const promoted=[selection(1,2),selection(2,3)];
  assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:1,selections:promoted})).status,200,'routes absent from round 1 may be included after reranking');
  for(const item of promoted)assert.equal((await call('/api/providers/avm/attempt',{plan_id,round_index:1,...item})).status,200);
  assert.equal(providerCalls,3,'only the exact reserved cells reached the offline provider mock');
}finally{globalThis.fetch=realFetch;db.close();}
console.log('Top-30% reranking promotion, server authorization, and per-round ceiling passed offline.');
