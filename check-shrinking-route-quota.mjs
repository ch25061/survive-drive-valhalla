import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from './dist/server/index.js';

globalThis.crypto??=webcrypto;
const ui={};ui.window=ui;vm.createContext(ui);vm.runInContext(readFileSync('dist/pool-screening.js','utf8'),ui);
const routeIds=['route-a','route-b','route-c','route-d','route-e'];
const ranks=routeIds.map((route_id,index)=>({route_id,rank:index+1,coverage_pct:50}));
const first=ui.SurvivePool.selectRoutesForCullRound(ranks,routeIds,routeIds,1);
assert.deepEqual(Array.from(first.enabled_route_ids),['route-a','route-b','route-c'],'cull 1 excludes two of five routes at three-eighths rounded up');
const reranked=ui.SurvivePool.selectRoutesForCullRound([{route_id:'route-a',rank:4},{route_id:'route-b',rank:5},{route_id:'route-c',rank:2},{route_id:'route-d',rank:1},{route_id:'route-e',rank:3}],routeIds,first.enabled_route_ids,2);
assert.deepEqual(Array.from(reranked.enabled_route_ids),['route-d'],'cull 2 fills its one remaining slot from the full ranking');
assert.deepEqual(Array.from(reranked.promoted_route_ids),['route-d']);
assert.deepEqual(Array.from(reranked.demoted_route_ids),['route-a','route-b','route-c']);
const thirtyFour=Array.from({length:34},(_,index)=>({route_id:`candidate-${index}`,rank:index+1,coverage_pct:50}));
assert.deepEqual([1,2,3].map(round=>ui.SurvivePool.routeQuotaForCullRound(34,round)),[21,13,8],'34 original routes cull three-eighths at each round');
assert.deepEqual([1,2,3].map(round=>ui.SurvivePool.routeQuotaForCullRound(27,round)),[16,10,6],'27 original routes cull three-eighths at each round');
assert.equal(ui.SurvivePool.routeQuotaForCullRound(8,1),5,'three lowest of eight are excluded');
const eight=Array.from({length:8},(_,index)=>({route_id:`eight-${index+1}`,rank:index+1,coverage_pct:50}));
assert.deepEqual(Array.from(ui.SurvivePool.screenRoundZeroWithQuota(eight,eight.map(row=>row.route_id)).disabled_route_ids),['eight-6','eight-7','eight-8'],'Round 0 excludes the three lowest of eight unprotected routes');
const protectedRows=Array.from({length:5},(_,index)=>({route_id:`protected-${index}`,rank:index+1,coverage_pct:index<4?10:50}));
const protectedScreen=ui.SurvivePool.screenRoundZeroWithQuota(protectedRows,protectedRows.map(row=>row.route_id));
assert.equal(protectedScreen.quota,3);
assert.equal(protectedScreen.enabled_route_ids.length,4,'Round 0 keeps all four low-coverage routes above the nominal quota of three');
const appSource=readFileSync('dist/app.js','utf8'),start=appSource.indexOf('function applyCullSelection(plan,roundLabel,advance=true)'),end=appSource.indexOf('function poolAttemptedCellIds()',start),inclusionSource=start>=0&&end>start?appSource.slice(start,end):null;
assert.ok(inclusionSource,'the app must apply the next-round selection after completed rerankings');
const clientState={routes:routeIds.map(id=>({id})),poolScreening:{results:[{route_id:'route-a',rank:4},{route_id:'route-b',rank:5},{route_id:'route-c',rank:2},{route_id:'route-d',rank:1},{route_id:'route-e',rank:3}],enabled_route_ids:['route-a','route-b','route-c'],cull_round:1,history:[]}};
const client={state:clientState,window:{SurvivePool:ui.SurvivePool},enabledPoolRouteIds:()=>clientState.poolScreening.enabled_route_ids};vm.createContext(client);
vm.runInContext(inclusionSource+';globalThis.apply=applyCullSelection;',client);
const clientPlan={execution_ledger:[]};client.apply(clientPlan,1);
assert.deepEqual(Array.from(clientState.poolScreening.enabled_route_ids),['route-d'],'the browser fills the surviving slot');
assert.equal(clientState.poolScreening.cull_round,2,'the completed evidence round advances the cull');
assert.deepEqual(Array.from(clientPlan.execution_ledger[0].promoted_route_ids),['route-d'],'the plan records the promotion for review');
assert.match(appSource,/snapshot=\{cells,routes:state\.routes\.map\(route=>\(\{route_id:route\.id\}\)\)\}/,'the frozen authorization identifies the full route pool');
assert.match(appSource,/policy_version:'automatic_route_evolution_parallel_v6'/,'new cycles use the three-eighths server policy');
assert.match(appSource,/applyCullSelection\(plan,round\+1\)/,'every completed automatic round advances its cull, including the final round');
assert.match(appSource,/applyCullSelection\(plan,screen\.generation\)/,'completed manual rounds use the same full-pool rule');

