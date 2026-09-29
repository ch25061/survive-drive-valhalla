import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import worker from './dist/server/index.js';
import './dist/census-ring.js';
import './dist/shotgun-gates.js';
const R=globalThis.SurviveCensusRing,G=globalThis.SurviveShotgun;
// Sample both boundaries, interiors, high latitudes, and the date line.
for(const origin of [[41.7445828,-87.7587891],[84.9,179.99],[-84.9,-179.99]])for(const[inner_miles,outer_miles]of [[7,8],[19,20],[.25,20],[.25,.5]]){
  const plan=R.plan({origin,inner_miles,outer_miles});assert.ok(plan.circles.length<=1024);assert.equal(new Set(plan.circles.map(c=>c.id)).size,plan.circles.length);
  for(let i=0;i<=8;i++)for(let angle=0;angle<360;angle+=3){const radius=(inner_miles+(outer_miles-inner_miles)*i/8)*R.MILE,point=R.destination(origin,Math.sin(angle*Math.PI/180)*radius,Math.cos(angle*Math.PI/180)*radius);assert.ok(plan.circles.some(c=>G.distanceM(point,c.center)<c.radius_m),'Uncovered ring sample '+JSON.stringify({origin,inner_miles,outer_miles,angle,i}));}
}
const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const s=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return s.get(...this.args)??null;},all(){return{results:s.all(...this.args)};},run(){return s.run(...this.args);},execute(){return s.columns().length?this.all():(this.run(),{results:[]});}};}
const env={DB:{prepare,batch:s=>s.map(x=>x.execute())}},base='https://test.example';
async function post(op,body){const response=await worker.fetch(new Request(base+'/api/intersections/ring/'+op,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);return{status:response.status,body:await response.json()};}
const params={origin:[41.7445828,-87.7587891],inner_miles:7,outer_miles:8};
{
  const brokenDb={prepare(){throw Error('D1_ERROR: Network connection lost.');}};
  const response=await worker.fetch(new Request(base+'/api/intersections/ring/claim',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...params,circle_index:0})}),{DB:brokenDb});
  assert.equal(response.status,503);
  const body=await response.json();assert.match(body.error,/road catalog storage is temporarily unavailable/i);assert.doesNotMatch(body.error,/AVM cache/i,'a Census storage outage must not be labeled an AVM failure');
}
const planned=await post('plan',params),plan=planned.body.plan;assert.equal(plan.circles.length,76);assert.equal(planned.body.catalog,null);
assert.equal((await post('merge',params)).status,409,'partial coverage cannot produce gates');
let firstClaim;
for(const[index,circle]of plan.circles.entries()){
  const claim=await post('claim',{...params,circle_index:index});assert.equal(claim.status,200);assert.equal(claim.body.census_request.url,R.request(circle).url);if(index===0)firstClaim=claim.body;
  const lat=circle.center[0],lon=circle.center[1],feature={attributes:{OBJECTID:index+1,NAME:'Road '+index},geometry:{paths:[[[lon-.002,lat-.002],[lon+.002,lat+.002]]]}},duplicate={attributes:{OBJECTID:9999,NAME:'Repeated road'},geometry:{paths:[[[-87.76,41.85],[-87.75,41.86]]]}},payload={features:[feature,duplicate]};
  if(index===0){const truncated=await post('ingest',{...params,circle_index:index,claim_id:claim.body.claim_id,census_payload:{...payload,exceededTransferLimit:true}});assert.equal(truncated.status,422);assert.match(truncated.body.error,/2,000-road/);assert.equal((await post('claim',{...params,circle_index:index})).status,409);const retry=await post('claim',{...params,circle_index:index,retry_requested:true});assert.equal(retry.body.attempt_number,2);claim.body=retry.body;}
  const ingested=await post('ingest',{...params,circle_index:index,claim_id:claim.body.claim_id,census_payload:payload});assert.equal(ingested.status,200);assert.equal(ingested.body.road_count,2);
}
const merged=await post('merge',params);assert.equal(merged.status,200);assert.equal(merged.body.catalog.search_summary.unique_roads,77);assert.equal(merged.body.catalog.search_summary.duplicate_roads_removed,75);const catalog=G.validateCatalog(merged.body.catalog);assert.equal(catalog.coverage.inner_radius_m,7*R.MILE);assert.ok(catalog.intersections.length>0);for(const p of catalog.intersections){const d=G.distanceM(plan.origin,[p.latitude,p.longitude]);assert.ok(d>=7*R.MILE&&d<=8*R.MILE);}assert.ok((await post('plan',params)).body.catalog);assert.equal((await post('claim',{...params,circle_index:0})).body.cached,true);
assert.notEqual(R.plan({...params,inner_miles:6}).id,plan.id,'inner radius is part of cache identity');
assert.throws(()=>R.normalize({features:Array(2000).fill({})}),/2,000-road/);assert.deepEqual(R.normalize({features:[]}),[]);
// Reproduce the production failure with already-saved circle pages containing
// >100,000 segments, including a road longer than a single processing chunk.
{
  const params={origin:[41.85,-87.8],inner_miles:7,outer_miles:8},plan=R.plan(params),allRoads=[];
  const insert=db.prepare('INSERT INTO intersection_catalog_pages (page_id,catalog_version,center_latitude,center_longitude,radius_m,catalog_json,acquired_at) VALUES (?,?,?,?,?,?,?)');
  for(const[index,c]of plan.circles.entries()){
    const roads=Array.from({length:10},(_,j)=>({id:'dense-'+index+'-'+j,name:'Dense Road '+index+' '+j,paths:[Array.from({length:index===0&&j===0?9000:200},(_,k)=>[Number((c.center[1]+(k%200-100)*.00002).toFixed(6)),Number((c.center[0]+j*.00003+(k%2)*.00002).toFixed(6))])]}));
    allRoads.push(...roads);insert.run(c.id,R.VERSION,...c.center,c.radius_m,JSON.stringify({schema:'survive_drive_census_circle_v1',roads}),new Date().toISOString());
  }
  const result=await post('merge',params);assert.equal(result.status,200,result.body.error);assert.ok(result.body.catalog.search_summary.segments>100000);assert.ok(result.body.catalog.search_summary.chunks_processed>1);assert.ok(result.body.catalog.intersections.length>0);
  const core=readFileSync('server/worker.js','utf8'),parser=core.slice(core.indexOf('function tigerIntersections('),core.indexOf('async function intersectionCatalog(')),ctx={};vm.createContext(ctx);vm.runInContext(core.split('\n').find(line=>line.startsWith('function earthDistance('))+'\n'+parser,ctx);
  const features=allRoads.map(r=>({attributes:{NAME:r.name},geometry:{paths:r.paths}})),spec={origin:plan.origin,radius_m:plan.radius_m,inner_radius_m:plan.inner_m,maximum_vertices:300000,maximum_segments:300000,allow_empty:true,checkpoint_seeds:new Map()};
  const expected=JSON.parse(JSON.stringify(ctx.tigerIntersections({features},spec)));
  const unique=Array.from(new Map(expected.map(p=>[p.latitude.toFixed(6)+','+p.longitude.toFixed(6),p])).values());assert.deepEqual(result.body.catalog.intersections,unique,'chunk boundaries preserve every segment and bin winner');
  const reverse=JSON.parse(JSON.stringify(ctx.tigerIntersections({features:features.slice().reverse()},{...spec,checkpoint_seeds:new Map()})));assert.deepEqual(reverse,expected,'arrival order cannot change bin winners');
  const before=db.prepare('SELECT COUNT(*) AS n FROM provider_rounds').get().n;assert.equal((await post('merge',params)).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM provider_rounds').get().n,before,'cached merge makes no Census claim');
  console.log('Dense regression: '+result.body.catalog.search_summary.segments+' segments merged in '+result.body.catalog.search_summary.chunks_processed+' chunks using saved circles.');
}
{
  const paths=[[[1,2],[3,4]],[[5,6],[7,8]]];assert.equal(R.roadKey({id:'geometry-old',paths}),R.roadKey({id:'geometry-new',paths:paths.slice().reverse().map(p=>p.slice().reverse())}),'fallback dedupe ignores path direction and multipart order');
}
// An unused reservation can be returned; a complete empty circle is valid.
{const p={origin:[10,-20],inner_miles:.25,outer_miles:.5},first=await post('claim',{...p,circle_index:0});assert.equal(first.body.attempt_number,1);assert.equal((await post('release',{...p,circle_index:0,claim_id:'wrong'})).status,409);assert.equal((await post('release',{...p,circle_index:0,claim_id:first.body.claim_id})).body.released,true);const second=await post('claim',{...p,circle_index:0});assert.equal(second.body.attempt_number,1);assert.equal((await post('ingest',{...p,circle_index:0,claim_id:second.body.claim_id,census_payload:{features:[]}})).status,200);const empty=await post('merge',p);assert.equal(empty.status,200);assert.equal(G.validateCatalog(empty.body.catalog).intersections.length,0);}
// UI orchestration: real app functions, mocked network, no paid providers.
function uiHarness({failIndex=-1,failIngestIndex=-1,delay=false,delayClaim=false,timeout=false,storage=new Map()}={}){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);},focus(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){}});return elements.get(id);};
  for(const[id,v]of Object.entries({origin:params.origin.join(','),'shotgun-inner':'7','shotgun-outer':'8'}))get(id).value=v;
  let calls=0,active=0,maxActive=0,published=0,release,released=0,releaseClaims,ingestFailures=0;const claimsWait=delayClaim?new Promise(r=>{releaseClaims=r;}):Promise.resolve();const saved=new Set(),claims=[],censusCallsByIndex=new Map();
  const context={console,URL,TextEncoder,TextDecoder,AbortSignal,setTimeout,clearTimeout,sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{getElementById:get,createElement:()=>({textContent:''})},window:{SurviveCensusRing:R,SurviveShotgun:G},state:{catalogFaultEpochs:{start:1},catalogFaults:{},catalogBusy:{},intersectionCatalogs:{},providerCalls:{Catalog:0},uncertainAttempts:[]},beginWorking:()=>()=>{},workflowPhase(){},providerCounts(){},updateNextAction(){},setCatalogRetryCue(){},notice(){},log(){},suggestShotgunGates(){published++;},catalogCovers:(origin,outer,c,inner)=>c.coverage.inner_radius_m===inner*R.MILE&&c.coverage.radius_m===outer*R.MILE,appJson:r=>r.json(),censusResponseJson:r=>r.json()};
  context.$=get;
  context.providerFetch=async(path,options)=>{const body=JSON.parse(options.body),op=path.split('/').pop();if(op==='plan')return Response.json({plan,catalog:null});if(op==='release'){released++;return Response.json({released:true});}if(op==='claim'){claims.push(body.circle_index);await claimsWait;const c=plan.circles[body.circle_index];return Response.json(saved.has(body.circle_index)?{cached:true,circle_id:c.id}:{circle_id:c.id,claim_id:c.id,attempt_number:1,census_request:R.request(c)});}if(op==='ingest'){if(body.circle_index===failIngestIndex&&ingestFailures++===0)return Response.json({error:'The road catalog storage is temporarily unavailable.'},{status:503});saved.add(body.circle_index);return Response.json({cached:true});}if(op==='merge')return Response.json({catalog:merged.body.catalog});throw Error('Unexpected API '+path);};
  context.appFetch=async url=>{const index=plan.circles.findIndex(c=>R.request(c).url===url);calls++;censusCallsByIndex.set(index,(censusCallsByIndex.get(index)??0)+1);active++;maxActive=Math.max(maxActive,active);try{if(delay&&index===0)await new Promise(r=>{release=r;});else await new Promise(r=>setTimeout(r,1));if(index===failIndex){const error=Error(timeout?'signal timed out':'Simulated Census failure');if(timeout)error.name='TimeoutError';throw error;}return Response.json({features:[]});}finally{active--;}};
  vm.createContext(context);vm.runInContext(readFileSync('dist/census-ring-ui.js','utf8'),context);return{context,run:retry=>context.checkCensusRing(params.origin,params,1,'start',retry),stats:()=>({calls,maxActive,published,saved:saved.size,claims:claims.length,released,censusCallsByIndex}),release:()=>release?.(),releaseClaims:()=>releaseClaims?.()};
}
{
  const h=uiHarness();await h.run();assert.equal(h.stats().calls,76);assert.equal(h.stats().maxActive,3);assert.equal(h.stats().published,1);assert.equal(h.context.state.providerCalls.Catalog,76);await h.run(true);assert.equal(h.stats().calls,76,'saved circles are reused');
}
{
  const h=uiHarness({failIndex:0});await h.run();assert.ok(h.stats().calls<=3,'failure stops the queue');assert.equal(h.stats().published,0);assert.ok(h.context.state.catalogFaults.start);assert.match(h.context.$('shotgun-status').textContent,/No automatic retry/);
}
{
  const h=uiHarness({failIngestIndex:0});await h.run();assert.equal(h.stats().published,0);assert.match(h.context.$('shotgun-status').textContent,/Retry first saves 1 completed Census response/);assert.equal(h.stats().censusCallsByIndex.get(0),1);
  assert.equal(h.context.state.uncertainAttempts.length,1);
  await h.run(true);assert.equal(h.stats().published,1);assert.equal(h.stats().censusCallsByIndex.get(0),1,'a database save failure must not repeat the completed Census request');assert.equal(h.context.state.uncertainAttempts.length,0,'saving the held response resolves its unconfirmed outcome');
}
{
  const storage=new Map(),first=uiHarness({failIngestIndex:0,storage});await first.run();assert.equal(storage.size,1,'a completed response survives a tab reload until it is saved');
  const resumed=uiHarness({storage});await resumed.run(true);assert.equal(resumed.stats().censusCallsByIndex.get(0),undefined,'a reloaded tab saves its held Census response before requesting new circles');assert.equal(storage.size,0);
}
{
  const h=uiHarness({failIndex:2,timeout:true});await h.run();assert.equal(h.stats().published,0);assert.match(h.context.$('shotgun-status').textContent,/circle 3 of 76\. Census road request exceeded the 60-second limit\./);assert.doesNotMatch(h.context.$('shotgun-status').textContent,/signal timed out/);assert.match(h.context.$('shotgun-status').textContent,/completed circles were saved\. No automatic retry/);
}
{
  const h=uiHarness({delay:true});const run=h.run();await new Promise(r=>setTimeout(r,0));h.context.state.catalogFaultEpochs.start++;h.release();await run;assert.ok(h.stats().calls<=3,'editing cancels future circles');assert.equal(h.stats().published,0,'old results never restore gates');
}
{const h=uiHarness({delayClaim:true});const run=h.run();await new Promise(r=>setTimeout(r,0));h.context.state.catalogFaultEpochs.start++;h.releaseClaims();await run;assert.equal(h.stats().calls,0);assert.equal(h.stats().released,3,'editing returns all unused reservations');}
{const h=uiHarness({delay:true});const old=h.run();await new Promise(r=>setTimeout(r,0));h.context.state.catalogFaultEpochs.start=2;const next=h.context.checkCensusRing(params.origin,params,2,'start');h.release();await Promise.all([old,next]);assert.equal(h.stats().published,1);assert.equal(h.stats().calls,76,'new GO waits for old in-flight circles and reuses them');assert.equal(h.stats().maxActive,3);}
console.log('Passed circle coverage through 20 miles, 76-circle 7–8 mile ring, durable claims and retry, cache resume, road deduplication, ring clipping, incomplete-result rejection, concurrency=3, failure stop, and edit cancellation. Live provider calls: 0.');
