import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from './dist/server/index.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(sql){const statement=db.prepare(sql);return{args:[],bind(...args){this.args=args;return this;},first(){return statement.get(...this.args)??null;},execute(){if(statement.columns().length)return{results:statement.all(...this.args)};statement.run(...this.args);return{results:[]};}};}
const env={DB:{prepare,batch(statements){return statements.map(s=>s.execute());}}};
const origin='https://test.example';
const post=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
const originalFetch=globalThis.fetch;let censusCalls=0,hereCalls=0,rentcastCalls=0,censusMode='complete';
globalThis.fetch=async(input,options)=>{
  const url=new URL(input);
  if(url.origin==='https://router.hereapi.com'){hereCalls++;throw Error('Unexpected HERE request');}
  if(url.origin==='https://api.rentcast.io'){rentcastCalls++;throw Error('Unexpected RentCast request');}
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(url.origin,'https://tigerweb.geo.census.gov');assert.equal(url.pathname,'/arcgis/rest/services/TIGERweb/Transportation/MapServer/7/query');assert.equal(options.headers.Accept,'application/json');assert.equal(options.body,undefined);const params=url.searchParams;assert.equal(params.get('f'),'json');assert.equal(params.get('outFields'),'BASENAME,NAME');assert.equal(params.get('geometryType'),'esriGeometryPolyline');const queryGeometry=JSON.parse(params.get('geometry'));assert.equal(queryGeometry.paths.length,32);assert.ok(queryGeometry.paths.every(path=>path.length===2));censusCalls++;
  const radialGeometry=JSON.parse(params.get('geometry')),lon=radialGeometry.paths[0][0][0],lat=radialGeometry.paths[0][0][1];
  if(censusMode==='http-error')return new Response('upstream failure details must not be reflected',{status:503,headers:{'content-type':'text/plain'}});
  if(censusMode==='service-error')return Response.json({error:{code:400,message:'raw service details must not be reflected'}});
  if(censusMode==='html-200')return new Response('<!DOCTYPE html><title>temporary upstream page</title>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  if(censusMode==='empty-200')return new Response('',{status:200,headers:{'content-type':'application/json'}});
  if(censusMode==='invalid-json')return new Response('{"features":',{status:200,headers:{'content-type':'application/json'}});
  if(censusMode==='oversized')return new Response('{"features":[],"padding":"'+'x'.repeat(5*1024*1024)+'"}',{status:200,headers:{'content-type':'application/json'}});
  if(censusMode==='body-read-failure')return new Response(new ReadableStream({start(controller){controller.error(new Error('simulated stream failure'));}}),{status:200,headers:{'content-type':'application/json'}});
  const features=[];
  for(const [dy,dx] of [[.006,0],[0,.006],[-.006,0],[0,-.006]]){
    const point=[lon+dx,lat+dy];
    features.push({type:'Feature',properties:{NAME:'North-South '+dy+' '+dx},geometry:{type:'LineString',coordinates:[[point[0],point[1]-.001],point]}});
    features.push({type:'Feature',properties:{NAME:'East-West '+dy+' '+dx},geometry:{type:'LineString',coordinates:[[point[0]-.001,point[1]],point]}});
  }
  const nativeEsri=items=>items.map((f,i)=>({attributes:{NAME:f.properties.NAME,OID:i+1},geometry:{paths:[f.geometry.type==='MultiLineString'?f.geometry.coordinates[0]:f.geometry.coordinates]}}));
  if(censusMode==='top-level-truncated')return Response.json({features:nativeEsri(features),exceededTransferLimit:true});
  if(censusMode==='record-cap')return Response.json({features:Array.from({length:2000},(_,i)=>nativeEsri(features)[i%features.length])});
  if(censusMode==='fullname-multiline')return Response.json({type:'FeatureCollection',features:features.map(f=>({type:'Feature',properties:{FULLNAME:f.properties.NAME},geometry:{type:'MultiLineString',coordinates:[f.geometry.coordinates]}}))});
  if(censusMode==='esri-paths')return Response.json({features:features.map((f,i)=>({attributes:{FULL_NAME:f.properties.NAME,OBJECTID:i+1},geometry:{paths:[f.geometry.coordinates]}}))});
  if(censusMode==='crossing-between-vertices')return Response.json({features:nativeEsri([
    {type:'Feature',properties:{NAME:'Diagonal North'},geometry:{type:'LineString',coordinates:[[lon-.01,lat-.01],[lon+.01,lat+.01]]}},
    {type:'Feature',properties:{NAME:'Diagonal South'},geometry:{type:'LineString',coordinates:[[lon-.01,lat+.01],[lon+.01,lat-.01]]}}
  ])});
  if(censusMode==='parallel-aliases')return Response.json({features:nativeEsri([
    {type:'Feature',properties:{NAME:'Cicero Ave'},geometry:{type:'LineString',coordinates:[[lon-.01,lat],[lon,lat],[lon+.01,lat]]}},
    {type:'Feature',properties:{NAME:'State Rte 50'},geometry:{type:'LineString',coordinates:[[lon-.01,lat],[lon,lat],[lon+.01,lat]]}},
    {type:'Feature',properties:{NAME:'Cross Street'},geometry:{type:'LineString',coordinates:[[lon,lat-.01],[lon,lat],[lon,lat+.01]]}}
  ])});
  if(censusMode==='dense-local-roads')return Response.json({features:nativeEsri(Array.from({length:1500},(_,i)=>{const angle=i*Math.PI/1500,offset=((i%31)-15)*.00002;return{type:'Feature',properties:{NAME:'Dense Local Road '+i},geometry:{type:'LineString',coordinates:[[lon-.04*Math.cos(angle)+offset,lat-.03*Math.sin(angle)],[lon+.04*Math.cos(angle)+offset,lat+.03*Math.sin(angle)]]}};}))});
  if(censusMode==='radial-major-roads')return Response.json({features:nativeEsri(Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4;return{type:'Feature',properties:{NAME:'Radial Road '+(i+1)},geometry:{type:'LineString',coordinates:[[lon,lat],[lon+.06*Math.sin(angle),lat+.045*Math.cos(angle)]]}};}))});
  return Response.json({features:nativeEsri(features)});
};
const browserCensus=descriptor=>globalThis.fetch(descriptor.url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});
async function prepareCatalog(subject){const response=await post('/api/intersections/construct',{...subject,approved:true}),body=await response.json();return{response,body};}
async function ingestCatalog(prepared,census_payload){return post('/api/intersections/ingest',{page_id:prepared.page_id,claim_id:prepared.claim_id,origin:prepared.origin,outer_miles:prepared.outer_miles,census_payload});}
async function approvedBrowserIngest(subject){const prepared=await prepareCatalog(subject);if(!prepared.response.ok||prepared.body.cached)return{...prepared,ingestResponse:null,ingestBody:prepared.body};const upstream=await browserCensus(prepared.body.census_request);if(!upstream.ok)return{...prepared,upstream,ingestResponse:null,ingestBody:null};let payload;try{payload=JSON.parse(await upstream.text());}catch{return{...prepared,upstream,ingestResponse:null,ingestBody:null};}if(payload?.error)return{...prepared,upstream,ingestResponse:null,ingestBody:null};const ingestResponse=await ingestCatalog(prepared.body,payload),ingestBody=await ingestResponse.json();return{...prepared,upstream,ingestResponse,ingestBody};}
const postRaw=(path,raw)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:raw}),env);