const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},all(){return{results:statement.all(...this.args)};},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(statement=>statement.execute());}},RENTCAST_API_KEY:'offline-test-key'},origin='https://shrinking-quota.test';
const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
function center(q){if(q===0)return{latitude:41.91063814,longitude:-87.66769738};const rad=Math.PI/180,lat0=41.91063814*rad,lon0=-87.66769738*rad,x=1000*q,rho=Math.abs(x),c=rho/6371008.8,s=Math.sin(c),co=Math.cos(c);return{latitude:Number((Math.asin(co*Math.sin(lat0))/rad).toFixed(8)),longitude:Number(((lon0+Math.atan2(x*s,rho*co*Math.cos(lat0)))/rad).toFixed(8))};}
const cells=routeIds.map((routeId,q)=>({cell_id:`CHI1K-V1-Q+${q}-R+0`,q,r:0,route_id:routeId,...center(q)}));
assert.equal((await call('/api/honeycomb/construct',{grid_version:'CHI1K-V1',cells})).status,200);
const snapshot={cells:cells.map(({cell_id,latitude,longitude,route_id})=>({cell_id,latitude,longitude,route_ids:[route_id]})),routes:routeIds.map(route_id=>({route_id}))};
const fingerprint=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))),byte=>byte.toString(16).padStart(2,'0')).join('');
const plan_id='shrinking-quota-promotion-01',approval={plan_id,approved:true,purpose:'automatic_route_evolution',policy_version:'automatic_route_evolution_parallel_v6',subject_profile:'rentcast-value-v1|Single Family|3bed|2bath|1500sqft|lookup=false',maximum_attempts:5,candidate_pool_snapshot:snapshot,candidate_pool_fingerprint:fingerprint,authorized_route_ids:routeIds,enabled_route_ids:['route-a','route-b','route-c'],per_route_quota:1,rounds:3,cull_fraction:3/8,cull_round_start:1};
const approved=await call('/api/providers/avm/approve',approval);assert.equal(approved.status,200,JSON.stringify(await approved.clone().json()));
const selection=(attempt_index,index)=>({attempt_index,route_id:routeIds[index],cell:{cell_id:cells[index].cell_id,latitude:cells[index].latitude,longitude:cells[index].longitude}});
const firstSelection=selection(0,0);
assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:0,selections:[firstSelection]})).status,200);
const realFetch=globalThis.fetch;let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;return Response.json({price:300000});};
try{
  assert.equal((await call('/api/providers/avm/attempt',{plan_id,round_index:0,...firstSelection})).status,200);
  assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:1,selections:[selection(1,2),selection(2,3)]})).status,403,'cull 2 permits only one route');
  const promoted=selection(1,3);
  assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:1,selections:[promoted]})).status,200,'a previously excluded route may fill the new quota');
  assert.equal((await call('/api/providers/avm/attempt',{plan_id,round_index:1,...promoted})).status,200);
  const nextPromoted=selection(2,1);
  assert.equal((await call('/api/providers/avm/round',{plan_id,round_index:2,selections:[nextPromoted]})).status,200,'cull 3 permits one route from the full pool');
  assert.equal((await call('/api/providers/avm/attempt',{plan_id,round_index:2,...nextPromoted})).status,200);
  assert.equal(providerCalls,3,'only the exact reserved cells reached the offline provider mock');
}finally{globalThis.fetch=realFetch;db.close();}
console.log('Three-eighths culls, Round 0 protection, route substitution, and server ceilings passed offline.');