try{
  const subject={origin:[41.9,-87.7],outer_miles:3};
  const miss=await post('/api/intersections/lookup',subject),missBody=await miss.json();
  assert.equal(miss.status,200);assert.equal(missBody.status,'missing');assert.equal(missBody.source_attempted,false);assert.equal(missBody.source_calls,0);assert.equal(missBody.here_calls,0);assert.equal(missBody.rentcast_calls,0);assert.equal(censusCalls,0);
  const unavailableLookup=await worker.fetch(new Request(origin+'/api/intersections/lookup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(subject)}),{}),unavailableBody=await unavailableLookup.json();assert.equal(unavailableLookup.status,503);assert.match(unavailableBody.error,/road catalog check/i);assert.equal(censusCalls,0);
  const automaticClaim=await post('/api/intersections/construct',{origin:[41.90001,-87.7],outer_miles:3});
  assert.equal(automaticClaim.status,200);assert.equal((await automaticClaim.json()).source_calls,0);assert.equal(censusCalls,0);
  const beforeClaim=censusCalls,prepared=await prepareCatalog(subject);
  assert.equal(prepared.response.status,200);assert.match(prepared.body.page_id,/^tiger-v10-binned-local-/);assert.equal(prepared.body.source_attempted,false);assert.equal(prepared.body.source_calls,0);assert.equal(prepared.body.census_request.method,'GET');assert.equal(new URL(prepared.body.census_request.url).searchParams.get('f'),'json');assert.equal(censusCalls,beforeClaim);assert.ok(db.prepare('SELECT round_id FROM provider_rounds WHERE round_id = ?').get(prepared.body.page_id));
  const browserResponse=await browserCensus(prepared.body.census_request),censusPayload=await browserResponse.json();assert.equal(censusCalls,beforeClaim+1);
  const built=await ingestCatalog(prepared.body,censusPayload),builtBody=await built.json();
  assert.equal(built.status,200);assert.equal(builtBody.source_attempted,true);assert.equal(builtBody.source_calls,1);assert.equal(builtBody.here_calls,0);assert.equal(builtBody.rentcast_calls,0);assert.equal(builtBody.credential_access,false);assert.ok(builtBody.catalog.intersections.length>=4);assert.ok(builtBody.catalog.intersections.length<=480);assert.equal(builtBody.catalog.version,'tigerweb-binned-local-road-gates-v10');assert.ok(builtBody.catalog.intersections.every(g=>g.candidate_kind==='road_checkpoint'&&g.connected_roads===1));
  const cached=await post('/api/intersections/lookup',subject),cachedBody=await cached.json();
  assert.equal(cached.status,200);assert.equal(cachedBody.cached,true);assert.equal(cachedBody.source_attempted,false);assert.equal(cachedBody.source_calls,0);assert.deepEqual(cachedBody.catalog,builtBody.catalog);assert.equal(censusCalls,1);
  const repeated=await post('/api/intersections/construct',{...subject,approved:true}),repeatedBody=await repeated.json();
  assert.equal(repeated.status,200);assert.equal(repeatedBody.cached,true);assert.equal(repeatedBody.source_calls,0);assert.equal(censusCalls,1);
  for(const [index,mode]of ['top-level-truncated','record-cap'].entries()){
    censusMode=mode;const incomplete={origin:[41.91+index*.02,-87.7],outer_miles:3},callsBefore=censusCalls,result=await approvedBrowserIngest(incomplete);
    assert.equal(result.response.status,200);assert.equal(result.body.source_calls,0);assert.equal(result.ingestResponse.status,502);assert.equal(result.ingestBody.source_attempted,true);assert.equal(result.ingestBody.source_calls,1);assert.equal(result.ingestBody.failure_code,'census_incomplete_or_oversized');assert.equal(censusCalls,callsBefore+1);
    const noReplay=await prepareCatalog(incomplete);assert.equal(noReplay.response.status,409);assert.equal(noReplay.body.source_attempted,false);assert.equal(censusCalls,callsBefore+1);
    const stillMissing=await post('/api/intersections/lookup',incomplete);assert.equal((await stillMissing.json()).status,'missing');
  }
  for(const [index,mode]of ['http-error','service-error','html-200','empty-200','invalid-json','body-read-failure'].entries()){
    censusMode=mode;const failureInput={origin:[42.15+index*.02,-87.7],outer_miles:3},callsBefore=censusCalls,claim=await prepareCatalog(failureInput);
    assert.equal(claim.response.status,200);assert.equal(claim.body.source_calls,0);const response=await browserCensus(claim.body.census_request);assert.equal(censusCalls,callsBefore+1);assert.equal(response.ok,mode!=='http-error');
    try{if(response.ok)await response.text();}catch{}
    const replay=await prepareCatalog(failureInput);assert.equal(replay.response.status,409);assert.equal(replay.body.source_attempted,false);assert.ok(!JSON.stringify(replay.body).includes('temporary upstream page'));assert.ok(!JSON.stringify(replay.body).includes('upstream failure details'));assert.ok(!JSON.stringify(replay.body).includes('raw service details'));assert.ok(!JSON.stringify(replay.body).includes('simulated stream failure'));assert.equal(censusCalls,callsBefore+1);
  }
  const retrySubject={origin:[42.15,-87.7],outer_miles:3},retryLookup=await post('/api/intersections/lookup',retrySubject),retryLookupBody=await retryLookup.json();
  assert.equal(retryLookupBody.attempts_used,1);assert.equal(retryLookupBody.retry_available,true);
  const beforeRetry=censusCalls,retry2=await prepareCatalog({...retrySubject,retry_requested:true});assert.equal(retry2.response.status,200);assert.equal(retry2.body.attempt_number,2);assert.equal(retry2.body.claim_id,retry2.body.page_id+'-retry-2');assert.equal(censusCalls,beforeRetry);
  const duplicateRetry=await prepareCatalog({...retrySubject,retry_requested:true});assert.equal(duplicateRetry.response.status,200);assert.equal(duplicateRetry.body.attempt_number,3);assert.equal(duplicateRetry.body.retry_available,false);
  const exhaustedRetry=await prepareCatalog({...retrySubject,retry_requested:true});assert.equal(exhaustedRetry.response.status,409);assert.equal(exhaustedRetry.body.retry_available,false);assert.equal(censusCalls,beforeRetry);
  const exhaustedLookup=await post('/api/intersections/lookup',retrySubject);assert.equal((await exhaustedLookup.json()).attempts_used,3);
  const recoveredSubject={origin:[42.17,-87.7],outer_miles:3},recoveredRetry=await prepareCatalog({...recoveredSubject,retry_requested:true});assert.equal(recoveredRetry.response.status,200);assert.equal(recoveredRetry.body.attempt_number,2);
  censusMode='complete';const recoveredFetch=await browserCensus(recoveredRetry.body.census_request),recoveredIngest=await ingestCatalog(recoveredRetry.body,await recoveredFetch.json());assert.equal(recoveredIngest.status,200);assert.equal((await recoveredIngest.json()).catalog.intersections.length>0,true);
  censusMode='complete';
  const htmlClaim=await prepareCatalog({origin:[42.31,-87.7],outer_miles:3});await browserCensus(htmlClaim.body.census_request);
  const htmlPayload=await ingestCatalog(htmlClaim.body,'<html>private upstream response</html>'),htmlPayloadBody=await htmlPayload.json();assert.equal(htmlPayload.status,502);assert.equal(htmlPayloadBody.failure_code,'census_non_json_response');assert.equal(htmlPayloadBody.source_calls,1);assert.ok(!JSON.stringify(htmlPayloadBody).includes('private upstream response'));
  const serviceClaim=await prepareCatalog({origin:[42.32,-87.7],outer_miles:3});await browserCensus(serviceClaim.body.census_request);
  const servicePayload=await ingestCatalog(serviceClaim.body,{error:{code:400,message:'private Census details'}}),servicePayloadBody=await servicePayload.json();assert.equal(servicePayload.status,502);assert.equal(servicePayloadBody.failure_code,'census_service_error');assert.equal(servicePayloadBody.source_calls,1);assert.ok(!JSON.stringify(servicePayloadBody).includes('private Census details'));
  const malformedIngest=await postRaw('/api/intersections/ingest','<html>private malformed body</html>'),malformedIngestBody=await malformedIngest.json();assert.equal(malformedIngest.status,400);assert.ok(!JSON.stringify(malformedIngestBody).includes('private malformed body'));
  const oversizedIngest=await postRaw('/api/intersections/ingest',JSON.stringify({padding:'x'.repeat(5*1024*1024+40000)})),oversizedIngestBody=await oversizedIngest.json();assert.equal(oversizedIngest.status,400);assert.equal(oversizedIngestBody.failure_code,'census_ingest_invalid_request');
  for(const [index,mode]of ['fullname-multiline','esri-paths'].entries()){
    censusMode=mode;const varied={origin:[41.96+index*.02,-87.7],outer_miles:3},callsBefore=censusCalls,result=await approvedBrowserIngest(varied),parsedBody=result.ingestBody;
    assert.equal(result.response.status,200);assert.equal(result.ingestResponse.status,200);assert.equal(parsedBody.source_calls,1);assert.equal(censusCalls,callsBefore+1);assert.ok(parsedBody.catalog.intersections.length>=4);assert.ok(parsedBody.catalog.intersections.every(x=>typeof x.name==='string'&&x.name.length));
  }
  censusMode='dense-local-roads';const denseOrigin={origin:[42.01,-87.7],outer_miles:3},denseResult=await approvedBrowserIngest(denseOrigin),denseBody=denseResult.ingestBody;
  assert.equal(denseResult.ingestResponse.status,200);assert.equal(denseBody.source_calls,1);assert.ok(denseBody.catalog.intersections.length>0);assert.ok(denseBody.catalog.intersections.length<=480,'dense road data must remain bounded by geographic bins');assert.ok(denseBody.catalog.intersections.every(g=>g.candidate_kind==='road_checkpoint'&&g.connected_roads===1));
  censusMode='crossing-between-vertices';const crossingOrigin={origin:[42.02,-87.7],outer_miles:3},crossingResult=await approvedBrowserIngest(crossingOrigin),crossingBody=crossingResult.ingestBody;
  assert.equal(crossingResult.ingestResponse.status,200);assert.ok(crossingBody.catalog.intersections.length<=480);assert.ok(crossingBody.catalog.intersections.every(g=>g.candidate_kind==='road_checkpoint'&&!g.name.includes(' & ')),'road crossings must not trigger pairwise intersection construction');
  censusMode='parallel-aliases';const aliasOrigin={origin:[42.06,-87.7],outer_miles:3},aliasResult=await approvedBrowserIngest(aliasOrigin),aliasBody=aliasResult.ingestBody;
  assert.equal(aliasResult.ingestResponse.status,200);assert.ok(aliasBody.catalog.intersections.length<=480);assert.ok(aliasBody.catalog.intersections.every(g=>g.candidate_kind==='road_checkpoint'&&g.connected_roads===1));
  censusMode='radial-major-roads';const radialOrigin={origin:[42.04,-87.7],outer_miles:3},radialResult=await approvedBrowserIngest(radialOrigin),radialBody=radialResult.ingestBody;assert.equal(radialResult.ingestResponse.status,200);const radialVm={};vm.createContext(radialVm);vm.runInContext(readFileSync('dist/shotgun-gates.js','utf8'),radialVm);const radialSuggestions=radialVm.SurviveShotgun.suggestGates(radialBody.catalog,radialOrigin.origin,{inner_miles:2,outer_miles:3,maximum:8,sectors:8,minimum_spacing_miles:.25});assert.equal(radialSuggestions.gates.length,8,'named-road checkpoints should fill a sparse-intersection ring without another provider call');assert.ok(radialSuggestions.gates.every(g=>g.name.includes('road gate')));
  const staleOrigin={origin:[42.08,-87.7],outer_miles:3},staleLat=Number(staleOrigin.origin[0].toFixed(5)),staleLon=Number(staleOrigin.origin[1].toFixed(5)),token=n=>(n<0?'n':'p')+Math.abs(n).toFixed(5).replace('.',''),staleId='tiger-v9-radial-local-'+token(staleLat)+'-'+token(staleLon)+'-r4829',staleCatalog={...crossingBody.catalog,version:'tigerweb-radial-local-road-gates-v9'};
  db.prepare('INSERT INTO intersection_catalog_pages (page_id, catalog_version, center_latitude, center_longitude, radius_m, catalog_json, acquired_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(staleId,staleCatalog.version,staleLat,staleLon,4829,JSON.stringify(staleCatalog),new Date().toISOString());
  const staleLookup=await post('/api/intersections/lookup',staleOrigin),staleLookupBody=await staleLookup.json();assert.equal(staleLookupBody.status,'missing');assert.match(staleLookupBody.page_id,/^tiger-v10-binned-local-/);assert.equal(staleLookupBody.source_calls,0);
  const callsBeforeV10=censusCalls,v10AfterStaleV9=await prepareCatalog(staleOrigin);assert.equal(v10AfterStaleV9.response.status,200);assert.match(v10AfterStaleV9.body.page_id,/^tiger-v10-binned-local-/);assert.equal(v10AfterStaleV9.body.source_calls,0);assert.equal(censusCalls,callsBeforeV10);
  const spentV10Replay=await prepareCatalog(staleOrigin);assert.equal(spentV10Replay.response.status,409);assert.equal(censusCalls,callsBeforeV10);
  censusMode='complete';
  const catalogVm={};vm.createContext(catalogVm);vm.runInContext(readFileSync('dist/shotgun-gates.js','utf8'),catalogVm);
  assert.equal(catalogVm.SurviveShotgun.validateCatalog({...builtBody.catalog,coverage:null}).coverage,null);

  // Exercise the real UI page-fault approval flow against the mocked Worker.
  const elements=new Map();function element(){return{value:'',checked:false,children:[],listeners:{},disabled:false,hidden:false,textContent:'',classList:{add(){},remove(){},toggle(){}},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},focus(){}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  for(const [id,value]of Object.entries({'origin':'30.33,-81.65','destination':'30.4,-81.7','origin-name':'Start','destination-name':'End','departure-mode':'any','routing-mode':'fast','candidate-limit':'3','here-key':'','avm-cap':'0','shotgun-inner':'0.25','shotgun-outer':'3','shotgun-spacing':'0.25','shotgun-count':'4'}))get(id).value=value;
  const ui={crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortSignal,structuredClone,document:{getElementById:get,querySelectorAll:()=>[],createElement:element,createElementNS:element},async fetch(input,options={}){const url=new URL(input,origin);if(url.origin!==origin)return globalThis.fetch(url,options);return worker.fetch(new Request(url,{...options,headers:{...options.headers,...(options.method==='POST'?{Origin:origin}:{})}}),env);}};ui.window=ui;vm.createContext(ui);
  for(const file of ['here-decoder.js','route-avm.js','shotgun-gates.js','app.js'])vm.runInContext(readFileSync('dist/'+file,'utf8').replace(/\ninit\(\);\s*$/,''),ui);
  const app=ui.SurviveDrive,state=app.getState();state.routes=JSON.parse(readFileSync('dist/reference.json','utf8')).routes;
  state.intersectionCatalog=ui.SurviveShotgun.validateCatalog({schema:'survive_drive_intersection_catalog_v1',version:'incomplete-ui-fixture',source:'test fixture',intersections:[{id:'one',name:'One intersection',latitude:30.33,longitude:-81.65,major_rank:1,connected_roads:3}]});
  const waitForUi=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'UI Census flow did not settle');};
  const beforeUiLookup=censusCalls;app.suggestShotgunGates();
  await waitForUi(()=>state.providerCalls.Catalog===1||state.catalogFault===null&&get('shotgun-status').textContent.includes('spent'));
  assert.equal(censusCalls,beforeUiLookup+1);assert.equal(state.providerCalls.Catalog,1);assert.equal(state.providerCalls.HERE,0);assert.equal(state.providerCalls.RentCast,0);assert.equal(state.catalogFault,null);assert.ok(state.intersectionCatalog.intersections.length>=4);assert.ok(state.shotgunSuggestions?.gates.length>=4);assert.equal(get('shotgun-gate-list').children.length,state.shotgunSuggestions.gates.length);
  const afterAutomatic=censusCalls;await app.approveCatalogPageFault();assert.equal(censusCalls,afterAutomatic);assert.equal(hereCalls,0);assert.equal(rentcastCalls,0);
  get('origin').value='31.0,-81.65';censusMode='html-200';app.suggestShotgunGates();await waitForUi(()=>state.providerCalls.Catalog===2||get('shotgun-status').textContent.includes('spent'));assert.equal(censusCalls,beforeUiLookup+2);assert.equal(state.providerCalls.Catalog,2);assert.match(get('shotgun-status').textContent,/spent; no automatic retry/i);assert.ok(!get('shotgun-status').textContent.includes('temporary upstream page'));
  assert.match(get('suggest-shotgun').textContent,/Retry Start Census lookup/);
  censusMode='complete';app.suggestShotgunGates();await waitForUi(()=>state.providerCalls.Catalog===3&&!!state.shotgunSuggestions?.gates.length);assert.equal(censusCalls,beforeUiLookup+3);assert.equal(state.providerCalls.Catalog,3);assert.match(get('suggest-shotgun').textContent,/Generate Both Escape Gate Sets/);assert.equal(hereCalls,0);assert.equal(rentcastCalls,0);
  const priorSessionSubject={origin:[42.19,-87.7],outer_miles:3};await prepareCatalog(priorSessionSubject);get('origin').value='42.19,-87.7';const beforePriorSession=censusCalls;app.suggestShotgunGates();await waitForUi(()=>get('shotgun-status').textContent.includes('prior Census attempt'));assert.equal(censusCalls,beforePriorSession);assert.match(get('suggest-shotgun').textContent,/Retry Start Census lookup/);
  censusMode='complete';app.suggestShotgunGates();await waitForUi(()=>state.providerCalls.Catalog===4&&!!state.shotgunSuggestions?.gates.length);assert.equal(censusCalls,beforePriorSession+1);
  get('origin').value='31.1,-81.65';censusMode='oversized';app.suggestShotgunGates();await waitForUi(()=>state.providerCalls.Catalog===5||get('shotgun-status').textContent.includes('5 MiB'));assert.equal(censusCalls,beforePriorSession+2);assert.equal(state.providerCalls.Catalog,5);assert.match(get('shotgun-status').textContent,/exceeded the 5 MiB limit/i);assert.equal(hereCalls,0);assert.equal(rentcastCalls,0);
  console.log('Passed v10 durable binned-local claim before browser fetch, explicit Census retries capped at 3 claims per area, retry ingestion and recovery, UI retry prompts across sessions, and no HERE/RentCast calls.');
}finally{globalThis.fetch=originalFetch;db.close();}
